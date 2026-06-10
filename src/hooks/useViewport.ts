// Zoom / pan du canevas + conversion écran ↔ monde.
//
// Les coordonnées `cx, cy` passées à zoomAt/screenToWorld sont relatives au coin
// haut-gauche de l'élément SVG (clientX - rect.left). Le rendu applique la
// transformation via <g transform="translate(tx,ty) scale(scale)">.

import { useCallback, useState } from 'react';
import { ZOOM_MAX, ZOOM_MIN } from '../lib/constants';
import type { Bounds } from '../lib/geometry';

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
  /** Cadre la vue sur un rectangle monde (centré, avec marge), ex. contentBounds. */
  fitTo: (bounds: Bounds, viewW: number, viewH: number) => void;
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

  const fitTo = useCallback((b: Bounds, viewW: number, viewH: number) => {
    if (viewW <= 0 || viewH <= 0) return;
    const PAD = 48; // marge écran autour du contenu
    // On ne zoome jamais AU-DELÀ de 100 % pour cadrer (un petit réseau reste à taille naturelle).
    const scale = clamp(
      Math.min((viewW - 2 * PAD) / Math.max(b.w, 1), (viewH - 2 * PAD) / Math.max(b.h, 1), 1),
      ZOOM_MIN,
      ZOOM_MAX,
    );
    setVp({
      scale,
      tx: (viewW - b.w * scale) / 2 - b.x * scale,
      ty: (viewH - b.h * scale) / 2 - b.y * scale,
    });
  }, []);

  const reset = useCallback(() => setVp({ scale: 1, tx: 0, ty: 0 }), []);

  return { scale: vp.scale, tx: vp.tx, ty: vp.ty, zoomAt, panBy, screenToWorld, fitTo, reset };
}
