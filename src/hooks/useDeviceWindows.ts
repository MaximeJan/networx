// État des fenêtres d'appareils ouvertes (z-order = ordre du tableau). Utilisé
// aussi bien en Conception qu'en Simulation.

import { useCallback, useState } from 'react';

export interface DeviceWindowsState {
  ids: string[];
  open: (id: string) => void;
  focus: (id: string) => void;
  close: (id: string) => void;
}

export function useDeviceWindows(): DeviceWindowsState {
  const [ids, setIds] = useState<string[]>([]);
  const open = useCallback(
    (id: string) => setIds((w) => (w.includes(id) ? [...w.filter((x) => x !== id), id] : [...w, id])),
    [],
  );
  const focus = useCallback(
    (id: string) => setIds((w) => (w[w.length - 1] === id ? w : [...w.filter((x) => x !== id), id])),
    [],
  );
  const close = useCallback((id: string) => setIds((w) => w.filter((x) => x !== id)), []);
  return { ids, open, focus, close };
}
