// Génération d'identifiants uniques (dans une session).

let counter = 0;

/** Identifiant unique court, ex. uid('dev') → "dev_l8x2_3". */
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}
