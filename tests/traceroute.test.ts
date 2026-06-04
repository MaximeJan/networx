import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, Topology } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint } from '../src/lib/topology';
import { createWorld, run, startTraceroute } from '../src/lib/engine';

function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function pc(id: string, mac: string, ip: string, gateway: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, gateway, interfaces: [iface(`${id}_e0`, mac, ip, 24)] };
}

// PC1 — R1 — PC2 (deux sous-réseaux, un routeur).
function net(): Topology {
  let t = emptyTopology();
  t = addDevice(t, pc('pc1', '02:00:00:00:00:0a', '192.168.1.10', '192.168.1.1'));
  t = addDevice(t, pc('pc2', '02:00:00:00:00:0b', '192.168.2.10', '192.168.2.1'));
  t = addDevice(t, {
    id: 'r1',
    kind: 'router',
    name: 'R1',
    x: 0,
    y: 0,
    interfaces: [
      iface('r1_e0', '02:00:00:00:00:01', '192.168.1.1', 24),
      iface('r1_e1', '02:00:00:00:00:02', '192.168.2.1', 24),
    ],
  });
  t = addLink(t, endpoint('pc1', 'pc1_e0'), endpoint('r1', 'r1_e0'))!;
  t = addLink(t, endpoint('pc2', 'pc2_e0'), endpoint('r1', 'r1_e1'))!;
  return t;
}

describe('traceroute', () => {
  it('révèle le routeur (saut 1) puis la destination', () => {
    const w = run(startTraceroute(createWorld(net()), 'pc1', '192.168.2.10', 1));
    // Saut 1 : le routeur signale TTL expiré depuis 192.168.1.1.
    expect(
      w.log.some(
        (l) =>
          l.deviceId === 'pc1' &&
          l.tag === 'icmp' &&
          /TTL expiré signalé par/.test(l.message) &&
          l.ip === '192.168.1.1' &&
          l.seq === 1,
      ),
    ).toBe(true);
    // Destination atteinte : réponse au ping depuis 192.168.2.10.
    expect(
      w.log.some(
        (l) => l.deviceId === 'pc1' && l.tag === 'icmp' && /réponse au ping/.test(l.message) && l.ip === '192.168.2.10',
      ),
    ).toBe(true);
  });
});
