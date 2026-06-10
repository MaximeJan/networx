// Catalogue des types d'appareils — l'équivalent du dossier `gates/` de Logix.
//
// Chaque type a une définition (label FR, icône, taille, nombre d'interfaces,
// couleur, et si ses interfaces portent une config IP). `createDevice` est une
// fabrique PURE (RNG injectable) qui produit une instance Device.

import { Monitor, Network, Router, type LucideIcon } from 'lucide-react';
import type { Device, DeviceKind, NetInterface, Topology } from '../domain/types';
import { DEVICE_W, DEVICE_H } from '../lib/constants';
import { randomMac } from '../lib/mac';
import { uid } from '../lib/id';

export interface DeviceDef {
  kind: DeviceKind;
  /** Libellé affiché (FR). */
  label: string;
  /** Préfixe de nommage automatique, ex. "PC" → PC1, PC2… */
  namePrefix: string;
  icon: LucideIcon;
  w: number;
  h: number;
  /** Nombre d'interfaces créées par défaut. */
  defaultInterfaces: number;
  /** Les interfaces portent-elles une configuration IP (hôtes/routeurs) ? */
  configurable: boolean;
  /** Couleur d'accent (icône, sélection). */
  color: string;
}

const DEFS: Record<DeviceKind, DeviceDef> = {
  pc: {
    kind: 'pc',
    label: 'Ordinateur',
    namePrefix: 'PC',
    icon: Monitor,
    w: DEVICE_W,
    h: DEVICE_H,
    defaultInterfaces: 1,
    configurable: true,
    color: '#0284c7',
  },
  switch: {
    kind: 'switch',
    label: 'Commutateur',
    namePrefix: 'SW',
    icon: Network,
    w: DEVICE_W,
    h: DEVICE_H,
    defaultInterfaces: 5,
    configurable: false,
    color: '#0d9488',
  },
  router: {
    kind: 'router',
    label: 'Routeur',
    namePrefix: 'R',
    icon: Router,
    w: DEVICE_W,
    h: DEVICE_H,
    defaultInterfaces: 2,
    configurable: true,
    color: '#ea580c',
  },
};

/** Ordre d'affichage dans la palette. */
export const DEVICE_ORDER: DeviceKind[] = ['pc', 'switch', 'router'];

/** Définition d'un type d'appareil. */
export function getDeviceDef(kind: DeviceKind): DeviceDef {
  return DEFS[kind];
}

/** Crée une instance Device avec ses interfaces (MAC aléatoires, pas d'IP). */
export function createDevice(
  kind: DeviceKind,
  x: number,
  y: number,
  name: string,
  rng: () => number = Math.random,
): Device {
  const def = DEFS[kind];
  const interfaces: NetInterface[] = [];
  for (let i = 0; i < def.defaultInterfaces; i++) {
    interfaces.push({ id: uid('if'), name: `eth${i}`, mac: randomMac(rng) });
  }
  const device: Device = { id: uid('dev'), kind, name, x, y, interfaces };
  // Les ordinateurs ont un Terminal installé par défaut.
  if (kind === 'pc') device.apps = [{ kind: 'terminal' }];
  return device;
}

/** Prochain nom automatique pour ce type dans la topologie (ex. "PC2"). */
export function nextDeviceName(topo: Topology, kind: DeviceKind): string {
  const def = DEFS[kind];
  const count = topo.devices.filter((d) => d.kind === kind).length;
  return `${def.namePrefix}${count + 1}`;
}
