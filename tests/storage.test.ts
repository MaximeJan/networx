import { describe, it, expect, afterEach } from 'vitest';
import { loadTopology, saveTopology } from '../src/lib/storage';
import { emptyTopology, addDevice } from '../src/lib/topology';
import { createDevice } from '../src/devices/registry';

function installFakeStorage() {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('storage sans localStorage (Node)', () => {
  it('loadTopology renvoie null et saveTopology ne lève pas', () => {
    expect(loadTopology()).toBeNull();
    expect(() => saveTopology(emptyTopology())).not.toThrow();
  });
});

describe('storage avec localStorage simulé', () => {
  it('fait l’aller-retour save → load', () => {
    installFakeStorage();
    const t = addDevice(emptyTopology('Réseau'), createDevice('pc', 24, 24, 'PC1'));
    saveTopology(t);
    const back = loadTopology();
    expect(back).not.toBeNull();
    expect(back!.devices).toHaveLength(1);
    expect(back!.devices[0].name).toBe('PC1');
  });
});
