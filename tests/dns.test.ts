import { describe, it, expect } from 'vitest';
import type { Device, DnsRecord, NetInterface, Topology, World } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint } from '../src/lib/topology';
import { createWorld, run, startDnsLookup, startPing } from '../src/lib/engine';

function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function pc(id: string, mac: string, ip: string, dns?: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, dns, interfaces: [iface(`${id}_e0`, mac, ip, 24)] };
}
function dnsServer(id: string, mac: string, ip: string, records: DnsRecord[], recursive = false): Device {
  return {
    id,
    kind: 'pc',
    name: id,
    x: 0,
    y: 0,
    interfaces: [iface(`${id}_e0`, mac, ip, 24)],
    apps: [{ kind: 'dns-server', records, recursive }],
  };
}
const A = (name: string, ip: string): DnsRecord => ({ type: 'A', name, value: ip });
const NS = (zone: string, ip: string): DnsRecord => ({ type: 'NS', name: zone, value: ip });
const CNAME = (name: string, target: string): DnsRecord => ({ type: 'CNAME', name, value: target });
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:09:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}

// A (client), B (cible web), D (serveur DNS) sur un même switch /24.
function net(dnsForA: string | null = '192.168.1.50'): Topology {
  let t = emptyTopology();
  t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', dnsForA ?? undefined));
  t = addDevice(t, pc('B', '02:00:00:00:00:0b', '192.168.1.20'));
  t = addDevice(
    t,
    dnsServer('D', '02:00:00:00:00:0d', '192.168.1.50', [A('serveur.local', '192.168.1.20')]),
  );
  t = addDevice(t, sw('S', 4));
  t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
  t = addLink(t, endpoint('B', 'B_e0'), endpoint('S', 'S_p1'))!;
  t = addLink(t, endpoint('D', 'D_e0'), endpoint('S', 'S_p2'))!;
  return t;
}

const resolvedAt = (w: World, dev: string) =>
  w.log.find((l) => l.tag === 'dns' && l.deviceId === dev && /a pour adresse/.test(l.message));
const gotReply = (w: World, dev: string) =>
  w.log.some((l) => l.tag === 'icmp' && l.deviceId === dev && /réponse au ping/.test(l.message));

describe('résolution DNS', () => {
  it('résout un nom connu via le serveur DNS', () => {
    const w = run(startDnsLookup(createWorld(net()), 'A', 'serveur.local', 1));
    const line = resolvedAt(w, 'A');
    expect(line).toBeTruthy();
    expect(line!.ip).toBe('192.168.1.20');
    // Le serveur DNS a bien traité la requête.
    expect(w.log.some((l) => l.deviceId === 'D' && /résout/.test(l.message))).toBe(true);
    // Plus de requête en attente.
    expect(w.runtime['A'].dnsPending).toHaveLength(0);
  });

  it('signale un nom introuvable', () => {
    const w = run(startDnsLookup(createWorld(net()), 'A', 'inconnu.local', 2));
    expect(w.log.some((l) => l.deviceId === 'A' && /introuvable/.test(l.message))).toBe(true);
    expect(gotReply(w, 'A')).toBe(false);
  });

  it('échoue si aucun serveur DNS n’est configuré', () => {
    const w = run(startDnsLookup(createWorld(net(null)), 'A', 'serveur.local', 3));
    expect(w.log.some((l) => l.deviceId === 'A' && /aucun serveur DNS/.test(l.message))).toBe(true);
  });
});

describe('ping par nom (DNS puis ICMP)', () => {
  it('résout le nom puis reçoit la réponse au ping', () => {
    const w = run(startPing(createWorld(net()), 'A', 'serveur.local', 7, 7));
    expect(resolvedAt(w, 'A')?.ip).toBe('192.168.1.20');
    expect(gotReply(w, 'A')).toBe(true);
  });

  it('une IP littérale reste un ping direct (sans DNS)', () => {
    const w = run(startPing(createWorld(net()), 'A', '192.168.1.20', 8, 8));
    expect(gotReply(w, 'A')).toBe(true);
    expect(w.log.some((l) => l.tag === 'dns')).toBe(false);
  });
});

describe('CNAME (alias local)', () => {
  it('résout un alias vers l’IP de sa cible', () => {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', '192.168.1.50'));
    t = addDevice(t, dnsServer('D', '02:00:00:00:00:0d', '192.168.1.50', [A('web.local', '192.168.1.20'), CNAME('www.local', 'web.local')]));
    t = addDevice(t, sw('S', 3));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('D', 'D_e0'), endpoint('S', 'S_p1'))!;
    const w = run(startDnsLookup(createWorld(t), 'A', 'www.local', 1));
    expect(resolvedAt(w, 'A')?.ip).toBe('192.168.1.20');
  });
});

describe('hiérarchie DNS (délégation NS)', () => {
  // A → DNS1 (résolveur) ; DNS1 délègue la zone « local » à DNS2 (autoritatif).
  function hier(recursiveResolver: boolean): Topology {
    let t = emptyTopology();
    t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', '192.168.1.50'));
    t = addDevice(t, dnsServer('DNS1', '02:00:00:00:00:01', '192.168.1.50', [NS('local', '192.168.1.53')], recursiveResolver));
    t = addDevice(t, dnsServer('DNS2', '02:00:00:00:00:02', '192.168.1.53', [A('web.local', '192.168.1.20')]));
    t = addDevice(t, sw('S', 4));
    t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
    t = addLink(t, endpoint('DNS1', 'DNS1_e0'), endpoint('S', 'S_p1'))!;
    t = addLink(t, endpoint('DNS2', 'DNS2_e0'), endpoint('S', 'S_p2'))!;
    return t;
  }

  it('itératif : le client suit la délégation jusqu’au serveur autoritatif', () => {
    const w = run(startDnsLookup(createWorld(hier(false)), 'A', 'web.local', 1));
    expect(resolvedAt(w, 'A')?.ip).toBe('192.168.1.20');
    // Le client a bien suivi une délégation (référence).
    expect(w.log.some((l) => l.deviceId === 'A' && /suit la délégation/.test(l.message))).toBe(true);
  });

  it('récursif : le résolveur interroge lui-même le serveur délégué', () => {
    const w = run(startDnsLookup(createWorld(hier(true)), 'A', 'web.local', 1));
    expect(resolvedAt(w, 'A')?.ip).toBe('192.168.1.20');
    // C'est DNS1 (récursif) qui a interrogé DNS2, pas le client.
    expect(w.log.some((l) => l.deviceId === 'DNS1' && /récursif/.test(l.message))).toBe(true);
    expect(w.log.some((l) => l.deviceId === 'A' && /suit la délégation/.test(l.message))).toBe(false);
  });
});
