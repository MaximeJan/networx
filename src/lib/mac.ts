// Adresses MAC — fonctions PURES, sans React ni DOM.
//
// Format canonique interne : minuscules, séparées par ':' (ex. "aa:bb:cc:dd:ee:ff").
// On normalise aux frontières (saisie, désérialisation) puis on ne manipule que
// ce format. La génération accepte un RNG injectable pour des tests déterministes.

import type { Mac } from '../domain/types';

/** Adresse de diffusion Ethernet. */
export const BROADCAST_MAC: Mac = 'ff:ff:ff:ff:ff:ff';

const MAC_RE = /^([0-9a-f]{2})([:-]?)([0-9a-f]{2})\2([0-9a-f]{2})\2([0-9a-f]{2})\2([0-9a-f]{2})\2([0-9a-f]{2})$/i;

/** Vrai si `s` est une MAC valide (séparateurs ':' ou '-', ou aucun ; insensible à la casse). */
export function isValidMac(s: string): boolean {
  return MAC_RE.test(s.trim());
}

/**
 * Normalise une MAC vers le format canonique (minuscules, ':'), ou `null` si
 * invalide. Tolère les séparateurs '-' ou absents en entrée.
 */
export function normalizeMac(s: string): Mac | null {
  const hex = s.trim().replace(/[:-]/g, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(hex)) return null;
  return (hex.match(/.{2}/g) as string[]).join(':');
}

/** Vrai si c'est l'adresse de diffusion. */
export function isBroadcastMac(s: string): boolean {
  return normalizeMac(s) === BROADCAST_MAC;
}

/** Vrai si l'adresse est unicast (bit de poids faible du 1er octet à 0). */
export function isUnicastMac(s: string): boolean {
  const mac = normalizeMac(s);
  if (mac === null) return false;
  const firstOctet = parseInt(mac.slice(0, 2), 16);
  return (firstOctet & 0x01) === 0;
}

/**
 * Génère une MAC unicast « administrée localement » (bits du 1er octet : poids
 * faible = 0 → unicast, suivant = 1 → local). Déterministe si on passe `rng`.
 */
export function randomMac(rng: () => number = Math.random): Mac {
  const octets: number[] = [];
  for (let i = 0; i < 6; i++) {
    octets.push(Math.floor(rng() * 256) & 0xff);
  }
  // Premier octet : unicast (…0) + administré localement (…10).
  octets[0] = (octets[0] & 0xfc) | 0x02;
  return octets.map((o) => o.toString(16).padStart(2, '0')).join(':');
}
