import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, Topology } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint } from '../src/lib/topology';
import { createWorld, run, startPing, startDhcp, startHttpGet } from '../src/lib/engine';
import { diagnoseFailure } from '../src/lib/diagnose';

// ── Fabriques de fixtures (mêmes conventions que ping.test) ──
function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function pc(id: string, mac: string, ip: string | undefined, prefix: number | undefined, gateway?: string, dns?: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, gateway, dns, interfaces: [iface(`${id}_e0`, mac, ip, prefix)] };
}
function router(id: string, ifs: NetInterface[]): Device {
  return { id, kind: 'router', name: id, x: 0, y: 0, interfaces: ifs };
}
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:0${id.length}:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}

/** Lance un ping puis déroule la simulation jusqu'au repos, et renvoie le diagnostic. */
function pingDiag(t: Topology, src: string, target: string): string {
  const w = run(startPing(createWorld(t), src, target));
  return diagnoseFailure({ world: w, deviceId: src, kind: 'ping', target, sinceTick: 0 }).join(' ');
}

describe('diagnostic — machine source mal configurée', () => {
  it('source sans adresse IP', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', undefined, undefined));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24));
    t = addDevice(t, sw('S', 3));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
    expect(pingDiag(t, 'A', '192.168.1.20')).toMatch(/A n'a pas d'adresse IP/);
  });

  it('cible hors réseau SANS routeur sur le plan : suggère un même réseau (pas une passerelle)', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24)); // pas de gateway
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.20', 24));
    expect(pingDiag(t, 'A', '192.168.2.20')).toMatch(/aucun routeur.*MÊME réseau/s);
  });

  it('cible hors réseau AVEC un routeur : suggère la passerelle manquante', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24)); // pas de gateway
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.20', 24));
    t = addDevice(
      t,
      router('R', [
        iface('R_e0', '02:00:00:00:00:01', '192.168.1.1', 24),
        iface('R_e1', '02:00:00:00:00:02', '192.168.2.1', 24),
      ]),
    );
    expect(pingDiag(t, 'A', '192.168.2.20')).toMatch(/autre réseau.*pas de passerelle par défaut/);
  });

  it('passerelle par défaut hors du sous-réseau', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, '9.9.9.9'));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.20', 24));
    expect(pingDiag(t, 'A', '192.168.2.20')).toMatch(/passerelle 9\.9\.9\.9 .* n'est pas dans son réseau/);
  });
});

describe('diagnostic — adresse cible', () => {
  it("aucun appareil ne porte l'adresse visée", () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, '192.168.1.1'));
    expect(pingDiag(t, 'A', '203.0.113.5')).toMatch(/Aucun appareil n'a l'adresse 203\.0\.113\.5/);
  });
});

describe('diagnostic — couche liaison (ARP)', () => {
  it("cible du même réseau mais injoignable (ARP sans réponse)", () => {
    // A et B ont des IP du même réseau mais sont sur deux segments séparés.
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24));
    t = addDevice(t, sw('S', 2));
    t = addDevice(t, sw('T', 2)); // segment isolé pour B
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('T', 'T_p0'))!;
    expect(pingDiag(t, 'A', '192.168.1.20')).toMatch(/ne répond pas à la requête ARP/);
  });

  it('masques incohérents : la réponse de la cible n’a pas de chemin de retour', () => {
    // A /24 croit B local ; B /30 ne place pas A dans son réseau → réponse non routable.
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 30));
    t = addDevice(t, sw('S', 3));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
    const out = pingDiag(t, 'A', '192.168.1.20');
    expect(out).toMatch(/masque \/30/);
    expect(out).toMatch(/chemin de retour/);
  });
});

describe('diagnostic — routage (un routeur en aval)', () => {
  it('un routeur du chemin n’a aucune route vers la destination', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, '192.168.1.1'));
    t = addDevice(
      t,
      router('R1', [
        iface('R1_e0', '02:00:00:00:00:01', '192.168.1.1', 24),
        iface('R1_e1', '02:00:00:00:00:02', '10.0.0.1', 30),
      ]),
    );
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.10', 24)); // existe mais hors de portée de R1
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('R1', 'R1_e0'))!;
    const out = pingDiag(t, 'A', '192.168.2.10');
    expect(out).toMatch(/R1 n'a aucune route vers 192\.168\.2\.10/);
    expect(out).toMatch(/table de routage|passerelle/);
  });
});

describe('diagnostic — DHCP', () => {
  it('aucun serveur DHCP ne répond', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', undefined, undefined));
    t = addDevice(t, sw('S', 2));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    const w = run(startDhcp(createWorld(t), 'A', 1));
    const out = diagnoseFailure({ world: w, deviceId: 'A', kind: 'dhcp', target: 'DHCP', sinceTick: 0 }).join(' ');
    expect(out).toMatch(/Aucune réponse DHCP/);
    expect(out).toMatch(/DHCP activé/);
  });
});

describe('diagnostic — HTTP', () => {
  it('hôte joignable mais sans serveur web', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24)); // aucun logiciel serveur web
    t = addDevice(t, sw('S', 3));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
    const url = 'http://192.168.1.20/';
    const w = run(startHttpGet(createWorld(t), 'A', url, 1));
    const out = diagnoseFailure({ world: w, deviceId: 'A', kind: 'http', target: url, sinceTick: 0 }).join(' ');
    expect(out).toMatch(/ne répond pas en HTTP/);
    expect(out).toMatch(/serveur web/);
  });

  it('hôte web dans un autre réseau sans passerelle (échec réseau, pas HTTP)', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24)); // pas de passerelle
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.20', 24));
    const url = 'http://192.168.2.20/';
    const w = run(startHttpGet(createWorld(t), 'A', url, 1));
    const out = diagnoseFailure({ world: w, deviceId: 'A', kind: 'http', target: url, sinceTick: 0 }).join(' ');
    // Sans routeur sur le plan, le conseil oriente vers un réseau commun.
    expect(out).toMatch(/aucun routeur.*MÊME réseau/s);
  });
});

describe('diagnostic — DNS', () => {
  it("aucun serveur DNS n'est configuré sur la source", () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24)); // pas de dns
    const out = diagnoseFailure({
      world: createWorld(t),
      deviceId: 'A',
      kind: 'lookup',
      target: 'web.local',
      sinceTick: 0,
    }).join(' ');
    expect(out).toMatch(/Aucun serveur DNS n'est configuré/);
  });
});
