// Historique undo/redo générique sur un document immuable.
//
// Deux seuls chemins de mutation (cf. conventions) :
//   • commit(updater) — changement STRUCTUREL, empilé dans l'historique.
//   • set(updater)    — changement INTERACTIF éphémère (drag…), sans historique.
// Tout l'état (présent + piles) vit dans un seul useState : pas de ref lue en
// rendu, canUndo/canRedo dérivent directement.

import { useCallback, useMemo, useState } from 'react';

type Updater<T> = T | ((prev: T) => T);

function resolve<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
}

interface HistoryState<T> {
  present: T;
  past: T[];
  future: T[];
}

const MAX_HISTORY = 100;

export interface History<T> {
  state: T;
  set: (updater: Updater<T>) => void;
  commit: (updater: Updater<T>) => void;
  undo: () => void;
  redo: () => void;
  reset: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): History<T> {
  const [h, setH] = useState<HistoryState<T>>({ present: initial, past: [], future: [] });

  const set = useCallback((updater: Updater<T>) => {
    setH((s) => ({ ...s, present: resolve(updater, s.present) }));
  }, []);

  const commit = useCallback((updater: Updater<T>) => {
    setH((s) => {
      const next = resolve(updater, s.present);
      if (next === s.present) return s; // aucun changement → pas d'entrée d'historique
      const past = [...s.past, s.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { present: next, past, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setH((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return {
        present: previous,
        past: s.past.slice(0, -1),
        future: [s.present, ...s.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setH((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        present: next,
        past: [...s.past, s.present],
        future: s.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setH({ present: next, past: [], future: [] });
  }, []);

  return useMemo(
    () => ({
      state: h.present,
      set,
      commit,
      undo,
      redo,
      reset,
      canUndo: h.past.length > 0,
      canRedo: h.future.length > 0,
    }),
    [h, set, commit, undo, redo, reset],
  );
}
