// Adaptateur de stockage navigateur (localStorage), tolérant aux erreurs
// (mode privé, quota, environnement sans localStorage). Sépare le « où »
// (ce module) du « format » (persist.ts).

import type { Topology } from '../domain/types';
import { STORAGE_KEY } from './constants';
import { serialize, deserialize } from './persist';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota dépassé ou stockage indisponible : on ignore silencieusement */
  }
}

/** Charge la topologie autosauvegardée, ou null si absente/illisible. */
export function loadTopology(): Topology | null {
  const raw = safeGet(STORAGE_KEY);
  return raw ? deserialize(raw) : null;
}

/** Enregistre la topologie courante. */
export function saveTopology(topo: Topology): void {
  safeSet(STORAGE_KEY, serialize(topo));
}
