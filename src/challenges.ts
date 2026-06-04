// Scénarios-défis : un réseau pré-conçu (souvent incomplet/mal configuré) que
// l'élève doit compléter/configurer pour atteindre un OBJECTIF vérifiable
// automatiquement (cf. lib/challenge.ts qui rejoue la simulation).
//
// Les réseaux sont annotés (zones colorées derrière les appareils + étiquettes de
// texte) pour délimiter visuellement les sous-réseaux.

import type { Annotation, Device, Ip, NetInterface, Topology } from './domain/types';

/** Objectif d'un défi, vérifié en rejouant la simulation. */
export type Goal =
  | { kind: 'ping'; from: string; to: Ip }
  | { kind: 'http'; from: string; url: string }
  | { kind: 'dhcp'; device: string }
  | { kind: 'dns'; from: string; name: string };

export interface Challenge {
  id: string;
  title: string;
  /** Contexte/scénario en 1-2 phrases. */
  intro: string;
  /** Étapes à réaliser, présentées comme une liste numérotée. */
  steps: string[];
  /** Description de l'objectif vérifié. */
  goalText: string;
  goal: Goal;
  setup: Topology;
}

// ── Petits constructeurs pour des setups compacts ──
let macN = 0;
const mac = () => `02:00:00:aa:${(++macN).toString(16).padStart(2, '0')}:01`;
function nif(id: string, ip?: Ip, prefix?: number): NetInterface {
  return { id, name: 'eth0', mac: mac(), ip, prefix };
}
function pc(id: string, name: string, x: number, y: number, ip?: Ip, prefix?: number, extra?: Partial<Device>): Device {
  return { id, kind: 'pc', name, x, y, interfaces: [nif(`${id}_e0`, ip, prefix)], apps: [{ kind: 'terminal' }], ...extra };
}
// Un « serveur » est un ordinateur sur lequel on installe un logiciel serveur.
function host(id: string, name: string, x: number, y: number, ip: Ip, extra: Partial<Device>): Device {
  return { id, kind: 'pc', name, x, y, interfaces: [nif(`${id}_e0`, ip, 24)], apps: [{ kind: 'terminal' }], ...extra };
}
function sw(id: string, name: string, x: number, y: number, n = 5): Device {
  const interfaces = Array.from({ length: n }, (_, i) => ({ id: `${id}_p${i}`, name: `eth${i}`, mac: mac() }));
  return { id, kind: 'switch', name, x, y, interfaces };
}
const link = (id: string, a: string, ai: string, b: string, bi: string) => ({
  id,
  a: { deviceId: a, interfaceId: ai },
  b: { deviceId: b, interfaceId: bi },
});

// ── Annotations (zones colorées + étiquettes de texte) ──
const SKY = '#0ea5e9';
const GREEN = '#22c55e';
const AMBER = '#f59e0b';
const SLATE = '#64748b';
const RED = '#ef4444';
function zone(id: string, x: number, y: number, w: number, h: number, color: string, label: string): Annotation {
  return { id, kind: 'zone', x, y, w, h, color, label };
}
function text(id: string, x: number, y: number, content: string, fontSize = 13, color = '#334155'): Annotation {
  return { id, kind: 'text', x, y, text: content, color, fontSize };
}

// ───────────────────────────── Les défis ─────────────────────────────────

const cableChallenge: Challenge = {
  id: 'cable',
  title: '1 · Brancher un câble',
  intro: 'PC2 a été posé sur le plan, mais aucun câble ne le relie encore au réseau.',
  steps: [
    'Cliquez un port libre de PC2.',
    'Cliquez ensuite un port libre du commutateur SW1 pour tirer le câble.',
  ],
  goalText: 'PC1 peut envoyer un ping à PC2 (192.168.1.20).',
  goal: { kind: 'ping', from: 'pc1', to: '192.168.1.20' },
  setup: {
    name: 'Défi — brancher le câble',
    devices: [
      pc('pc1', 'PC1', 130, 140, '192.168.1.10', 24),
      pc('pc2', 'PC2', 130, 320, '192.168.1.20', 24),
      sw('sw1', 'SW1', 350, 230),
    ],
    links: [link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0')],
    annotations: [zone('z1', 96, 108, 360, 300, SKY, 'Réseau local · 192.168.1.0/24')],
  },
};

const ipChallenge: Challenge = {
  id: 'ip',
  title: '2 · Régler une adresse IP',
  intro: 'Tout est câblé, mais PC2 ne répond pas : son adresse IP appartient à un autre réseau que PC1.',
  steps: ['Sélectionnez PC2.', 'Donnez-lui l’adresse 192.168.1.20 avec le masque 255.255.255.0.'],
  goalText: 'PC1 peut envoyer un ping à 192.168.1.20.',
  goal: { kind: 'ping', from: 'pc1', to: '192.168.1.20' },
  setup: {
    name: 'Défi — adresses IP',
    devices: [
      pc('pc1', 'PC1', 130, 140, '192.168.1.10', 24),
      pc('pc2', 'PC2', 130, 320, '192.168.2.20', 24),
      sw('sw1', 'SW1', 350, 230),
    ],
    links: [link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'), link('l2', 'pc2', 'pc2_e0', 'sw1', 'sw1_p1')],
    annotations: [zone('z1', 96, 108, 360, 300, SKY, 'Réseau local · 192.168.1.0/24')],
  },
};

const maskChallenge: Challenge = {
  id: 'mask',
  title: '3 · Choisir le bon masque',
  intro:
    'PC1 et PC2 doivent former le même réseau 10.0.0.0/16. Mais le masque de PC2 est trop étroit : il pense être dans un réseau différent et ne répond pas.',
  steps: ['Sélectionnez PC2.', 'Remplacez son masque par 255.255.0.0 (préfixe /16) pour englober PC1.'],
  goalText: 'PC1 peut envoyer un ping à PC2 (10.0.1.20).',
  goal: { kind: 'ping', from: 'pc1', to: '10.0.1.20' },
  setup: {
    name: 'Défi — masque de sous-réseau',
    devices: [
      pc('pc1', 'PC1', 130, 140, '10.0.0.10', 16),
      pc('pc2', 'PC2', 130, 320, '10.0.1.20', 24), // masque trop étroit (/24)
      sw('sw1', 'SW1', 350, 230),
    ],
    links: [link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'), link('l2', 'pc2', 'pc2_e0', 'sw1', 'sw1_p1')],
    annotations: [zone('z1', 96, 108, 360, 300, SKY, 'Réseau prévu · 10.0.0.0/16')],
  },
};

const gatewayChallenge: Challenge = {
  id: 'gateway',
  title: '4 · Configurer les passerelles',
  intro:
    'Deux réseaux, chacun avec plusieurs postes, sont reliés par le routeur R1. Les nouveaux postes PC1 et PC2 ne connaissent pas leur passerelle.',
  steps: [
    'Donnez à PC1 la passerelle par défaut 192.168.1.1.',
    'Donnez à PC2 la passerelle par défaut 192.168.2.1.',
  ],
  goalText: 'PC1 peut envoyer un ping à PC2 (192.168.2.10) à travers le routeur.',
  goal: { kind: 'ping', from: 'pc1', to: '192.168.2.10' },
  setup: {
    name: 'Défi — passerelles',
    devices: [
      pc('pc1', 'PC1', 150, 120, '192.168.1.10', 24),
      pc('pca2', 'PC-A2', 150, 330, '192.168.1.11', 24, { gateway: '192.168.1.1' }),
      sw('swa', 'SW-A', 330, 225),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 520,
        y: 225,
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '192.168.2.1', prefix: 24 },
        ],
      },
      sw('swb', 'SW-B', 710, 225),
      pc('pc2', 'PC2', 890, 120, '192.168.2.10', 24),
      pc('pcb2', 'PC-B2', 890, 330, '192.168.2.11', 24, { gateway: '192.168.2.1' }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'swa', 'swa_p0'),
      link('l2', 'pca2', 'pca2_e0', 'swa', 'swa_p1'),
      link('l3', 'r1', 'r1_e0', 'swa', 'swa_p2'),
      link('l4', 'r1', 'r1_e1', 'swb', 'swb_p0'),
      link('l5', 'pc2', 'pc2_e0', 'swb', 'swb_p1'),
      link('l6', 'pcb2', 'pcb2_e0', 'swb', 'swb_p2'),
    ],
    annotations: [
      zone('za', 118, 92, 300, 330, SKY, 'LAN A · 192.168.1.0/24'),
      zone('zb', 678, 92, 300, 330, GREEN, 'LAN B · 192.168.2.0/24'),
      text('tr', 498, 318, 'Routeur R1', 12, SLATE),
    ],
  },
};

const twoRoutersChallenge: Challenge = {
  id: 'two-routers',
  title: '5 · Router entre deux routeurs',
  intro:
    'Trois réseaux : deux LAN peuplés, reliés par une liaison entre R1 et R2. Chaque routeur ignore comment atteindre le LAN situé de l’autre côté.',
  steps: [
    'Sélectionnez R1 et donnez-lui la passerelle par défaut 10.0.0.2 (l’interface de R2).',
    'Sélectionnez R2 et donnez-lui la passerelle par défaut 10.0.0.1 (l’interface de R1).',
  ],
  goalText: 'PC-A peut envoyer un ping à PC-B (10.0.2.10), à travers les deux routeurs.',
  goal: { kind: 'ping', from: 'pca', to: '10.0.2.10' },
  setup: {
    name: 'Défi — deux routeurs',
    devices: [
      pc('pca', 'PC-A', 150, 110, '10.0.1.10', 24, { gateway: '10.0.1.1' }),
      pc('pca2', 'PC-A2', 150, 320, '10.0.1.11', 24, { gateway: '10.0.1.1' }),
      sw('sw1', 'SW-A', 320, 215),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 480,
        y: 215,
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '10.0.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '10.0.0.1', prefix: 30 },
        ],
      },
      {
        id: 'r2',
        kind: 'router',
        name: 'R2',
        x: 640,
        y: 215,
        interfaces: [
          { id: 'r2_e0', name: 'eth0', mac: mac(), ip: '10.0.0.2', prefix: 30 },
          { id: 'r2_e1', name: 'eth1', mac: mac(), ip: '10.0.2.1', prefix: 24 },
        ],
      },
      sw('sw2', 'SW-B', 800, 215),
      pc('pcb', 'PC-B', 970, 110, '10.0.2.10', 24, { gateway: '10.0.2.1' }),
      pc('pcb2', 'PC-B2', 970, 320, '10.0.2.11', 24, { gateway: '10.0.2.1' }),
    ],
    links: [
      link('l1', 'pca', 'pca_e0', 'sw1', 'sw1_p0'),
      link('l2', 'pca2', 'pca2_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e0', 'sw1', 'sw1_p2'),
      link('l4', 'r1', 'r1_e1', 'r2', 'r2_e0'),
      link('l5', 'r2', 'r2_e1', 'sw2', 'sw2_p0'),
      link('l6', 'pcb', 'pcb_e0', 'sw2', 'sw2_p1'),
      link('l7', 'pcb2', 'pcb2_e0', 'sw2', 'sw2_p2'),
    ],
    annotations: [
      zone('za', 118, 80, 300, 332, SKY, 'LAN A · 10.0.1.0/24'),
      zone('zb', 768, 80, 300, 332, GREEN, 'LAN B · 10.0.2.0/24'),
      text('tr', 520, 196, '10.0.0.0/30', 12, SLATE),
    ],
  },
};

const dhcpChallenge: Challenge = {
  id: 'dhcp',
  title: '6 · Distribuer des adresses (DHCP)',
  intro:
    'Les postes du réseau démarrent sans adresse IP. Le routeur R1 peut leur en attribuer automatiquement, mais son service DHCP n’est pas configuré.',
  steps: [
    'Sélectionnez R1 et cochez « Serveur DHCP ».',
    'Réglez la plage : début 192.168.1.100, 20 adresses, préfixe /24, passerelle 192.168.1.1.',
    'Cliquez « Appliquer la plage ».',
  ],
  goalText: 'PC1 obtient une adresse IP automatiquement.',
  goal: { kind: 'dhcp', device: 'pc1' },
  setup: {
    name: 'Défi — DHCP',
    devices: [
      pc('pc1', 'PC1', 130, 110),
      pc('pc2', 'PC2', 130, 320),
      sw('sw1', 'SW1', 330, 215),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 520,
        y: 215,
        interfaces: [{ id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 }],
      },
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'pc2', 'pc2_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e0', 'sw1', 'sw1_p2'),
    ],
    annotations: [zone('z1', 96, 86, 510, 326, SKY, 'Réseau · 192.168.1.0/24 (adresses par DHCP)')],
  },
};

const dhcpOptionsChallenge: Challenge = {
  id: 'dhcp-options',
  title: '7 · Compléter les options DHCP',
  intro:
    'PC1 reçoit bien une adresse de R1, mais n’arrive pas à ouvrir http://site.local : le DHCP ne lui communique aucun serveur DNS.',
  steps: [
    'Sélectionnez R1 et ouvrez la configuration du serveur DHCP.',
    'Renseignez le DNS distribué : 192.168.1.53.',
    'Cliquez « Appliquer la plage ».',
  ],
  goalText: 'PC1 (client DHCP) peut charger http://site.local/.',
  goal: { kind: 'http', from: 'pc1', url: 'http://site.local/' },
  setup: {
    name: 'Défi — options DHCP',
    devices: [
      pc('pc1', 'PC1', 130, 110, undefined, undefined, { apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 130,
        y: 320,
        // DHCP déjà actif mais SANS option DNS : c'est la pièce manquante.
        dhcp: { poolStart: '192.168.1.100', poolSize: 20, prefix: 24, gateway: '192.168.1.1' },
        interfaces: [{ id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 }],
      },
      sw('sw1', 'SW1', 350, 215),
      host('dns1', 'DNS1', 560, 110, '192.168.1.53', {
        apps: [{ kind: 'terminal' }, { kind: 'dns-server', records: [{ type: 'A', name: 'site.local', value: '192.168.1.20' }] }],
      }),
      host('web', 'WEB', 560, 320, '192.168.1.20', {
        apps: [{ kind: 'terminal' }, { kind: 'web-server', page: '<h1>Site joignable</h1><p>Le DHCP vous a transmis la bonne adresse de serveur DNS.</p>' }],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'r1', 'r1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'dns1', 'dns1_e0', 'sw1', 'sw1_p2'),
      link('l4', 'web', 'web_e0', 'sw1', 'sw1_p3'),
    ],
    annotations: [zone('z1', 96, 86, 560, 326, SKY, 'Réseau · 192.168.1.0/24 (DHCP + DNS + Web)')],
  },
};

const dnsWebChallenge: Challenge = {
  id: 'dns-web',
  title: '8 · Donner un nom au site (DNS)',
  intro: 'Le serveur WEB héberge un site, mais le serveur DNS ne connaît pas encore le nom « site.local ».',
  steps: [
    'Passez en mode Simulation et double-cliquez DNS1.',
    'Ouvrez l’application « Serveur DNS ».',
    'Ajoutez un enregistrement A : site.local → 192.168.1.20.',
  ],
  goalText: 'PC1 peut charger http://site.local/ dans son navigateur.',
  goal: { kind: 'http', from: 'pc1', url: 'http://site.local/' },
  setup: {
    name: 'Défi — DNS et web',
    devices: [
      pc('pc1', 'PC1', 130, 110, '192.168.1.10', 24, { dns: '192.168.1.50', apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
      sw('sw1', 'SW1', 330, 215),
      host('web', 'WEB', 540, 110, '192.168.1.20', {
        apps: [{ kind: 'terminal' }, { kind: 'web-server', page: '<h1>Site en ligne</h1><p>Le nom de domaine pointe bien vers ce serveur.</p>' }],
      }),
      host('dns1', 'DNS1', 540, 320, '192.168.1.50', { apps: [{ kind: 'terminal' }, { kind: 'dns-server', records: [] }] }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'web', 'web_e0', 'sw1', 'sw1_p1'),
      link('l3', 'dns1', 'dns1_e0', 'sw1', 'sw1_p2'),
    ],
    annotations: [zone('z1', 96, 86, 540, 326, SKY, 'Réseau local · 192.168.1.0/24')],
  },
};

const dnsCnameChallenge: Challenge = {
  id: 'dns-cname',
  title: '9 · Créer un alias (CNAME)',
  intro: 'Le nom « site.local » fonctionne déjà. On veut que « www.site.local » mène au même serveur, sans recopier son adresse.',
  steps: ['Ouvrez DNS1 → Serveur DNS (en mode Simulation).', 'Ajoutez un enregistrement CNAME : www.site.local → site.local.'],
  goalText: 'PC1 peut charger http://www.site.local/ (alias de site.local).',
  goal: { kind: 'http', from: 'pc1', url: 'http://www.site.local/' },
  setup: {
    name: 'Défi — alias CNAME',
    devices: [
      pc('pc1', 'PC1', 130, 110, '192.168.1.10', 24, { dns: '192.168.1.50', apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
      sw('sw1', 'SW1', 330, 215),
      host('web', 'WEB', 540, 110, '192.168.1.20', {
        apps: [{ kind: 'terminal' }, { kind: 'web-server', page: '<h1>Bienvenue</h1><p>Accessible par son nom et par son alias www.</p>' }],
      }),
      host('dns1', 'DNS1', 540, 320, '192.168.1.50', {
        apps: [{ kind: 'terminal' }, { kind: 'dns-server', records: [{ type: 'A', name: 'site.local', value: '192.168.1.20' }] }],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'web', 'web_e0', 'sw1', 'sw1_p1'),
      link('l3', 'dns1', 'dns1_e0', 'sw1', 'sw1_p2'),
    ],
    annotations: [zone('z1', 96, 86, 540, 326, SKY, 'Réseau local · 192.168.1.0/24')],
  },
};

const dnsIterativeChallenge: Challenge = {
  id: 'dns-iteratif',
  title: '10 · DNS itératif (délégation)',
  intro: 'PC1 interroge le résolveur DNS1, qui ne fait pas autorité sur la zone « local » : c’est DNS2 (192.168.1.53) qui la gère.',
  steps: [
    'Ouvrez DNS1 → Serveur DNS.',
    'Ajoutez une délégation NS : zone « local » → 192.168.1.53.',
    'En mode itératif, DNS1 renvoie cette référence et PC1 ira lui-même interroger DNS2.',
  ],
  goalText: 'PC1 résout « web.local » en suivant la délégation vers DNS2.',
  goal: { kind: 'dns', from: 'pc1', name: 'web.local' },
  setup: {
    name: 'Défi — DNS itératif',
    devices: [
      pc('pc1', 'PC1', 130, 110, '192.168.1.10', 24, { dns: '192.168.1.50' }),
      sw('sw1', 'SW1', 330, 215),
      host('dns1', 'DNS1', 540, 110, '192.168.1.50', {
        apps: [{ kind: 'terminal' }, { kind: 'dns-server', records: [], recursive: false }],
      }),
      host('dns2', 'DNS2', 540, 320, '192.168.1.53', {
        apps: [{ kind: 'dns-server', records: [{ type: 'A', name: 'web.local', value: '192.168.1.20' }] }],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'dns1', 'dns1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'dns2', 'dns2_e0', 'sw1', 'sw1_p2'),
    ],
    annotations: [zone('z1', 96, 86, 540, 326, SKY, 'Réseau local · 192.168.1.0/24 (résolveur + autoritatif)')],
  },
};

const dnsRecursiveChallenge: Challenge = {
  id: 'dns-recursif',
  title: '11 · DNS récursif',
  intro: 'DNS2 fait autorité sur « local », mais il est sur un autre réseau que PC1 ne peut pas joindre. DNS1, lui, sait l’atteindre via le routeur.',
  steps: [
    'Ouvrez DNS1 → Serveur DNS.',
    'Activez « Résolution récursive ».',
    'DNS1 interrogera lui-même DNS2, puis renverra la réponse complète à PC1.',
  ],
  goalText: 'PC1 résout « web.local » grâce à la résolution récursive de DNS1.',
  goal: { kind: 'dns', from: 'pc1', name: 'web.local' },
  setup: {
    name: 'Défi — DNS récursif',
    devices: [
      // PC1 n'a PAS de passerelle : il ne peut joindre que son réseau local.
      pc('pc1', 'PC1', 96, 96, '192.168.1.10', 24, { dns: '192.168.1.50' }),
      host('dns1', 'DNS1', 96, 300, '192.168.1.50', {
        gateway: '192.168.1.1',
        apps: [{ kind: 'terminal' }, { kind: 'dns-server', records: [{ type: 'NS', name: 'local', value: '192.168.2.53' }], recursive: false }],
      }),
      sw('sw1', 'SW1', 300, 198),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 490,
        y: 198,
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '192.168.2.1', prefix: 24 },
        ],
      },
      host('dns2', 'DNS2', 680, 198, '192.168.2.53', {
        gateway: '192.168.2.1',
        apps: [{ kind: 'dns-server', records: [{ type: 'A', name: 'web.local', value: '192.168.2.20' }] }],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'dns1', 'dns1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e0', 'sw1', 'sw1_p2'),
      link('l4', 'dns2', 'dns2_e0', 'r1', 'r1_e1'),
    ],
    annotations: [
      zone('za', 64, 64, 372, 348, SKY, 'Réseau de PC1 · 192.168.1.0/24'),
      zone('zb', 648, 150, 168, 170, GREEN, 'Réseau de DNS2 · 192.168.2.0/24'),
    ],
  },
};

const natChallenge: Challenge = {
  id: 'nat',
  title: '12 · NAT : accéder à Internet',
  intro:
    'PC1 est sur un réseau privé (192.168.1.0/24) et veut joindre le serveur WEB d’« Internet » (203.0.113.0/24). Ce serveur ne sait pas répondre vers des adresses privées.',
  steps: [
    'Sélectionnez R1 et activez le NAT.',
    'Désignez l’interface externe : eth1 (203.0.113.1), côté Internet.',
    'R1 masquera alors PC1 derrière son adresse publique.',
  ],
  goalText: 'PC1 peut charger http://203.0.113.10/ à travers le routeur NAT.',
  goal: { kind: 'http', from: 'pc1', url: 'http://203.0.113.10/' },
  setup: {
    name: 'Défi — NAT',
    devices: [
      pc('pc1', 'PC1', 110, 200, '192.168.1.10', 24, { gateway: '192.168.1.1', apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
      sw('sw1', 'SW1', 250, 200, 3),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 400,
        y: 200,
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '203.0.113.1', prefix: 24 },
        ],
      },
      sw('sw2', 'SW2', 550, 200, 3),
      host('web', 'WEB', 690, 200, '203.0.113.10', {
        apps: [{ kind: 'terminal' }, { kind: 'web-server', page: "<h1>Bienvenue depuis Internet</h1><p>Le NAT a traduit l'adresse privée de PC1 en adresse publique.</p>" }],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'r1', 'r1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e1', 'sw2', 'sw2_p0'),
      link('l4', 'web', 'web_e0', 'sw2', 'sw2_p1'),
    ],
    annotations: [
      zone('za', 86, 168, 252, 132, SKY, 'Réseau privé · 192.168.1.0/24'),
      zone('zb', 526, 168, 250, 132, RED, 'Internet · 203.0.113.0/24'),
      text('tr', 396, 286, 'NAT', 12, SLATE),
    ],
  },
};

const portForwardChallenge: Challenge = {
  id: 'nat-port',
  title: '13 · Redirection de port',
  intro: 'Un serveur web tourne sur le réseau privé. Un client venu d’Internet ne peut pas l’atteindre : le NAT bloque les connexions entrantes non sollicitées.',
  steps: [
    'Sélectionnez R1 (le NAT est déjà activé, eth1 = interface externe).',
    'Ajoutez une redirection de port : TCP, port public 80 → 192.168.1.10 port 80.',
  ],
  goalText: 'CLIENT peut charger http://203.0.113.1/, servi par le serveur privé.',
  goal: { kind: 'http', from: 'client', url: 'http://203.0.113.1/' },
  setup: {
    name: 'Défi — redirection de port',
    devices: [
      host('srv', 'SRV', 110, 200, '192.168.1.10', {
        gateway: '192.168.1.1',
        apps: [{ kind: 'terminal' }, { kind: 'web-server', page: '<h1>Serveur privé exposé</h1><p>La redirection de port a permis à un client externe de m\'atteindre à travers le NAT.</p>' }],
      }),
      sw('sw1', 'SW1', 250, 200, 3),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 400,
        y: 200,
        nat: { wanInterfaceId: 'r1_e1' },
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '203.0.113.1', prefix: 24 },
        ],
      },
      sw('sw2', 'SW2', 550, 200, 3),
      pc('client', 'CLIENT', 690, 200, '203.0.113.50', 24, { gateway: '203.0.113.1', apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
    ],
    links: [
      link('l1', 'srv', 'srv_e0', 'sw1', 'sw1_p0'),
      link('l2', 'r1', 'r1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e1', 'sw2', 'sw2_p0'),
      link('l4', 'client', 'client_e0', 'sw2', 'sw2_p1'),
    ],
    annotations: [
      zone('za', 86, 168, 252, 132, SKY, 'Réseau privé · 192.168.1.0/24'),
      zone('zb', 526, 168, 250, 132, RED, 'Internet · 203.0.113.0/24'),
      text('tr', 396, 286, 'NAT', 12, SLATE),
    ],
  },
};

const staticRouteChallenge: Challenge = {
  id: 'route-statique',
  title: '14 · Route statique',
  intro:
    "Depuis R1, deux routeurs mènent à deux réseaux : R2 vers 192.168.2.0/24 et R3 vers 192.168.3.0/24. La passerelle par défaut de R1 pointe vers R2, donc R1 ignore comment atteindre le réseau derrière R3.",
  steps: [
    'Sélectionnez R1 et ouvrez la « Table de routage ».',
    'Ajoutez une route : réseau 192.168.3.0, préfixe 24, passerelle 10.0.13.2 (R3).',
    "L'interface de sortie est déduite automatiquement de la passerelle.",
  ],
  goalText: 'PC1 peut envoyer un ping à PC3 (192.168.3.10), de l’autre côté de R3.',
  goal: { kind: 'ping', from: 'pc1', to: '192.168.3.10' },
  setup: {
    name: 'Défi — route statique',
    devices: [
      pc('pc1', 'PC1', 96, 210, '192.168.1.10', 24, { gateway: '192.168.1.1' }),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 300,
        y: 210,
        gateway: '10.0.12.2', // défaut vers R2 : couvre .2.0/24 mais PAS .3.0/24
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '10.0.12.1', prefix: 30 },
          { id: 'r1_e2', name: 'eth2', mac: mac(), ip: '10.0.13.1', prefix: 30 },
        ],
      },
      {
        id: 'r2',
        kind: 'router',
        name: 'R2',
        x: 540,
        y: 100,
        gateway: '10.0.12.1',
        interfaces: [
          { id: 'r2_e0', name: 'eth0', mac: mac(), ip: '10.0.12.2', prefix: 30 },
          { id: 'r2_e1', name: 'eth1', mac: mac(), ip: '192.168.2.1', prefix: 24 },
        ],
      },
      {
        id: 'r3',
        kind: 'router',
        name: 'R3',
        x: 540,
        y: 330,
        gateway: '10.0.13.1',
        interfaces: [
          { id: 'r3_e0', name: 'eth0', mac: mac(), ip: '10.0.13.2', prefix: 30 },
          { id: 'r3_e1', name: 'eth1', mac: mac(), ip: '192.168.3.1', prefix: 24 },
        ],
      },
      pc('pc2', 'PC2', 760, 100, '192.168.2.10', 24, { gateway: '192.168.2.1' }),
      pc('pc3', 'PC3', 760, 330, '192.168.3.10', 24, { gateway: '192.168.3.1' }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'r1', 'r1_e0'),
      link('l2', 'r1', 'r1_e1', 'r2', 'r2_e0'),
      link('l3', 'r1', 'r1_e2', 'r3', 'r3_e0'),
      link('l4', 'r2', 'r2_e1', 'pc2', 'pc2_e0'),
      link('l5', 'r3', 'r3_e1', 'pc3', 'pc3_e0'),
    ],
    annotations: [
      zone('z1', 72, 182, 130, 116, SKY, 'LAN 1 · 192.168.1.0/24'),
      zone('z2', 732, 72, 132, 116, GREEN, 'LAN 2 · 192.168.2.0/24'),
      zone('z3', 732, 302, 132, 116, AMBER, 'LAN 3 · 192.168.3.0/24'),
      text('t12', 392, 120, '10.0.12.0/30', 11, SLATE),
      text('t13', 392, 320, '10.0.13.0/30', 11, SLATE),
    ],
  },
};

const dynamicRoutingChallenge: Challenge = {
  id: 'routage-dynamique',
  title: '15 · Routage dynamique (RIP / OSPF)',
  intro:
    'Trois routeurs en triangle relient deux réseaux (PC1 et PC2). Aucune route n’est configurée : la configurer à la main serait fastidieux. Faites apprendre les chemins automatiquement par un protocole de routage.',
  steps: [
    'Sélectionnez R1, et dans « Table de routage » choisissez le protocole RIP (ou OSPF).',
    'Faites de même sur R2 et R3 (tous doivent parler le même protocole).',
    'Astuce : tapez « route » dans un terminal de routeur ; RIP suit le moins de sauts, OSPF la plus grande bande passante.',
  ],
  goalText: 'PC1 peut envoyer un ping à PC2 (192.168.3.10), via des routes apprises automatiquement.',
  goal: { kind: 'ping', from: 'pc1', to: '192.168.3.10' },
  setup: {
    name: 'Défi — routage dynamique',
    devices: [
      pc('pc1', 'PC1', 80, 230, '192.168.1.10', 24, { gateway: '192.168.1.1' }),
      {
        id: 'r1',
        kind: 'router',
        name: 'R1',
        x: 270,
        y: 230,
        interfaces: [
          { id: 'r1_e0', name: 'eth0', mac: mac(), ip: '192.168.1.1', prefix: 24 },
          { id: 'r1_e1', name: 'eth1', mac: mac(), ip: '10.0.12.1', prefix: 30 },
          { id: 'r1_e2', name: 'eth2', mac: mac(), ip: '10.0.13.1', prefix: 30 },
        ],
      },
      {
        id: 'r2',
        kind: 'router',
        name: 'R2',
        x: 470,
        y: 110,
        interfaces: [
          { id: 'r2_e0', name: 'eth0', mac: mac(), ip: '10.0.12.2', prefix: 30 },
          { id: 'r2_e1', name: 'eth1', mac: mac(), ip: '10.0.23.1', prefix: 30 },
        ],
      },
      {
        id: 'r3',
        kind: 'router',
        name: 'R3',
        x: 470,
        y: 350,
        interfaces: [
          { id: 'r3_e0', name: 'eth0', mac: mac(), ip: '192.168.3.1', prefix: 24 },
          { id: 'r3_e1', name: 'eth1', mac: mac(), ip: '10.0.23.2', prefix: 30 },
          { id: 'r3_e2', name: 'eth2', mac: mac(), ip: '10.0.13.2', prefix: 30 },
        ],
      },
      pc('pc2', 'PC2', 660, 350, '192.168.3.10', 24, { gateway: '192.168.3.1' }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'r1', 'r1_e0'),
      { ...link('l2', 'r1', 'r1_e1', 'r2', 'r2_e0'), bandwidth: 1000 },
      { ...link('l3', 'r2', 'r2_e1', 'r3', 'r3_e1'), bandwidth: 1000 },
      { ...link('l4', 'r1', 'r1_e2', 'r3', 'r3_e2'), bandwidth: 10 }, // raccourci direct mais lent
      link('l5', 'r3', 'r3_e0', 'pc2', 'pc2_e0'),
    ],
    annotations: [
      zone('z1', 56, 200, 130, 118, SKY, 'LAN 1 · 192.168.1.0/24'),
      zone('z3', 636, 320, 130, 118, GREEN, 'LAN 3 · 192.168.3.0/24'),
      text('t12', 360, 150, 'R1–R2 · 1 Gb/s', 11, SLATE),
      text('t23', 506, 240, 'R2–R3 · 1 Gb/s', 11, SLATE),
      text('t13', 300, 322, 'R1–R3 · 10 Mb/s (lent)', 11, SLATE),
    ],
  },
};

export const CHALLENGES: Challenge[] = [
  cableChallenge,
  ipChallenge,
  maskChallenge,
  gatewayChallenge,
  twoRoutersChallenge,
  dhcpChallenge,
  dhcpOptionsChallenge,
  dnsWebChallenge,
  dnsCnameChallenge,
  dnsIterativeChallenge,
  dnsRecursiveChallenge,
  natChallenge,
  portForwardChallenge,
  staticRouteChallenge,
  dynamicRoutingChallenge,
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
