// Arithmétique IPv4 / CIDR — fonctions PURES, sans React ni DOM.
//
// C'est l'équivalent réseau du `bits.ts` de Logix : un socle déterministe,
// testé à froid, sur lequel s'appuieront le routage (Phase 4) et la config
// d'interface (Phase 2). On travaille en entiers 32 bits NON signés : toujours
// `>>> 0` après une opération bit-à-bit pour rester dans [0, 2^32).

import type { Ip } from '../domain/types';

const OCTET = /^\d{1,3}$/;

/** Vrai si `s` est une IPv4 valide (4 octets 0-255, sans zéro de tête superflu). */
export function isValidIp(s: string): boolean {
  return parseIp(s) !== null;
}

/**
 * Convertit une IPv4 pointée en entier 32 bits non signé, ou `null` si invalide.
 * Refuse les zéros de tête ("01", "007") pour rester strict et pédagogique.
 */
export function parseIp(s: string): number | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!OCTET.test(part)) return null;
    if (part.length > 1 && part[0] === '0') return null; // zéro de tête
    const n = Number(part);
    if (n > 255) return null;
    acc = (acc * 256 + n) >>> 0;
  }
  return acc >>> 0;
}

/** Convertit un entier 32 bits non signé en IPv4 pointée. */
export function formatIp(n: number): Ip {
  const u = n >>> 0;
  return [(u >>> 24) & 0xff, (u >>> 16) & 0xff, (u >>> 8) & 0xff, u & 0xff].join('.');
}

/** Vrai si le préfixe CIDR est un entier dans [0, 32]. */
export function isValidPrefix(prefix: number): boolean {
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}

/** Masque entier 32 bits non signé pour un préfixe donné (0 → 0, 32 → 0xffffffff). */
export function maskInt(prefix: number): number {
  // ⚠ En JS, `x << 32` décale en réalité de 0 (le compte est masqué sur 5 bits) :
  // on traite donc prefix=0 à part pour ne pas obtenir 0xffffffff par erreur.
  if (prefix <= 0) return 0;
  if (prefix >= 32) return 0xffffffff;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

/** Masque pointé pour un préfixe, ex. 24 → "255.255.255.0". */
export function prefixToMask(prefix: number): string {
  return formatIp(maskInt(prefix));
}

/** Vrai si `s` est un masque pointé valide (suite contiguë de 1 puis de 0). */
export function isValidMask(s: string): boolean {
  return maskToPrefix(s) !== null;
}

/**
 * Longueur de préfixe d'un masque pointé, ou `null` si le masque n'est pas
 * contigu (ex. "255.0.255.0") ou invalide.
 */
export function maskToPrefix(mask: string): number | null {
  const n = parseIp(mask);
  if (n === null) return null;
  const u = n >>> 0;
  if (u === 0) return 0;
  // Un masque valide est une suite de 1 suivie d'une suite de 0 :
  // son complément + 1 doit être une puissance de deux.
  const inverted = (~u >>> 0) + 1;
  if ((inverted & (inverted - 1)) !== 0) return null; // pas une puissance de 2 ⇒ non contigu
  // Compte les bits à 1.
  let prefix = 0;
  let v = u;
  while (v & 0x80000000) {
    prefix++;
    v = (v << 1) >>> 0;
  }
  return prefix;
}

/** Adresse réseau (IP & masque), en notation pointée. */
export function networkAddress(ip: Ip, prefix: number): Ip {
  const n = parseIp(ip);
  if (n === null) throw new Error(`IP invalide : ${ip}`);
  return formatIp((n & maskInt(prefix)) >>> 0);
}

/** Adresse de diffusion (réseau | ~masque), en notation pointée. */
export function broadcastAddress(ip: Ip, prefix: number): Ip {
  const n = parseIp(ip);
  if (n === null) throw new Error(`IP invalide : ${ip}`);
  const mask = maskInt(prefix);
  return formatIp((n | (~mask >>> 0)) >>> 0);
}

/** Vrai si les deux IP appartiennent au même sous-réseau pour ce préfixe. */
export function sameSubnet(a: Ip, b: Ip, prefix: number): boolean {
  const na = parseIp(a);
  const nb = parseIp(b);
  if (na === null || nb === null) return false;
  const mask = maskInt(prefix);
  return ((na & mask) >>> 0) === ((nb & mask) >>> 0);
}

/** Vrai si `ip` appartient au réseau `network/prefix`. */
export function isInSubnet(ip: Ip, network: Ip, prefix: number): boolean {
  const nip = parseIp(ip);
  const nnet = parseIp(network);
  if (nip === null || nnet === null) return false;
  const mask = maskInt(prefix);
  return ((nip & mask) >>> 0) === ((nnet & mask) >>> 0);
}
