import { describe, it, expect } from 'vitest';
import type { Device, DhcpConfig, NetInterface, Topology, World } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint, findDevice, installApp } from '../src/lib/topology';
import { createWorld, run, startDhcp, startPing, reapplyDhcpLeases } from '../src/lib/engine';

function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function client(id: string, mac: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, interfaces: [iface(`${id}_e0`, mac)] };
}
function dhcpRouter(id: string, mac: string, ip: string, dhcp?: DhcpConfig): Device {
  return {
    id,
    kind: 'router',
    name: id,
    x: 0,
    y: 0,
    interfaces: [iface(`${id}_e0`, mac, ip, 24)],
    dhcp,
  };
}
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:07:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}

const POOL: DhcpConfig = {
  poolStart: '192.168.1.100',
  poolSize: 10,
  prefix: 24,
  gateway: '192.168.1.1',
  dns: '192.168.1.1',
};

function net(dhcp?: DhcpConfig): Topology {
  let t = emptyTopology();
  t = addDevice(t, client('A', '02:00:00:00:00:0a'));
  t = addDevice(t, client('B', '02:00:00:00:00:0b'));
  t = addDevice(t, dhcpRouter('SRV', '02:00:00:00:00:01', '192.168.1.1', dhcp));
  t = addDevice(t, sw('S', 4));
  t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
  t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
  t = addLink(t, endpoint('SRV', 'SRV_e0'), endpoint('S', 'S_p2'))!;
  return t;
}

const ipOf = (w: World, dev: string) => findDevice(w.topology, dev)?.interfaces[0].ip;

describe('DHCP', () => {
  it('attribue une adresse de la plage au client (DORA)', () => {
    const w = run(startDhcp(createWorld(net(POOL)), 'A', 1));
    expect(ipOf(w, 'A')).toBe('192.168.1.100');
    expect(findDevice(w.topology, 'A')?.gateway).toBe('192.168.1.1');
    expect(findDevice(w.topology, 'A')?.interfaces[0].prefix).toBe(24);
  });

  it('attribue des adresses distinctes à deux clients', () => {
    let w = run(startDhcp(createWorld(net(POOL)), 'A', 1));
    w = run(startDhcp(w, 'B', 2));
    expect(ipOf(w, 'A')).toBe('192.168.1.100');
    expect(ipOf(w, 'B')).toBe('192.168.1.101');
  });

  it('réattribue le même bail au même client', () => {
    let w = run(startDhcp(createWorld(net(POOL)), 'A', 1));
    w = run(startDhcp(w, 'A', 2));
    expect(ipOf(w, 'A')).toBe('192.168.1.100');
  });

  it('ne configure rien si le serveur DHCP n’a pas de plage', () => {
    const w = run(startDhcp(createWorld(net(undefined)), 'A', 1));
    expect(ipOf(w, 'A')).toBeUndefined();
  });

  it('conserve l’IP DHCP après resynchronisation du document (ex. install logiciel)', () => {
    let w = run(startDhcp(createWorld(net(POOL)), 'A', 1));
    expect(ipOf(w, 'A')).toBe('192.168.1.100');
    // L'utilisateur installe un logiciel → le document change → le world resynchronise.
    const docTopo = installApp(net(POOL), 'A', 'web-browser');
    w = reapplyDhcpLeases({ ...w, topology: docTopo });
    expect(ipOf(w, 'A')).toBe('192.168.1.100'); // IP préservée
    expect(findDevice(w.topology, 'A')?.apps?.some((a) => a.kind === 'web-browser')).toBe(true);
  });

  it('permet ensuite de pinguer le serveur (adresse obtenue puis ICMP)', () => {
    let w = run(startDhcp(createWorld(net(POOL)), 'A', 1));
    w = run(startPing(w, 'A', '192.168.1.1', 5, 5));
    expect(w.log.some((l) => l.tag === 'icmp' && l.deviceId === 'A' && /réponse au ping/.test(l.message))).toBe(true);
  });
});
