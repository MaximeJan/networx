import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, RoutingMode, Topology } from '../src/domain/types';
import { addDevice, addLink, emptyTopology, endpoint, setDeviceRouting, setLinkBandwidth } from '../src/lib/topology';
import { computeDynamicRoutes, ospfCost, REFERENCE_BW } from '../src/lib/routing';
import { resolveRoute } from '../src/lib/stack/ip';

const iface = (id: string, ip?: string, prefix?: number): NetInterface => ({ id, name: id, mac: `02:00:00:00:00:0${id.slice(-1)}`, ip, prefix });

/**
 * Triangle : R1 relie LAN1 (192.168.1.0/24). R3 relie LAN3 (192.168.3.0/24).
 *   R1—R3 direct mais LENT (10 Mb/s) ; R1—R2—R3 plus rapide (1000 Mb/s chacun).
 *   RIP doit choisir R1→R3 (1 saut) ; OSPF doit choisir R1→R2→R3 (coût 2 < 100).
 */
function triangle(mode: RoutingMode): Topology {
  const r1: Device = {
    id: 'r1', kind: 'router', name: 'R1', x: 0, y: 0,
    interfaces: [iface('r1_e0', '192.168.1.1', 24), iface('r1_e1', '10.0.12.1', 30), iface('r1_e2', '10.0.13.1', 30)],
  };
  const r2: Device = {
    id: 'r2', kind: 'router', name: 'R2', x: 0, y: 0,
    interfaces: [iface('r2_e0', '10.0.12.2', 30), iface('r2_e1', '10.0.23.1', 30)],
  };
  const r3: Device = {
    id: 'r3', kind: 'router', name: 'R3', x: 0, y: 0,
    interfaces: [iface('r3_e0', '192.168.3.1', 24), iface('r3_e1', '10.0.23.2', 30), iface('r3_e2', '10.0.13.2', 30)],
  };
  let t = emptyTopology();
  t = addDevice(t, r1);
  t = addDevice(t, r2);
  t = addDevice(t, r3);
  const l12 = addLink(t, endpoint('r1', 'r1_e1'), endpoint('r2', 'r2_e0'))!;
  t = l12;
  t = addLink(t, endpoint('r2', 'r2_e1'), endpoint('r3', 'r3_e1'))!;
  t = addLink(t, endpoint('r1', 'r1_e2'), endpoint('r3', 'r3_e2'))!;
  // Débits : R1-R2 et R2-R3 rapides, R1-R3 lent.
  const byPair = (a: string, b: string) =>
    t.links.find(
      (l) =>
        (l.a.interfaceId === a && l.b.interfaceId === b) || (l.a.interfaceId === b && l.b.interfaceId === a),
    )!;
  t = setLinkBandwidth(t, byPair('r1_e1', 'r2_e0').id, 1000);
  t = setLinkBandwidth(t, byPair('r2_e1', 'r3_e1').id, 1000);
  t = setLinkBandwidth(t, byPair('r1_e2', 'r3_e2').id, 10);
  for (const id of ['r1', 'r2', 'r3']) t = setDeviceRouting(t, id, mode);
  return t;
}

describe('ospfCost', () => {
  it('coût = bande passante de référence / débit (min 1)', () => {
    expect(ospfCost(REFERENCE_BW)).toBe(1);
    expect(ospfCost(10)).toBe(REFERENCE_BW / 10);
    expect(ospfCost(undefined)).toBeGreaterThanOrEqual(1);
    expect(ospfCost(999999)).toBe(1); // jamais < 1
  });
});

describe('computeDynamicRoutes — RIP vs OSPF', () => {
  it('RIP choisit le chemin avec le moins de sauts (R1→R3 direct)', () => {
    const routes = computeDynamicRoutes(triangle('rip'));
    const r1 = routes['r1'] ?? [];
    const toLan3 = r1.find((r) => r.destination === '192.168.3.0' && r.prefix === 24);
    expect(toLan3?.gateway).toBe('10.0.13.2'); // R3 en direct
    expect(toLan3?.metric).toBe(1);
  });

  it('OSPF choisit le chemin à plus forte bande passante (R1→R2→R3)', () => {
    const routes = computeDynamicRoutes(triangle('ospf'));
    const r1 = routes['r1'] ?? [];
    const toLan3 = r1.find((r) => r.destination === '192.168.3.0' && r.prefix === 24);
    expect(toLan3?.gateway).toBe('10.0.12.2'); // via R2
    expect(toLan3?.metric).toBe(2); // 1 + 1 (deux liens 1000 Mb/s)
  });

  it('un réseau statique ne produit aucune route dynamique', () => {
    const routes = computeDynamicRoutes(triangle('static'));
    expect(Object.keys(routes)).toHaveLength(0);
  });

  it('RIP : la route inverse de R3 vers LAN1 existe aussi', () => {
    const routes = computeDynamicRoutes(triangle('rip'));
    const r3 = routes['r3'] ?? [];
    expect(r3.some((r) => r.destination === '192.168.1.0' && r.prefix === 24)).toBe(true);
  });
});

describe('resolveRoute avec routes dynamiques', () => {
  const dev: Device = {
    id: 'r', kind: 'router', name: 'R', x: 0, y: 0,
    interfaces: [iface('e0', '10.0.0.1', 30)],
  };

  it('utilise une route apprise quand il n’y a ni statique ni passerelle', () => {
    const dyn = [{ destination: '192.168.3.0', prefix: 24, gateway: '10.0.0.2', interfaceId: 'e0' }];
    expect(resolveRoute(dev, '192.168.3.5', dyn)).toEqual({ egressIfId: 'e0', nextHopIp: '10.0.0.2' });
    expect(resolveRoute(dev, '192.168.3.5', [])).toBeNull();
  });

  it('une route statique l’emporte sur une route apprise de même préfixe', () => {
    const withStatic: Device = {
      ...dev,
      routes: [{ destination: '192.168.3.0', prefix: 24, gateway: '10.0.0.9', interfaceId: 'e0' }],
    };
    const dyn = [{ destination: '192.168.3.0', prefix: 24, gateway: '10.0.0.2', interfaceId: 'e0' }];
    expect(resolveRoute(withStatic, '192.168.3.5', dyn)?.nextHopIp).toBe('10.0.0.9');
  });
});
