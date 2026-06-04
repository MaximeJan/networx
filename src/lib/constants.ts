// Constantes globales — valeurs partagées par la logique pure et le rendu.

/** Clé de stockage de l'autosave (versionnée). */
export const STORAGE_KEY = 'networx.topology.v1';

/** Pas de la grille du canevas (px monde). */
export const GRID = 24;

/** Dimensions d'un appareil sur le canevas (px monde). */
export const DEVICE_W = 64;
export const DEVICE_H = 64;

/** Rayon d'un port (interface) dessiné sur un appareil. */
export const PORT_R = 5;

/** Espacement horizontal entre deux ports sur le bord d'un appareil. */
export const PORT_GAP = 16;

/** Bornes du zoom du canevas. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

/** Palette de couleurs proposée pour les annotations (zones, textes). */
export const ANNOTATION_COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#64748b'] as const;

/** Couleur par défaut d'une étiquette de texte. */
export const TEXT_COLOR_DEFAULT = '#1e293b';
/** Taille de police par défaut d'une étiquette de texte (px monde). */
export const TEXT_SIZE_DEFAULT = 16;
/** Couleur par défaut d'une zone. */
export const ZONE_COLOR_DEFAULT = '#0ea5e9';
/** Côté minimal d'une zone (px monde) en dessous duquel on n'en crée pas / redimensionne. */
export const ZONE_MIN_SIZE = 24;
/** Taille de base d'une zone créée par glisser-déposer (px monde) — modeste, redimensionnable. */
export const ZONE_DEFAULT_W = 192;
export const ZONE_DEFAULT_H = 120;

/** Liste runtime des AppKind valides (doit rester synchro avec le type AppKind). */
export const APP_KINDS = [
  'terminal',
  'web-browser',
  'web-server',
  'dns-server',
  'echo-server',
] as const;
