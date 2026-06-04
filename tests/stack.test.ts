import { describe, it, expect } from 'vitest';
import type { Device } from '../src/domain/types';
import { resolveRoute } from '../src/lib/stack/ip';
import { lookupArp, withArp } from '../src/lib/stack/arp';

function dev(partial: Partial<Device> & Pick<Device, 'interfaces'>): Device {
  return { id: 'd', kind: 'pc', name: 'd', x: 0, y: 0, ...partial };
}

describe('resolveRoute', () => {
  const host = dev({
    gateway: '192.168.1.1',
    interfaces: [{ id: 'e0', name: 'eth0', mac: 'm', ip: '192.168.1.10', prefix: 24 }],
  });

  it('route en direct vers un voisin du même sous-réseau', () => {
    expect(resolveRoute(host, '192.168.1.50')).toEqual({ egressIfId: 'e0', nextHopIp: '192.168.1.50' });
  });

  it('passe par la passerelle pour une autre destination', () => {
    expect(resolveRoute(host, '8.8.8.8')).toEqual({ egressIfId: 'e0', nextHopIp: '192.168.1.1' });
  });

  it('renvoie null sans route ni passerelle', () => {
    const isolated = dev({
      interfaces: [{ id: 'e0', name: 'eth0', mac: 'm', ip: '192.168.1.10', prefix: 24 }],
    });
    expect(resolveRoute(isolated, '10.0.0.1')).toBeNull();
  });

  it('choisit la route au préfixe le plus long', () => {
    const r = dev({
      kind: 'router',
      interfaces: [
        { id: 'e0', name: 'eth0', mac: 'm0', ip: '10.0.0.1', prefix: 8 },
        { id: 'e1', name: 'eth1', mac: 'm1', ip: '172.16.0.1', prefix: 16 },
      ],
      routes: [
        { destination: '0.0.0.0', prefix: 0, gateway: '10.0.0.254', interfaceId: 'e0' },
        { destination: '192.168.5.0', prefix: 24, gateway: '172.16.0.254', interfaceId: 'e1' },
      ],
    });
    // 192.168.5.7 (hors réseaux connectés) correspond au /24 plutôt qu'au /0.
    expect(resolveRoute(r, '192.168.5.7')).toEqual({ egressIfId: 'e1', nextHopIp: '172.16.0.254' });
    // 9.9.9.9 ne tombe que dans la route par défaut /0.
    expect(resolveRoute(r, '9.9.9.9')).toEqual({ egressIfId: 'e0', nextHopIp: '10.0.0.254' });
  });
});

describe('cache ARP', () => {
  it('lookupArp / withArp', () => {
    let cache = withArp([], '10.0.0.1', 'aa', 5);
    expect(lookupArp(cache, '10.0.0.1')).toBe('aa');
    expect(lookupArp(cache, '10.0.0.2')).toBeNull();
    // Remplace une entrée existante.
    cache = withArp(cache, '10.0.0.1', 'bb', 9);
    expect(lookupArp(cache, '10.0.0.1')).toBe('bb');
    expect(cache).toHaveLength(1);
  });
});
