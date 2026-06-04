// Autosave en debounce : ré-enregistre la topologie peu après chaque changement.
// Le chargement initial se fait dans l'orchestrateur (loadTopology) pour éviter
// les courses au montage.

import { useEffect } from 'react';
import type { Topology } from '../domain/types';
import { saveTopology } from '../lib/storage';

export function useAutosave(topology: Topology, delay = 400, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => saveTopology(topology), delay);
    return () => window.clearTimeout(id);
  }, [topology, delay, enabled]);
}
