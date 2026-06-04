// Raccourcis clavier globaux. Les callbacks sont lus via un ref « toujours à
// jour » pour que le listener reste stable (un seul addEventListener au montage).
// On ignore les frappes quand le focus est dans un champ de saisie.

import { useEffect, useRef } from 'react';

export interface Shortcuts {
  onDelete?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onEscape?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
}

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export function useKeyboardShortcuts(handlers: Shortcuts): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const h = ref.current;
      if (e.key === 'Escape') {
        h.onEscape?.();
        return;
      }
      if (isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        h.onUndo?.();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        h.onRedo?.();
      } else if (mod && key === 'c') {
        h.onCopy?.();
      } else if (mod && key === 'v') {
        e.preventDefault();
        h.onPaste?.();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        h.onDelete?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
