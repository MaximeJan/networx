import { describe, it, expect } from 'vitest';
import {
  BROADCAST_MAC,
  isValidMac,
  normalizeMac,
  isBroadcastMac,
  isUnicastMac,
  randomMac,
} from '../src/lib/mac';

describe('isValidMac', () => {
  it('accepte les formats courants', () => {
    expect(isValidMac('aa:bb:cc:dd:ee:ff')).toBe(true);
    expect(isValidMac('AA:BB:CC:DD:EE:FF')).toBe(true);
    expect(isValidMac('aa-bb-cc-dd-ee-ff')).toBe(true);
    expect(isValidMac('aabbccddeeff')).toBe(true);
    expect(isValidMac('  aa:bb:cc:dd:ee:ff  ')).toBe(true);
  });

  it('rejette les formats invalides', () => {
    expect(isValidMac('aa:bb:cc:dd:ee')).toBe(false); // trop court
    expect(isValidMac('gg:bb:cc:dd:ee:ff')).toBe(false); // hex invalide
    expect(isValidMac('aa:bb-cc:dd:ee:ff')).toBe(false); // séparateurs mélangés
    expect(isValidMac('')).toBe(false);
  });
});

describe('normalizeMac', () => {
  it('produit le format canonique minuscule à deux-points', () => {
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('aabbccddeeff')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('renvoie null sur entrée invalide', () => {
    expect(normalizeMac('xyz')).toBeNull();
    expect(normalizeMac('aa:bb:cc:dd:ee')).toBeNull();
  });
});

describe('broadcast / unicast', () => {
  it('isBroadcastMac', () => {
    expect(isBroadcastMac(BROADCAST_MAC)).toBe(true);
    expect(isBroadcastMac('FF-FF-FF-FF-FF-FF')).toBe(true);
    expect(isBroadcastMac('aa:bb:cc:dd:ee:ff')).toBe(false);
  });

  it('isUnicastMac distingue le bit individuel/groupe', () => {
    expect(isUnicastMac('02:00:00:00:00:00')).toBe(true); // …0 ⇒ unicast
    expect(isUnicastMac('01:00:00:00:00:00')).toBe(false); // …1 ⇒ multicast
    expect(isUnicastMac(BROADCAST_MAC)).toBe(false);
    expect(isUnicastMac('bad')).toBe(false);
  });
});

describe('randomMac', () => {
  it('génère une MAC valide, unicast et administrée localement', () => {
    for (let i = 0; i < 50; i++) {
      const mac = randomMac();
      expect(isValidMac(mac)).toBe(true);
      expect(isUnicastMac(mac)).toBe(true);
      const first = parseInt(mac.slice(0, 2), 16);
      expect(first & 0x01).toBe(0); // unicast
      expect(first & 0x02).toBe(0x02); // administrée localement
    }
  });

  it('est déterministe avec un RNG injecté', () => {
    const seq = [0.0, 0.5, 0.99, 0.25, 0.75, 0.1];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    let j = 0;
    const rng2 = () => seq[j++ % seq.length];
    expect(randomMac(rng)).toBe(randomMac(rng2));
  });

  it('force les bons bits même quand le RNG renvoie 0xff partout', () => {
    const mac = randomMac(() => 0.999999);
    const first = parseInt(mac.slice(0, 2), 16);
    expect(first & 0x03).toBe(0x02); // …10 garanti
  });
});
