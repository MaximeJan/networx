// Géométrie du canevas — fonctions PURES (calcul de positions au pixel près).
//
// Elles prennent un appareil et sa taille (def {w,h}) et renvoient des
// coordonnées monde. Aucune dépendance React/DOM → testables en Vitest.

import type { Device, InterfaceId } from '../domain/types';
import { GRID, PORT_GAP } from './constants';

export interface Pt {
  x: number;
  y: number;
}

export interface PortPos extends Pt {
  interfaceId: InterfaceId;
}

/** Taille d'un appareil (sous-ensemble de DeviceDef nécessaire à la géométrie). */
export interface Size {
  w: number;
  h: number;
}

/** Arrondit une valeur au pas de grille. */
export function snap(v: number, grid: number = GRID): number {
  return Math.round(v / grid) * grid;
}

/** Centre d'un appareil. */
export function deviceCenter(device: Device, def: Size): Pt {
  return { x: device.x + def.w / 2, y: device.y + def.h / 2 };
}

/**
 * Positions des ports (interfaces) le long du bord inférieur de l'appareil,
 * centrées et espacées de PORT_GAP. Ordre = ordre des interfaces.
 */
export function devicePortPositions(device: Device, def: Size): PortPos[] {
  const n = device.interfaces.length;
  const y = device.y + def.h;
  if (n === 0) return [];
  const totalW = (n - 1) * PORT_GAP;
  const startX = device.x + def.w / 2 - totalW / 2;
  return device.interfaces.map((itf, i) => ({
    interfaceId: itf.id,
    x: startX + i * PORT_GAP,
    y,
  }));
}

/** Position d'un port précis, ou null si l'interface n'existe pas. */
export function findPortPosition(device: Device, def: Size, interfaceId: InterfaceId): Pt | null {
  const pos = devicePortPositions(device, def).find((p) => p.interfaceId === interfaceId);
  return pos ? { x: pos.x, y: pos.y } : null;
}

/** Distance euclidienne entre deux points (utile pour le hit-testing). */
export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Point d'ancrage d'un câble sur le BORD de l'appareil, dans la direction de
 * `target` (centre du pair). L'ancrage « glisse » ainsi autour du composant :
 * le câble part toujours du côté qui fait face au pair → jamais de fil derrière.
 */
export function borderAnchor(device: Device, def: Size, target: Pt): Pt {
  const cx = device.x + def.w / 2;
  const cy = device.y + def.h / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? def.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? def.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}
