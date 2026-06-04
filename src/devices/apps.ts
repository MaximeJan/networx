// Catalogue des logiciels installables sur un hôte — l'équivalent applicatif du
// registre d'appareils. `available: false` = installable mais pas encore
// fonctionnel (ouvre un écran « à venir » en attendant la couche transport).

import { TerminalSquare, Globe, Server, Globe2, Repeat, type LucideIcon } from 'lucide-react';
import type { AppKind } from '../domain/types';

export interface AppDef {
  kind: AppKind;
  label: string;
  icon: LucideIcon;
  description: string;
  /** Logiciel système, présent par défaut et non désinstallable (terminal). */
  system?: boolean;
  /** Déjà fonctionnel ? Sinon ouvre un écran « à venir ». */
  available: boolean;
}

const DEFS: Record<AppKind, AppDef> = {
  terminal: {
    kind: 'terminal',
    label: 'Terminal',
    icon: TerminalSquare,
    description: 'Ligne de commande : ping, ipconfig, arp…',
    system: true,
    available: true,
  },
  'web-browser': {
    kind: 'web-browser',
    label: 'Navigateur web',
    icon: Globe,
    description: 'Consulter des pages web (HTTP), par IP ou par nom.',
    available: true,
  },
  'web-server': {
    kind: 'web-server',
    label: 'Serveur web',
    icon: Server,
    description: 'Héberger une page web accessible par son IP ou son nom.',
    available: true,
  },
  'dns-server': {
    kind: 'dns-server',
    label: 'Serveur DNS',
    icon: Globe2,
    description: 'Résoudre les noms de domaine en adresses IP (enregistrements).',
    available: true,
  },
  'echo-server': {
    kind: 'echo-server',
    label: "Serveur d'écho",
    icon: Repeat,
    description: 'Renvoie tout ce qu’il reçoit (test réseau).',
    available: false,
  },
};

/** Ordre d'affichage dans l'installateur. */
export const APP_ORDER: AppKind[] = [
  'terminal',
  'web-browser',
  'web-server',
  'dns-server',
  'echo-server',
];

export function getAppDef(kind: AppKind): AppDef {
  return DEFS[kind];
}
