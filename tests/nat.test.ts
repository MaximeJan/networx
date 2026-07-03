import { describe, it, expect } from 'vitest';
import type { Device, NatConfig, NetInterface, Topology } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint, setDeviceNat } from '../src/lib/topology';
import { createWorld, run, startPing, startHttpGet } from '../src/lib/engine';
import { verifyChallenge } from '../src/lib/challenge';
import { getChallenge } from '../src/challenges';

// ── Helpers ───────────────────────────────────────────────────────────────

function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function pc(id: string, mac: string, ip: string, gw: string, browser = false): Device {
  return {
    id, kind: 'pc', name: id, x: 0, y: 0,
    gateway: gw,
    apps: browser ? [{ kind: 'terminal' }, { kind: 'web-browser' }] : [{ kind: 'terminal' }],
    interfaces: [iface(`${id}_e0`, mac, ip, 24)],
  };
}
function webHost(id: string, mac: string, ip: string, gw?: string): Device {
  return {
    id, kind: 'pc', name: id, x: 0, y: 0,
    gateway: gw,
    apps: [{ kind: 'terminal' }, { kind: 'web-server', page: '<h1>OK</h1>' }],
    interfaces: [iface(`${id}_e0`, mac, ip, 24)],
  };
}
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:09:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}
/** R1 : eth0 = LAN 192.168.1.1/24, eth1 = WAN 203.0.113.1/24. */
function router(nat?: NatConfig): Device {
  return {
    id: 'R1', kind: 'router', name: 'R1', x: 0, y: 0,
    nat,
    interfaces: [
      iface('R1_e0', '02:00:00:bb:00:01', '192.168.1.1', 24),
      iface('R1_e1', '02:00:00:bb:00:02', '203.0.113.1', 24),
    ],
  };
}

/**
 *   inside (192.168.1.0/24) ── SW1 ── R1 ── SW2 ── outside (203.0.113.0/24)
 * `insideHost` et `outsideHost` sont ajoutés par l'appelant.
 */
function wire(t: Topology, inside: Device, outside: Device, r1: Device): Topology {
  t = addDevice(t, inside);
  t = addDevice(t, r1);
  t = addDevice(t, outside);
  t = addDevice(t, sw('SW1', 3));
  t = addDevice(t, sw('SW2', 3));
  t = addLink(t, endpoint(inside.id, `${inside.id}_e0`), endpoint('SW1', 'SW1_p0'))!;
  t = addLink(t, endpoint('R1', 'R1_e0'), endpoint('SW1', 'SW1_p1'))!;
  t = addLink(t, endpoint('R1', 'R1_e1'), endpoint('SW2', 'SW2_p0'))!;
  t = addLink(t, endpoint(outside.id, `${outside.id}_e0`), endpoint('SW2', 'SW2_p1'))!;
  return t;
}

/** Scénario PAT sortant : PC1 (LAN) → WEB (WAN). */
function snatNet(nat?: NatConfig): Topology {
  return wire(
    emptyTopology(),
    pc('PC1', '02:00:00:aa:00:01', '192.168.1.10', '192.168.1.1', true),
    webHost('WEB', '02:00:00:cc:00:01', '203.0.113.10'), // pas de passerelle
    router(nat),
  );
}

const WAN: NatConfig = { wanInterfaceId: 'R1_e1' };

// ── PAT sortant (LAN → WAN) ─────────────────────────────────────────────────

describe('NAT sortant (PAT)', () => {
  it('sans NAT : WEB ne peut pas répondre à l\'IP privée → pas de réponse au ping', () => {
    const w = run(startPing(createWorld(snatNet(undefined)), 'PC1', '203.0.113.10', 1, 1));
    expect(w.log.some((l) => l.deviceId === 'PC1' && /réponse au ping/.test(l.message))).toBe(false);
  });

  it('NAT activé mais SANS interface externe désignée → toujours rien', () => {
    const w = run(startPing(createWorld(snatNet({})), 'PC1', '203.0.113.10', 1, 1));
    expect(w.log.some((l) => l.deviceId === 'PC1' && /réponse au ping/.test(l.message))).toBe(false);
  });

  it('mauvaise interface externe (le LAN) → ne résout pas le problème', () => {
    const w = run(startPing(createWorld(snatNet({ wanInterfaceId: 'R1_e0' })), 'PC1', '203.0.113.10', 1, 1));
    expect(w.log.some((l) => l.deviceId === 'PC1' && /réponse au ping/.test(l.message))).toBe(false);
  });

  it('bonne interface externe (WAN) → PC1 reçoit la réponse au ping', () => {
    const w = run(startPing(createWorld(snatNet(WAN)), 'PC1', '203.0.113.10', 1, 1));
    expect(w.log.some((l) => l.deviceId === 'PC1' && /réponse au ping/.test(l.message))).toBe(true);
  });

  it('crée une entrée dynamique dans la table NAT', () => {
    const w = run(startPing(createWorld(snatNet(WAN)), 'PC1', '203.0.113.10', 1, 1));
    expect(w.runtime['R1'].natTable.some((e) => e.proto === 'icmp' && e.privateIp === '192.168.1.10')).toBe(true);
  });

  it('WEB voit la requête venir de l\'IP PUBLIQUE, pas de l\'IP privée', () => {
    const w = run(startPing(createWorld(snatNet(WAN)), 'PC1', '203.0.113.10', 1, 1));
    expect(w.log.some((l) => l.deviceId === 'WEB' && /demande d'écho de 203\.0\.113\.1\b/.test(l.message))).toBe(true);
    expect(w.log.some((l) => l.deviceId === 'WEB' && /192\.168\.1\.10/.test(l.message))).toBe(false);
  });

  it('HTTP complet (TCP) traverse le NAT sortant', () => {
    const w = run(startHttpGet(createWorld(snatNet(WAN)), 'PC1', 'http://203.0.113.10/', 1));
    expect(w.log.some((l) => l.deviceId === 'PC1' && l.body !== undefined)).toBe(true);
  });
});

// ── Redirection de port (DNAT entrant) ──────────────────────────────────────

describe('NAT entrant (redirection de port)', () => {
  /** SRV (web, LAN) exposé ; CLIENT (WAN) charge l'IP publique du routeur. */
  function pfNet(nat?: NatConfig): Topology {
    return wire(
      emptyTopology(),
      webHost('SRV', '02:00:00:cc:00:09', '192.168.1.10', '192.168.1.1'),
      pc('CLIENT', '02:00:00:aa:00:09', '203.0.113.50', '203.0.113.1', true),
      router(nat),
    );
  }

  it('sans redirection : le client externe ne peut pas joindre le serveur privé', () => {
    const w = run(startHttpGet(createWorld(pfNet(WAN)), 'CLIENT', 'http://203.0.113.1/', 1));
    expect(w.log.some((l) => l.deviceId === 'CLIENT' && l.body !== undefined)).toBe(false);
  });

  it('avec redirection TCP 80 → 192.168.1.10:80 : le client charge la page', () => {
    const nat: NatConfig = {
      wanInterfaceId: 'R1_e1',
      portForwards: [{ proto: 'tcp', publicPort: 80, privateIp: '192.168.1.10', privatePort: 80 }],
    };
    const w = run(startHttpGet(createWorld(pfNet(nat)), 'CLIENT', 'http://203.0.113.1/', 1));
    expect(w.log.some((l) => l.deviceId === 'CLIENT' && l.body !== undefined)).toBe(true);
  });

  it('le serveur privé voit la VRAIE IP du client (DNAT ne touche que la destination)', () => {
    const nat: NatConfig = {
      wanInterfaceId: 'R1_e1',
      portForwards: [{ proto: 'tcp', publicPort: 80, privateIp: '192.168.1.10', privatePort: 80 }],
    };
    const w = run(startHttpGet(createWorld(pfNet(nat)), 'CLIENT', 'http://203.0.113.1/', 1));
    expect(w.log.some((l) => l.deviceId === 'SRV' && /SYN/.test(l.message))).toBe(true);
  });
});

// ── Mutation de topologie ───────────────────────────────────────────────────

describe('setDeviceNat', () => {
  it('active, configure puis désactive le NAT', () => {
    let t = snatNet(undefined);
    t = setDeviceNat(t, 'R1', {});
    expect(t.devices.find((d) => d.id === 'R1')?.nat).toEqual({});
    t = setDeviceNat(t, 'R1', { wanInterfaceId: 'R1_e1' });
    expect(t.devices.find((d) => d.id === 'R1')?.nat?.wanInterfaceId).toBe('R1_e1');
    t = setDeviceNat(t, 'R1', undefined);
    expect(t.devices.find((d) => d.id === 'R1')?.nat).toBeUndefined();
  });
});

// ── Défis ───────────────────────────────────────────────────────────────────

describe('défi NAT (sortant)', () => {
  it('échoue tant que l\'interface externe n\'est pas désignée', () => {
    const c = getChallenge('nat')!;
    expect(verifyChallenge(c.setup, c.goal).ok).toBe(false);
    // NAT activé mais sans WAN → toujours en échec.
    expect(verifyChallenge(setDeviceNat(c.setup, 'r1', {}), c.goal).ok).toBe(false);
  });

  it('réussit avec NAT + interface externe = eth1', () => {
    const c = getChallenge('nat')!;
    const fixed = setDeviceNat(c.setup, 'r1', { wanInterfaceId: 'r1_e1' });
    expect(verifyChallenge(fixed, c.goal).ok).toBe(true);
  });
});

describe('défi redirection de port', () => {
  it('échoue sans règle de redirection', () => {
    const c = getChallenge('nat-port')!;
    expect(verifyChallenge(c.setup, c.goal).ok).toBe(false);
  });

  it('réussit après ajout de la redirection TCP 80 → SRV', () => {
    const c = getChallenge('nat-port')!;
    const fixed = setDeviceNat(c.setup, 'r1', {
      wanInterfaceId: 'r1_e1',
      portForwards: [{ proto: 'tcp', publicPort: 80, privateIp: '192.168.1.10', privatePort: 80 }],
    });
    expect(verifyChallenge(fixed, c.goal).ok).toBe(true);
  });
});
