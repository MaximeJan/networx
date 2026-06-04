// Géométrie des câbles pour le rendu : l'ancrage d'un lien glisse sur le bord de
// chaque appareil, face au pair, pour ne jamais faire passer un câble derrière.

import type { Endpoint, Topology } from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import { borderAnchor, deviceCenter, type Pt } from '../lib/geometry';

/** Ancrages d'un lien : point de bord de chaque appareil, dirigé vers l'autre. */
export function linkAnchors(
  topology: Topology,
  link: { a: Endpoint; b: Endpoint },
): { a: Pt; b: Pt } | null {
  const da = topology.devices.find((d) => d.id === link.a.deviceId);
  const db = topology.devices.find((d) => d.id === link.b.deviceId);
  if (!da || !db) return null;
  const defa = getDeviceDef(da.kind);
  const defb = getDeviceDef(db.kind);
  return {
    a: borderAnchor(da, defa, deviceCenter(db, defb)),
    b: borderAnchor(db, defb, deviceCenter(da, defa)),
  };
}

/** Ancrage d'un endpoint sur le bord de son appareil, face au pair. */
export function anchorOf(topology: Topology, ep: Endpoint, peer: Endpoint): Pt | null {
  const dev = topology.devices.find((d) => d.id === ep.deviceId);
  const peerDev = topology.devices.find((d) => d.id === peer.deviceId);
  if (!dev || !peerDev) return null;
  return borderAnchor(dev, getDeviceDef(dev.kind), deviceCenter(peerDev, getDeviceDef(peerDev.kind)));
}
