// Audit de réalisme : ces tests verrouillent les comportements « comme un vrai
// réseau » du moteur (IP source par interface de sortie, discipline ARP RFC 826,
// portée DHCP par interface, RST TCP, ICMP port injoignable, time-exceeded).

import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, Topology, World } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint } from '../src/lib/topology';
import { createWorld, emitFrame, run, startPing, startTraceroute, startDhcp, startDnsLookup, startHttpGet } from '../src/lib/engine';
import { ethernet, ipv4, icmpEcho } from '../src/lib/frames';
import { BROADCAST_MAC } from '../src/lib/mac';

function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function pc(id: string, mac: string, ip?: string, prefix?: number, extra?: Partial<Device>): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, interfaces: [iface(`${id}_e0`, mac, ip, prefix)], ...extra };
}
function router(id: string, ifs: NetInterface[], extra?: Partial<Device>): Device {
  return { id, kind: 'router', name: id, x: 0, y: 0, interfaces: ifs, ...extra };
}
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:0${id.length}:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}
const gotReply = (w: World, dev: string) =>
  w.log.some((l) => l.tag === 'icmp' && l.deviceId === dev && /réponse au ping/.test(l.message));

describe('IP source = interface de sortie (hôtes multi-interfaces)', () => {
  it('un routeur pingue un hôte SANS passerelle : la réponse revient (source correcte)', () => {
    // R a deux interfaces ; la PREMIÈRE est du mauvais côté. Si R signait son ping
    // de eth0 (10.0.0.1), B — sans passerelle — ne saurait pas répondre.
    let t = emptyTopology();
    t = addDevice(
      t,
      router('R', [
        iface('R_e0', '02:00:00:00:00:01', '10.0.0.1', 30),
        iface('R_e1', '02:00:00:00:00:02', '192.168.1.1', 24),
      ]),
    );
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.10', 24)); // pas de gateway !
    t = addLink(t, endpoint('R', 'R_e1'), endpoint('B', 'B_e0'))!;
    const w = run(startPing(createWorld(t), 'R', '192.168.1.10'));
    expect(gotReply(w, 'R')).toBe(true);
  });
});

describe('discipline ARP (RFC 826)', () => {
  it('un témoin de la requête diffusée ne met PAS l’émetteur en cache ; la cible, oui', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24));
    t = addDevice(t, pc('C', '02:00:00:00:00:0c', '192.168.1.30', 24));
    t = addDevice(t, sw('S', 4));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
    t = addLink(t, endpoint('C', 'C_e0'), endpoint('S', 'S_p2'))!;
    const w = run(startPing(createWorld(t), 'A', '192.168.1.20'));
    expect(gotReply(w, 'A')).toBe(true);
    // B (cible de la requête ARP de A) a appris A ; C (simple témoin) n'a RIEN appris.
    expect(w.runtime['B'].arpCache.some((e) => e.ip === '192.168.1.10')).toBe(true);
    expect(w.runtime['C'].arpCache).toHaveLength(0);
  });
});

describe('ping vers l’adresse de diffusion', () => {
  it('un hôte ne répond pas à une demande d’écho diffusée', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('B', 'B_e0'))!;
    const frame = ethernet(
      '02:00:00:00:00:0a',
      BROADCAST_MAC,
      'ipv4',
      ipv4('192.168.1.10', '255.255.255.255', 'icmp', icmpEcho('echo-request', 1, 1)),
    );
    const w = run(emitFrame(createWorld(t), { deviceId: 'A', interfaceId: 'A_e0' }, frame));
    expect(w.log.some((l) => l.deviceId === 'B' && /ping de diffusion/.test(l.message))).toBe(true);
    expect(gotReply(w, 'A')).toBe(false);
  });
});

describe('portée du serveur DHCP par interface', () => {
  function net(): Topology {
    let t = emptyTopology();
    t = addDevice(
      t,
      router(
        'R',
        [
          iface('R_e0', '02:00:00:00:00:01', '192.168.1.1', 24), // LAN (plage servie ici)
          iface('R_e1', '02:00:00:00:00:02', '203.0.113.1', 24), // WAN
        ],
        { dhcp: { poolStart: '192.168.1.100', poolSize: 10, prefix: 24, gateway: '192.168.1.1' } },
      ),
    );
    t = addDevice(t, pc('LAN1', '02:00:00:00:00:0a'));
    t = addDevice(t, pc('WAN1', '02:00:00:00:00:0b'));
    t = addLink(t, endpoint('LAN1', 'LAN1_e0'), endpoint('R', 'R_e0'))!;
    t = addLink(t, endpoint('WAN1', 'WAN1_e0'), endpoint('R', 'R_e1'))!;
    return t;
  }

  it('sert la plage sur l’interface du bon sous-réseau', () => {
    const w = run(startDhcp(createWorld(net()), 'LAN1', 1));
    const lan1 = w.topology.devices.find((d) => d.id === 'LAN1');
    expect(lan1?.interfaces[0].ip).toBe('192.168.1.100');
  });

  it('ignore une demande arrivée par une autre interface (ex. WAN)', () => {
    const w = run(startDhcp(createWorld(net()), 'WAN1', 2));
    const wan1 = w.topology.devices.find((d) => d.id === 'WAN1');
    expect(wan1?.interfaces[0].ip).toBeUndefined();
    expect(w.log.some((l) => l.deviceId === 'R' && /hors du réseau de la plage/.test(l.message))).toBe(true);
  });
});

describe('TCP : connexion refusée (RST) quand aucun service n’écoute', () => {
  it('un GET vers un hôte sans serveur web échoue immédiatement par RST', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, { apps: [{ kind: 'web-browser' }] }));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24)); // pas de web-server
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('B', 'B_e0'))!;
    const w = run(startHttpGet(createWorld(t), 'A', 'http://192.168.1.20/', 1));
    expect(w.log.some((l) => l.deviceId === 'B' && /refuse la connexion \(RST\)/.test(l.message))).toBe(true);
    expect(w.log.some((l) => l.deviceId === 'A' && l.tag === 'http' && /refuse la connexion/.test(l.message))).toBe(true);
    expect(w.log.some((l) => l.deviceId === 'A' && l.body !== undefined)).toBe(false);
  });
});

describe('UDP : ICMP « port injoignable » quand aucun service n’écoute', () => {
  it('une requête DNS vers un hôte sans service DNS échoue immédiatement', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, { dns: '192.168.1.20' }));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24)); // pas de dns-server
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('B', 'B_e0'))!;
    const w = run(startDnsLookup(createWorld(t), 'A', 'web.local', 7));
    expect(w.log.some((l) => l.deviceId === 'B' && /port injoignable/.test(l.message))).toBe(true);
    expect(w.log.some((l) => l.deviceId === 'A' && l.seq === 7 && /n'offre pas de service DNS/.test(l.message))).toBe(true);
    expect(w.runtime['A'].dnsPending).toHaveLength(0); // l'attente est levée tout de suite
  });
});

describe('time-exceeded émis depuis l’interface d’ENTRÉE du routeur', () => {
  it('traceroute révèle l’adresse du routeur côté source', () => {
    // La PREMIÈRE interface de R est côté destination : si le moteur signait de
    // firstIp, traceroute afficherait 192.168.2.1 au lieu de 192.168.1.1.
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, { gateway: '192.168.1.1' }));
    t = addDevice(
      t,
      router('R', [
        iface('R_far', '02:00:00:00:00:02', '192.168.2.1', 24),
        iface('R_near', '02:00:00:00:00:01', '192.168.1.1', 24),
      ]),
    );
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.10', 24, { gateway: '192.168.2.1' }));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('R', 'R_near'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('R', 'R_far'))!;
    const w = run(startTraceroute(createWorld(t), 'A', '192.168.2.10', 1, 3));
    const hop1 = w.log.find((l) => l.deviceId === 'A' && /TTL expiré signalé par/.test(l.message));
    expect(hop1?.ip).toBe('192.168.1.1');
  });
});
