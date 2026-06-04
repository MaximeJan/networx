// Zoom / pan du canevas + conversion écran ↔ monde.
//
// Les coordonnées `cx, cy` passées à zoomAt/screenToWorld sont relatives au coin
// haut-gauche de l'élément SVG (clientX - rect.left). Le rendu applique la
// transformation via <g transform="translate(tx,ty) scale(scale)">.

import { useCallback, useState } from 'react';
import { ZOOM_MAX, ZOOM_MIN } from '../lib/constants';

export interface Viewport {
  scale: number;
  tx: number;
  ty: number;
  /** Zoome d'un facteur autour du point (cx, cy) relatif au SVG. */
  zoomAt: (cx: number, cy: number, factor: number) => void;
  /** Translate la vue. */
  panBy: (dx: number, dy: number) => void;
  /** Convertit un point écran (relatif au SVG) en coordonnées monde. */
  screenToWorld: (cx: number, cy: number) => { x: number; y: number };
  reset: () => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Vp {
  scale: number;
  tx: number;
  ty: number;
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Vp>({ scale: 1, tx: 0, ty: 0 });

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setVp((v) => {
      const scale = clamp(v.scale * factor, ZOOM_MIN, ZOOM_MAX);
      // Garde fixe le point monde sous le curseur.
      const wx = (cx - v.tx) / v.scale;
      const wy = (cy - v.ty) / v.scale;
      return { scale, tx: cx - wx * scale, ty: cy - wy * scale };
    });
  }, []);

  const panBy = useCallback((dx: number, dy: number) => {
    setVp((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
  }, []);

  const screenToWorld = useCallback(
    (cx: number, cy: number) => ({ x: (cx - vp.tx) / vp.scale, y: (cy - vp.ty) / vp.scale }),
    [vp],
  );

  const reset = useCallback(() => setVp({ scale: 1, tx: 0, ty: 0 }), []);

  return { scale: vp.scale, tx: vp.tx, ty: vp.ty, zoomAt, panBy, screenToWorld, reset };
}
