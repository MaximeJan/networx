import { describe, it, expect } from 'vitest';
import { createDevice, getDeviceDef, nextDeviceName } from '../src/devices/registry';
import { emptyTopology, addDevice } from '../src/lib/topology';
import { isValidMac, isUnicastMac } from '../src/lib/mac';

// RNG déterministe (générateur recréable pour comparer deux exécutions).
function makeRng(): () => number {
  let s = 42;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('getDeviceDef', () => {
  it('expose le bon nombre d’interfaces par défaut', () => {
    expect(getDeviceDef('pc').defaultInterfaces).toBe(1);
    expect(getDeviceDef('router').defaultInterfaces).toBe(2);
    expect(getDeviceDef('switch').defaultInterfaces).toBe(5);
    expect(getDeviceDef('pc').configurable).toBe(true);
    expect(getDeviceDef('switch').configurable).toBe(false);
  });
});

describe('createDevice', () => {
  it('crée les interfaces attendues avec des MAC valides', () => {
    const sw = createDevice('switch', 0, 0, 'SW1');
    expect(sw.interfaces).toHaveLength(5);
    expect(sw.interfaces.every((i) => isValidMac(i.mac) && isUnicastMac(i.mac))).toBe(true);
    expect(sw.kind).toBe('switch');
    expect(sw.name).toBe('SW1');
  });

  it('est déterministe pour les MAC avec un RNG injecté', () => {
    const a = createDevice('router', 0, 0, 'R1', makeRng());
    const b = createDevice('router', 0, 0, 'R1', makeRng());
    expect(a.interfaces.map((i) => i.mac)).toEqual(b.interfaces.map((i) => i.mac));
  });
});

describe('nextDeviceName', () => {
  it('incrémente par type', () => {
    let t = emptyTopology();
    expect(nextDeviceName(t, 'pc')).toBe('PC1');
    t = addDevice(t, createDevice('pc', 0, 0, 'PC1'));
    expect(nextDeviceName(t, 'pc')).toBe('PC2');
    expect(nextDeviceName(t, 'switch')).toBe('SW1');
  });
});
