import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, Topology, World } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint } from '../src/lib/topology';
import { createWorld, run, startPing } from '../src/lib/engine';

// ── Fabriques de fixtures configurées ──
function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function pc(id: string, mac: string, ip: string, prefix: number, gateway?: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, gateway, interfaces: [iface(`${id}_e0`, mac, ip, prefix)] };
}
function router(id: string, ifs: NetInterface[]): Device {
  return { id, kind: 'router', name: id, x: 0, y: 0, interfaces: ifs };
}
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:0${id.length}:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}

const gotReply = (w: World, dev: string) =>
  w.log.some((l) => l.tag === 'icmp' && l.deviceId === dev && /réponse au ping/.test(l.message));
const requestSeenAt = (w: World, dev: string) =>
  w.log.find((l) => l.tag === 'icmp' && l.deviceId === dev && /demande d'écho/.test(l.message));

describe('ping même sous-réseau (avec ARP)', () => {
  function net(): Topology {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24));
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20', 24));
    t = addDevice(t, sw('S', 3));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
    return t;
  }

  it('résout l’ARP puis A reçoit la réponse de B', () => {
    const w = run(startPing(createWorld(net()), 'A', '192.168.1.20'));
    expect(gotReply(w, 'A')).toBe(true);
    expect(requestSeenAt(w, 'B')).toBeTruthy();
    // A a appris la MAC de B (cache ARP rempli par l'échange).
    expect(w.runtime['A'].arpCache.some((e) => e.ip === '192.168.1.20')).toBe(true);
    // Plus aucun paquet en attente une fois le ping terminé.
    expect(w.runtime['A'].pending).toHaveLength(0);
    expect(w.inFlight).toHaveLength(0);
  });

  it('échoue proprement vers une IP injoignable (aucune route)', () => {
    const w = run(startPing(createWorld(net()), 'A', '10.99.99.99'));
    expect(gotReply(w, 'A')).toBe(false);
    expect(w.log.some((l) => l.tag === 'drop' && /injoignable/.test(l.message))).toBe(true);
  });
});

describe('ping inter-sous-réseaux (via routeur)', () => {
  function net(): Topology {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', 24, '192.168.1.1'));
    t = addDevice(
      t,
      router('R', [
        iface('R_e0', '02:00:00:00:00:01', '192.168.1.1', 24),
        iface('R_e1', '02:00:00:00:00:02', '192.168.2.1', 24),
      ]),
    );
    t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.2.10', 24, '192.168.2.1'));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('R', 'R_e0'))!;
    t = addLink(t, endpoint('B', 'B_e0'), endpoint('R', 'R_e1'))!;
    return t;
  }

  it('A joint B à travers le routeur et reçoit la réponse', () => {
    const w = run(startPing(createWorld(net()), 'A', '192.168.2.10'));
    expect(gotReply(w, 'A')).toBe(true);
    // Le routeur a bien relayé un paquet.
    expect(w.log.some((l) => l.tag === 'forward' && l.deviceId === 'R')).toBe(true);
  });

  it('décrémente le TTL d’un saut au passage du routeur', () => {
    const w = run(startPing(createWorld(net()), 'A', '192.168.2.10'));
    // La demande d'écho arrive à B avec TTL 63 (64 - 1 routeur).
    expect(requestSeenAt(w, 'B')?.ttl).toBe(63);
  });
});
