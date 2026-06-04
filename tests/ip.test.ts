import { describe, it, expect } from 'vitest';
import {
  isValidIp,
  parseIp,
  formatIp,
  isValidPrefix,
  maskInt,
  prefixToMask,
  isValidMask,
  maskToPrefix,
  networkAddress,
  broadcastAddress,
  sameSubnet,
  isInSubnet,
} from '../src/lib/ip';

describe('parseIp / formatIp', () => {
  it('parse les adresses valides', () => {
    expect(parseIp('0.0.0.0')).toBe(0);
    expect(parseIp('255.255.255.255')).toBe(0xffffffff);
    expect(parseIp('192.168.1.10')).toBe(((192 << 24) | (168 << 16) | (1 << 8) | 10) >>> 0);
    expect(parseIp('10.0.0.1')).toBe(((10 << 24) | 1) >>> 0);
  });

  it('rejette les adresses invalides', () => {
    expect(parseIp('256.0.0.1')).toBeNull();
    expect(parseIp('1.2.3')).toBeNull();
    expect(parseIp('1.2.3.4.5')).toBeNull();
    expect(parseIp('a.b.c.d')).toBeNull();
    expect(parseIp('')).toBeNull();
    expect(parseIp('192.168.01.1')).toBeNull(); // zéro de tête
    expect(parseIp('192.168.1.')).toBeNull();
  });

  it('fait l’aller-retour parse → format', () => {
    for (const ip of ['0.0.0.0', '192.168.1.10', '8.8.8.8', '255.255.255.255']) {
      expect(formatIp(parseIp(ip) as number)).toBe(ip);
    }
  });

  it('formate en non signé même au-delà de 2^31', () => {
    expect(formatIp(0xffffffff)).toBe('255.255.255.255');
    expect(formatIp(0xc0a80101)).toBe('192.168.1.1');
  });

  it('isValidIp reflète parseIp', () => {
    expect(isValidIp('192.168.0.1')).toBe(true);
    expect(isValidIp('300.1.1.1')).toBe(false);
  });
});

describe('masques et préfixes', () => {
  it('isValidPrefix borne [0,32]', () => {
    expect(isValidPrefix(0)).toBe(true);
    expect(isValidPrefix(24)).toBe(true);
    expect(isValidPrefix(32)).toBe(true);
    expect(isValidPrefix(-1)).toBe(false);
    expect(isValidPrefix(33)).toBe(false);
    expect(isValidPrefix(24.5)).toBe(false);
  });

  it('maskInt gère les bornes (le piège du décalage de 32)', () => {
    expect(maskInt(0)).toBe(0);
    expect(maskInt(32)).toBe(0xffffffff);
    expect(maskInt(24) >>> 0).toBe(0xffffff00);
    expect(maskInt(1) >>> 0).toBe(0x80000000);
  });

  it('prefixToMask sur des valeurs connues', () => {
    expect(prefixToMask(0)).toBe('0.0.0.0');
    expect(prefixToMask(8)).toBe('255.0.0.0');
    expect(prefixToMask(16)).toBe('255.255.0.0');
    expect(prefixToMask(24)).toBe('255.255.255.0');
    expect(prefixToMask(30)).toBe('255.255.255.252');
    expect(prefixToMask(32)).toBe('255.255.255.255');
  });

  it('maskToPrefix inverse prefixToMask', () => {
    for (let p = 0; p <= 32; p++) {
      expect(maskToPrefix(prefixToMask(p))).toBe(p);
    }
  });

  it('maskToPrefix rejette les masques non contigus', () => {
    expect(maskToPrefix('255.0.255.0')).toBeNull();
    expect(maskToPrefix('255.255.255.1')).toBeNull();
    expect(maskToPrefix('0.255.255.255')).toBeNull();
    expect(maskToPrefix('999.0.0.0')).toBeNull(); // invalide tout court
  });

  it('isValidMask reflète maskToPrefix', () => {
    expect(isValidMask('255.255.255.0')).toBe(true);
    expect(isValidMask('255.0.255.0')).toBe(false);
  });
});

describe('réseau / diffusion / appartenance', () => {
  it('networkAddress', () => {
    expect(networkAddress('192.168.1.137', 24)).toBe('192.168.1.0');
    expect(networkAddress('10.1.2.3', 8)).toBe('10.0.0.0');
    expect(networkAddress('192.168.1.137', 32)).toBe('192.168.1.137');
    expect(networkAddress('192.168.1.137', 0)).toBe('0.0.0.0');
  });

  it('broadcastAddress', () => {
    expect(broadcastAddress('192.168.1.10', 24)).toBe('192.168.1.255');
    expect(broadcastAddress('10.0.0.1', 8)).toBe('10.255.255.255');
    expect(broadcastAddress('192.168.1.10', 30)).toBe('192.168.1.11');
    expect(broadcastAddress('1.2.3.4', 0)).toBe('255.255.255.255');
  });

  it('lève sur une IP invalide', () => {
    expect(() => networkAddress('nope', 24)).toThrow();
    expect(() => broadcastAddress('nope', 24)).toThrow();
  });

  it('sameSubnet', () => {
    expect(sameSubnet('192.168.1.10', '192.168.1.200', 24)).toBe(true);
    expect(sameSubnet('192.168.1.10', '192.168.2.10', 24)).toBe(false);
    expect(sameSubnet('192.168.1.10', '192.168.2.10', 16)).toBe(true);
    expect(sameSubnet('10.0.0.1', '11.0.0.1', 8)).toBe(false);
    expect(sameSubnet('bad', '10.0.0.1', 8)).toBe(false);
  });

  it('isInSubnet', () => {
    expect(isInSubnet('192.168.1.50', '192.168.1.0', 24)).toBe(true);
    expect(isInSubnet('192.168.2.50', '192.168.1.0', 24)).toBe(false);
    expect(isInSubnet('192.168.2.50', '192.168.0.0', 16)).toBe(true);
  });
});
