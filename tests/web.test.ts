import { describe, it, expect } from 'vitest';
import type { AppConfig, Device, NetInterface, Topology, World } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint } from '../src/lib/topology';
import { createWorld, run, startHttpGet } from '../src/lib/engine';

function iface(id: string, mac: string, ip?: string, prefix?: number): NetInterface {
  return { id, name: id, mac, ip, prefix };
}
function host(id: string, mac: string, ip: string, apps: AppConfig[], dns?: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, dns, apps, interfaces: [iface(`${id}_e0`, mac, ip, 24)] };
}
function pc(id: string, mac: string, ip: string, dns?: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, dns, apps: [{ kind: 'terminal' }], interfaces: [iface(`${id}_e0`, mac, ip, 24)] };
}
function sw(id: string, n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => iface(`${id}_p${i}`, `0a:00:00:00:08:0${i}`));
  return { id, kind: 'switch', name: id, x: 0, y: 0, interfaces };
}

function net(webPage?: string): Topology {
  let t = emptyTopology();
  t = addDevice(t, pc('A', '02:00:00:00:00:0a', '192.168.1.10', '192.168.1.50'));
  t = addDevice(
    t,
    host('WEB', '02:00:00:00:00:14', '192.168.1.20', [
      webPage === undefined ? { kind: 'web-server' } : { kind: 'web-server', page: webPage },
    ]),
  );
  t = addDevice(
    t,
    host('DNS', '02:00:00:00:00:32', '192.168.1.50', [
      { kind: 'dns-server', records: [{ type: 'A', name: 'web.local', value: '192.168.1.20' }] },
    ]),
  );
  t = addDevice(t, sw('S', 4));
  t = addLink(t, endpoint('A', 'A_e0'), endpoint('S', 'S_p0'))!;
  t = addLink(t, endpoint('WEB', 'WEB_e0'), endpoint('S', 'S_p1'))!;
  t = addLink(t, endpoint('DNS', 'DNS_e0'), endpoint('S', 'S_p2'))!;
  return t;
}

const pageAt = (w: World, dev: string) =>
  w.log.find((l) => l.tag === 'http' && l.deviceId === dev && l.body !== undefined);

describe('HTTP par IP', () => {
  it('récupère la page hébergée par le serveur web', () => {
    const w = run(startHttpGet(createWorld(net('<h1>Bonjour Networx</h1>')), 'A', 'http://192.168.1.20/', 1));
    const res = pageAt(w, 'A');
    expect(res).toBeTruthy();
    expect(res!.body).toContain('Bonjour Networx');
    // La poignée de main TCP a eu lieu (le serveur a répondu SYN-ACK).
    expect(w.log.some((l) => l.tag === 'tcp' && l.deviceId === 'WEB' && /SYN-ACK/.test(l.message))).toBe(true);
  });

  it('sert une page par défaut si aucune n’est configurée', () => {
    const w = run(startHttpGet(createWorld(net()), 'A', 'http://192.168.1.20/', 2));
    expect(pageAt(w, 'A')?.body).toContain('Bienvenue');
  });
});

describe('HTTP par nom (DNS + TCP)', () => {
  it('résout web.local puis récupère la page', () => {
    const w = run(startHttpGet(createWorld(net('<h1>Site DNS</h1>')), 'A', 'http://web.local/', 3));
    expect(w.log.some((l) => l.tag === 'dns' && /a pour adresse/.test(l.message))).toBe(true);
    expect(pageAt(w, 'A')?.body).toContain('Site DNS');
  });

  it('échoue si la cible n’a pas de serveur web', () => {
    // DNS pointe vers une machine sans serveur web → pas de page livrée.
    const w = run(startHttpGet(createWorld(net('x')), 'A', 'http://192.168.1.50/', 4));
    expect(pageAt(w, 'A')).toBeFalsy();
  });
});
