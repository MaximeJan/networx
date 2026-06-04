// Cache ARP — opérations PURES sur le tableau d'entrées (IP → MAC).

import type { ArpEntry, Ip, Mac } from '../../domain/types';

/** MAC connue pour une IP, ou null. */
export function lookupArp(cache: ArpEntry[], ip: Ip): Mac | null {
  return cache.find((e) => e.ip === ip)?.mac ?? null;
}

/** Renvoie un nouveau cache avec l'association ip→mac (remplace l'ancienne). */
export function withArp(cache: ArpEntry[], ip: Ip, mac: Mac, tick: number): ArpEntry[] {
  return [...cache.filter((e) => e.ip !== ip), { ip, mac, learnedAtTick: tick }];
}
