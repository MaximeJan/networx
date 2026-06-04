import { describe, it, expect } from 'vitest';
import type { Device, NetInterface } from '../src/domain/types';
import {
  snap,
  deviceCenter,
  devicePortPositions,
  findPortPosition,
  distance,
} from '../src/lib/geometry';

const DEF = { w: 64, h: 64 };

function itf(id: string): NetInterface {
  return { id, name: id, mac: 'aa:bb:cc:dd:ee:ff' };
}
function dev(x: number, y: number, ids: string[]): Device {
  return { id: 'd', kind: 'switch', name: 'd', x, y, interfaces: ids.map(itf) };
}

describe('snap', () => {
  it('arrondit au pas de grille (24)', () => {
    expect(snap(0)).toBe(0);
    expect(snap(10)).toBe(0);
    expect(snap(13)).toBe(24);
    expect(snap(36)).toBe(48);
    expect(snap(50, 10)).toBe(50);
  });
});

describe('deviceCenter', () => {
  it('renvoie le centre de la boîte', () => {
    expect(deviceCenter(dev(100, 200, []), DEF)).toEqual({ x: 132, y: 232 });
  });
});

describe('devicePortPositions', () => {
  it('centre un port unique sous la boîte', () => {
    const [p] = devicePortPositions(dev(0, 0, ['i1']), DEF);
    expect(p).toEqual({ interfaceId: 'i1', x: 32, y: 64 });
  });

  it('répartit N ports espacés de PORT_GAP=16, centrés', () => {
    const pts = devicePortPositions(dev(0, 0, ['a', 'b', 'c']), DEF);
    expect(pts.map((p) => p.x)).toEqual([16, 32, 48]);
    expect(pts.every((p) => p.y === 64)).toBe(true);
  });

  it('renvoie [] sans interface', () => {
    expect(devicePortPositions(dev(0, 0, []), DEF)).toEqual([]);
  });
});

describe('findPortPosition', () => {
  it('trouve un port existant et null sinon', () => {
    const d = dev(10, 10, ['x', 'y']);
    expect(findPortPosition(d, DEF, 'x')).not.toBeNull();
    expect(findPortPosition(d, DEF, 'absent')).toBeNull();
  });
});

describe('distance', () => {
  it('calcule la distance euclidienne', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
