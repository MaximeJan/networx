// Défis pédagogiques — une progression en 5 niveaux où l'élève CONSTRUIT et
// RÉPARE de vrais petits réseaux dans des situations concrètes (club de jeux,
// salle de classe, PME, maison…), au lieu de cliquer la « pièce manquante »
// d'une vitrine déjà montée.
//
// Principes :
//   • Un défi = mise en situation (intro) + mission (goalText) + OBJECTIFS
//     vérifiables (goal.checks, affichés en checklist) + indications repliées.
//   • Les contrôles désignent les appareils par leur NOM (« PC1 », « SERVEUR »),
//     jamais par un id interne : l'élève peut donc créer lui-même ses machines
//     (les noms automatiques PC1, PC2… conviennent) et choisir ses adresses.
//   • La vérification REJOUE la simulation (lib/challenge.verifyChallenge) et,
//     en cas d'échec, explique pourquoi grâce au diagnostic (lib/diagnose).
//   • Trois familles d'exercices s'alternent : CONSTRUIRE (plan vide ou presque),
//     COMPLÉTER (il manque un service), DIAGNOSTIQUER (une panne réaliste à
//     comprendre au terminal avant de corriger).

import type { Annotation, Device, DeviceKind, Ip, NetInterface, Topology } from './domain/types';

// ────────────────────────── Objectifs vérifiables ──────────────────────────

/** Un contrôle élémentaire d'un défi. Les appareils sont désignés par leur NOM. */
export type Check =
  /** Au moins `min` appareils de ce type sur le plan. */
  | { kind: 'device-count'; device: DeviceKind; min: number; label: string }
  /** L'appareil nommé est câblé (au moins une interface reliée). */
  | { kind: 'cabled'; device: string; label: string }
  /** `from` reçoit une réponse au ping de `to` (nom d'appareil, IP ou nom DNS). */
  | { kind: 'ping'; from: string; to: string; label: string }
  /** `from` charge la page `url` (les jetons `@NOM` sont remplacés par l'IP de l'appareil). */
  | { kind: 'http'; from: string; url: string; label: string }
  /** `from` résout le nom `name` par DNS. */
  | { kind: 'dns'; from: string; name: string; label: string }
  /** L'appareil nommé obtient une adresse IP par DHCP. */
  | { kind: 'dhcp'; client: string; label: string };

/** Objectif d'un défi : TOUS les contrôles doivent passer. */
export interface Goal {
  checks: Check[];
}

export interface Challenge {
  id: string;
  title: string;
  /** Niveau (groupe du sélecteur) : 1..5. */
  level: number;
  /** Mise en situation : le contexte concret, en quelques phrases. */
  intro: string;
  /** La mission en une phrase (affichée en évidence). */
  goalText: string;
  /** Indications pas à pas (dépliant « Besoin d'aide ? »). */
  steps: string[];
  goal: Goal;
  setup: Topology;
}

/** Libellés des niveaux (optgroup du sélecteur de défis). */
export const CHALLENGE_LEVELS: { level: number; label: string }[] = [
  { level: 1, label: 'Niveau 1 · Premiers pas' },
  { level: 2, label: 'Niveau 2 · Des adresses bien pensées' },
  { level: 3, label: 'Niveau 3 · Relier des réseaux' },
  { level: 4, label: 'Niveau 4 · Les services' },
  { level: 5, label: 'Niveau 5 · Vers l’Internet' },
];

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
function router(id: string, name: string, x: number, y: number, ifs: NetInterface[], extra?: Partial<Device>): Device {
  return { id, kind: 'router', name, x, y, interfaces: ifs, ...extra };
}
const rif = (id: string, name: string, ip?: Ip, prefix?: number): NetInterface => ({ id, name, mac: mac(), ip, prefix });
const link = (id: string, a: string, ai: string, b: string, bi: string) => ({
  id,
  a: { deviceId: a, interfaceId: ai },
  b: { deviceId: b, interfaceId: bi },
});

// ── Annotations (zones colorées + étiquettes de texte) ──
const SKY = '#0ea5e9';
const GREEN = '#22c55e';
const SLATE = '#64748b';
const RED = '#ef4444';
function zone(id: string, x: number, y: number, w: number, h: number, color: string, label: string): Annotation {
  return { id, kind: 'zone', x, y, w, h, color, label };
}
function text(id: string, x: number, y: number, content: string, fontSize = 13, color = '#334155'): Annotation {
  return { id, kind: 'text', x, y, text: content, color, fontSize };
}

// ════════════════════════ Niveau 1 · Premiers pas ════════════════════════

const premierReseau: Challenge = {
  id: 'premier-reseau',
  title: '1 · Deux ordinateurs face à face',
  level: 1,
  intro:
    'Le club de jeux du gymnase veut relier deux ordinateurs pour jouer en réseau local. Rien n’est encore installé : le plan est vide. À vous de construire votre tout premier réseau — deux machines, un câble, deux adresses.',
  goalText: 'Construisez un réseau de deux ordinateurs qui se répondent au ping.',
  steps: [
    'Glissez deux « Ordinateur » depuis la palette sur le plan (ils s’appelleront PC1 et PC2).',
    'Reliez-les : cliquez le port (la pastille au bord) de l’un, puis le port de l’autre.',
    'Double-cliquez chaque machine → outil « Réseau » : donnez par exemple 192.168.1.10 à PC1 et 192.168.1.20 à PC2, avec le masque 255.255.255.0 (/24).',
    'Passez en Simulation, ouvrez le Terminal de PC1 et tapez « ping 192.168.1.20 ».',
  ],
  goal: {
    checks: [
      { kind: 'device-count', device: 'pc', min: 2, label: 'Au moins deux ordinateurs sont posés sur le plan' },
      { kind: 'ping', from: 'PC1', to: 'PC2', label: 'PC1 reçoit une réponse de PC2' },
      { kind: 'ping', from: 'PC2', to: 'PC1', label: 'PC2 reçoit une réponse de PC1' },
    ],
  },
  setup: {
    name: 'Défi — premier réseau',
    devices: [],
    links: [],
    annotations: [
      zone('z1', 120, 100, 460, 300, SKY, 'Votre premier réseau · 192.168.1.0/24'),
      text('t1', 140, 380, 'Deux ordinateurs, un câble, deux adresses du même réseau.', 13, SLATE),
    ],
  },
};

const troisiemePoste: Challenge = {
  id: 'troisieme-poste',
  title: '2 · Un troisième joueur',
  level: 1,
  intro:
    'La partie fait des envieux : un troisième joueur débarque avec sa machine. Problème : chaque ordinateur n’a qu’UNE carte réseau, et l’unique câble du club relie déjà PC1 à PC2. Pour brancher tout le monde, il faut un appareil prévu pour ça : le commutateur (switch).',
  goalText: 'Intégrez un troisième poste en recâblant le réseau autour d’un commutateur.',
  steps: [
    'Cliquez le câble entre PC1 et PC2, puis supprimez-le.',
    'Glissez un « Commutateur » et un troisième « Ordinateur » sur le plan.',
    'Câblez PC1, PC2 et PC3 au commutateur (un câble par poste).',
    'Donnez à PC3 une adresse libre du réseau : 192.168.1.30, masque /24.',
    'En Simulation, pinguez puis observez le journal : le commutateur APPREND sur quel port habite chaque adresse MAC.',
  ],
  goal: {
    checks: [
      { kind: 'device-count', device: 'switch', min: 1, label: 'Un commutateur relie les postes' },
      { kind: 'ping', from: 'PC1', to: 'PC2', label: 'PC1 joint toujours PC2' },
      { kind: 'ping', from: 'PC3', to: 'PC1', label: 'PC3 joint PC1' },
      { kind: 'ping', from: 'PC2', to: 'PC3', label: 'PC2 joint PC3' },
    ],
  },
  setup: {
    name: 'Défi — troisième poste',
    devices: [
      pc('pc1', 'PC1', 160, 160, '192.168.1.10', 24),
      pc('pc2', 'PC2', 160, 330, '192.168.1.20', 24),
    ],
    links: [link('l1', 'pc1', 'pc1_e0', 'pc2', 'pc2_e0')],
    annotations: [zone('z1', 120, 100, 480, 320, SKY, 'Réseau du club · 192.168.1.0/24')],
  },
};

const posteMuet: Challenge = {
  id: 'poste-muet',
  title: '3 · Le poste qui ne répond plus',
  level: 1,
  intro:
    'Salle informatique du gymnase : quatre postes autour d’un commutateur. Depuis ce matin, PC3 ne répond plus au ping alors que « tout est branché ». Avant de toucher quoi que ce soit, menez l’enquête depuis les terminaux — le simulateur vous dit pourquoi un ping échoue.',
  goalText: 'Trouvez pourquoi PC3 est injoignable, puis réparez sa configuration.',
  steps: [
    'En Simulation, Terminal de PC1 : « ping 192.168.1.30 ». Lisez le diagnostic affiché après l’échec.',
    '« ipconfig » sur PC3 : dans quel réseau son adresse le place-t-elle vraiment ?',
    'Corrigez l’adresse de PC3 (outil « Réseau ») pour revenir dans 192.168.1.0/24 — par exemple 192.168.1.30.',
  ],
  goal: {
    checks: [
      { kind: 'ping', from: 'PC1', to: 'PC3', label: 'PC1 joint PC3' },
      { kind: 'ping', from: 'PC3', to: 'PC4', label: 'PC3 joint PC4' },
    ],
  },
  setup: {
    name: 'Défi — poste injoignable',
    devices: [
      pc('pc1', 'PC1', 150, 130, '192.168.1.10', 24),
      pc('pc2', 'PC2', 150, 320, '192.168.1.20', 24),
      sw('sw1', 'SW1', 360, 225),
      pc('pc3', 'PC3', 570, 130, '192.168.2.30', 24), // ← l'intrus : mauvais réseau
      pc('pc4', 'PC4', 570, 320, '192.168.1.40', 24),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'pc2', 'pc2_e0', 'sw1', 'sw1_p1'),
      link('l3', 'pc3', 'pc3_e0', 'sw1', 'sw1_p2'),
      link('l4', 'pc4', 'pc4_e0', 'sw1', 'sw1_p3'),
    ],
    annotations: [zone('z1', 116, 96, 560, 330, SKY, 'Salle informatique · 192.168.1.0/24')],
  },
};

// ═══════════════════ Niveau 2 · Des adresses bien pensées ═══════════════════

const masque: Challenge = {
  id: 'masque',
  title: '4 · Le masque qui isole',
  level: 2,
  intro:
    'Une PME a prévu UN grand réseau 10.0.0.0/16 pour tout le bâtiment. Depuis qu’un stagiaire a « ajusté » un masque, le poste comptable (10.0.2.20) ne joint plus le serveur de fichiers (10.0.1.10). Les adresses sont correctes… mais le masque décide de ce qui est « chez soi » — et un /24 ne raconte pas la même histoire qu’un /16.',
  goalText: 'Rendez le serveur de fichiers à nouveau joignable en corrigeant le masque fautif.',
  steps: [
    'Terminal de COMPTA : « ping 10.0.1.10 ». La demande part-elle seulement ? Lisez le diagnostic.',
    'Avec un masque /24, COMPTA se croit dans 10.0.2.0/24 : pour lui, 10.0.1.10 est un autre réseau (et il n’a pas de passerelle).',
    'Outil « Réseau » de COMPTA : remplacez le masque par 255.255.0.0 (/16) pour englober tout 10.0.x.x.',
  ],
  goal: {
    checks: [
      { kind: 'ping', from: 'COMPTA', to: 'FICHIERS', label: 'COMPTA joint le serveur FICHIERS' },
      { kind: 'ping', from: 'FICHIERS', to: 'COMPTA', label: 'La réponse trouve aussi le chemin du retour' },
    ],
  },
  setup: {
    name: 'Défi — masque de sous-réseau',
    devices: [
      pc('fichiers', 'FICHIERS', 150, 140, '10.0.1.10', 16),
      pc('compta', 'COMPTA', 150, 320, '10.0.2.20', 24), // ← masque trop étroit
      sw('sw1', 'SW1', 380, 230),
      pc('pc3', 'DIRECTION', 590, 230, '10.0.3.30', 16),
    ],
    links: [
      link('l1', 'fichiers', 'fichiers_e0', 'sw1', 'sw1_p0'),
      link('l2', 'compta', 'compta_e0', 'sw1', 'sw1_p1'),
      link('l3', 'pc3', 'pc3_e0', 'sw1', 'sw1_p2'),
    ],
    annotations: [zone('z1', 116, 100, 560, 300, SKY, 'Réseau prévu · 10.0.0.0/16')],
  },
};

const deuxSalles: Challenge = {
  id: 'deux-salles',
  title: '5 · Deux salles à adresser',
  level: 2,
  intro:
    'Vous équipez deux salles de classe. Les commutateurs sont posés et le plan délimite les réseaux : salle A en 172.16.1.0/24, salle B en 172.16.2.0/24. Les postes sortent du carton : ni câblés, ni configurés. À vous de concevoir le plan d’adressage et de le mettre en œuvre.',
  goalText: 'Câblez et adressez les deux salles pour que chacune communique en interne.',
  steps: [
    'Câblez A1 et A2 au commutateur SW-A ; B1 et B2 à SW-B.',
    'Choisissez pour chaque poste une adresse DANS le réseau de sa zone (ex. 172.16.1.10 et 172.16.1.11 en salle A), masque /24.',
    'Testez au Terminal : chaque salle doit se pinguer en interne.',
    'Puis essayez un ping de A1 vers B1 : pourquoi est-ce impossible ? (Un commutateur ne franchit pas les frontières IP — réponse au prochain défi.)',
  ],
  goal: {
    checks: [
      { kind: 'cabled', device: 'A1', label: 'A1 est câblé' },
      { kind: 'cabled', device: 'B1', label: 'B1 est câblé' },
      { kind: 'ping', from: 'A1', to: 'A2', label: 'A1 joint A2 (salle A)' },
      { kind: 'ping', from: 'B1', to: 'B2', label: 'B1 joint B2 (salle B)' },
    ],
  },
  setup: {
    name: 'Défi — deux salles',
    devices: [
      pc('a1', 'A1', 130, 130),
      pc('a2', 'A2', 130, 320),
      sw('swa', 'SW-A', 310, 225),
      sw('swb', 'SW-B', 700, 225),
      pc('b1', 'B1', 880, 130),
      pc('b2', 'B2', 880, 320),
    ],
    links: [],
    annotations: [
      zone('za', 96, 96, 300, 330, SKY, 'Salle A · 172.16.1.0/24'),
      zone('zb', 660, 96, 300, 330, GREEN, 'Salle B · 172.16.2.0/24'),
    ],
  },
};

// ═════════════════════ Niveau 3 · Relier des réseaux ═════════════════════

const routeurChallenge: Challenge = {
  id: 'routeur',
  title: '6 · Le pont entre deux salles',
  level: 3,
  intro:
    'Les deux salles fonctionnent, mais chacune vit sur son île : un commutateur ne franchit pas les frontières d’un réseau IP. Pour passer de 172.16.1.0/24 à 172.16.2.0/24, il faut un ROUTEUR — une machine avec un pied dans chaque réseau. Et chaque poste doit connaître sa PASSERELLE : l’adresse à qui confier les paquets qui sortent.',
  goalText: 'Ajoutez un routeur entre les deux salles et configurez les passerelles.',
  steps: [
    'Glissez un « Routeur » entre les deux zones et câblez-le à SW-A et à SW-B.',
    'Double-cliquez le routeur → Interfaces : une adresse dans CHAQUE réseau (ex. 172.16.1.1 côté A, 172.16.2.1 côté B).',
    'Sur chaque poste (outil « Réseau »), renseignez la passerelle : l’adresse du routeur DANS SA salle.',
    'Pinguez de A1 vers B1 et observez le journal : le routeur décrémente le TTL en relayant le paquet.',
  ],
  goal: {
    checks: [
      { kind: 'device-count', device: 'router', min: 1, label: 'Un routeur relie les deux salles' },
      { kind: 'ping', from: 'A1', to: 'B1', label: 'A1 joint B1 à travers le routeur' },
      { kind: 'ping', from: 'B2', to: 'A2', label: 'B2 joint A2 (le retour est aussi configuré)' },
    ],
  },
  setup: {
    name: 'Défi — premier routeur',
    devices: [
      pc('a1', 'A1', 130, 130, '172.16.1.10', 24),
      pc('a2', 'A2', 130, 320, '172.16.1.11', 24),
      sw('swa', 'SW-A', 310, 225),
      sw('swb', 'SW-B', 700, 225),
      pc('b1', 'B1', 880, 130, '172.16.2.10', 24),
      pc('b2', 'B2', 880, 320, '172.16.2.11', 24),
    ],
    links: [
      link('l1', 'a1', 'a1_e0', 'swa', 'swa_p0'),
      link('l2', 'a2', 'a2_e0', 'swa', 'swa_p1'),
      link('l3', 'b1', 'b1_e0', 'swb', 'swb_p0'),
      link('l4', 'b2', 'b2_e0', 'swb', 'swb_p1'),
    ],
    annotations: [
      zone('za', 96, 96, 300, 330, SKY, 'Salle A · 172.16.1.0/24'),
      zone('zb', 660, 96, 300, 330, GREEN, 'Salle B · 172.16.2.0/24'),
      text('tr', 460, 330, 'Place au routeur, ici.', 12, SLATE),
    ],
  },
};

const reponsePerdue: Challenge = {
  id: 'reponse-perdue',
  title: '7 · L’écho qui ne revient pas',
  level: 3,
  intro:
    'Réseau d’une petite commune : deux réseaux reliés par un routeur déjà en service. Depuis ACCUEIL, le ping vers ARCHIVES échoue. Pourtant, en suivant les paquets dans le journal, la demande d’écho ARRIVE bien jusqu’à ARCHIVES… Une communication réseau, c’est toujours un ALLER et un RETOUR — et chacun des deux doit trouver son chemin.',
  goalText: 'Découvrez pourquoi la réponse se perd, et faites revenir l’écho.',
  steps: [
    'Depuis ACCUEIL : « ping 192.168.2.10 ». Suivez la demande dans le journal : jusqu’où va-t-elle ?',
    'La demande atteint ARCHIVES. Et sa réponse ? « ipconfig » sur ARCHIVES : comment sortirait-elle de son réseau ?',
    'ARCHIVES n’a pas de passerelle : sa réponse ne sait pas rejoindre 192.168.1.0/24. Renseignez 192.168.2.1.',
  ],
  goal: {
    checks: [{ kind: 'ping', from: 'ACCUEIL', to: 'ARCHIVES', label: 'ACCUEIL reçoit la réponse d’ARCHIVES' }],
  },
  setup: {
    name: 'Défi — écho perdu',
    devices: [
      pc('accueil', 'ACCUEIL', 130, 220, '192.168.1.10', 24, { gateway: '192.168.1.1' }),
      router('r1', 'R1', 400, 220, [
        rif('r1_e0', 'eth0', '192.168.1.1', 24),
        rif('r1_e1', 'eth1', '192.168.2.1', 24),
      ]),
      pc('archives', 'ARCHIVES', 670, 220, '192.168.2.10', 24), // ← pas de passerelle
    ],
    links: [
      link('l1', 'accueil', 'accueil_e0', 'r1', 'r1_e0'),
      link('l2', 'archives', 'archives_e0', 'r1', 'r1_e1'),
    ],
    annotations: [
      zone('za', 96, 180, 180, 140, SKY, 'Administration · 192.168.1.0/24'),
      zone('zb', 636, 180, 180, 140, GREEN, 'Archives · 192.168.2.0/24'),
    ],
  },
};

const deuxBatiments: Challenge = {
  id: 'deux-batiments',
  title: '8 · Deux bâtiments, une liaison',
  level: 3,
  intro:
    'Une fiduciaire occupe deux bâtiments, à Fribourg et à Bulle, chacun avec son réseau et son routeur. La liaison dédiée entre les deux routeurs est posée (réseau de transit 10.0.0.0/30 : deux adresses, une par routeur). Mais chaque routeur ignore encore que le réseau d’en face existe : à vous de lui apprendre le chemin.',
  goalText: 'Apprenez à chaque routeur la route vers le réseau de l’autre bâtiment.',
  steps: [
    'Console de R-FRIBOURG → Interfaces : donnez-lui comme passerelle par défaut l’autre bout de la liaison, 10.0.0.2.',
    'Console de R-BULLE : passerelle par défaut 10.0.0.1.',
    'Testez de bout en bout (FRI1 → BULLE1) : le TTL diminue DEUX fois, une par routeur traversé.',
    'Variante pour aller plus loin : au lieu de la passerelle par défaut, ajoutez une route statique précise dans l’outil « Routage ».',
  ],
  goal: {
    checks: [
      { kind: 'ping', from: 'FRI1', to: 'BULLE1', label: 'FRI1 joint BULLE1 à travers les deux routeurs' },
      { kind: 'ping', from: 'BULLE2', to: 'FRI2', label: 'BULLE2 joint FRI2 (retour configuré aussi)' },
    ],
  },
  setup: {
    name: 'Défi — liaison entre bâtiments',
    devices: [
      pc('fri1', 'FRI1', 130, 110, '192.168.10.10', 24, { gateway: '192.168.10.1' }),
      pc('fri2', 'FRI2', 130, 320, '192.168.10.11', 24, { gateway: '192.168.10.1' }),
      sw('swf', 'SW-FRI', 300, 215),
      router('rf', 'R-FRIBOURG', 460, 215, [
        rif('rf_e0', 'eth0', '192.168.10.1', 24),
        rif('rf_e1', 'eth1', '10.0.0.1', 30),
      ]),
      router('rb', 'R-BULLE', 640, 215, [
        rif('rb_e0', 'eth0', '10.0.0.2', 30),
        rif('rb_e1', 'eth1', '192.168.20.1', 24),
      ]),
      sw('swb', 'SW-BULLE', 800, 215),
      pc('bulle1', 'BULLE1', 970, 110, '192.168.20.10', 24, { gateway: '192.168.20.1' }),
      pc('bulle2', 'BULLE2', 970, 320, '192.168.20.11', 24, { gateway: '192.168.20.1' }),
    ],
    links: [
      link('l1', 'fri1', 'fri1_e0', 'swf', 'swf_p0'),
      link('l2', 'fri2', 'fri2_e0', 'swf', 'swf_p1'),
      link('l3', 'rf', 'rf_e0', 'swf', 'swf_p2'),
      link('l4', 'rf', 'rf_e1', 'rb', 'rb_e0'),
      link('l5', 'rb', 'rb_e1', 'swb', 'swb_p0'),
      link('l6', 'bulle1', 'bulle1_e0', 'swb', 'swb_p1'),
      link('l7', 'bulle2', 'bulle2_e0', 'swb', 'swb_p2'),
    ],
    annotations: [
      zone('za', 96, 80, 290, 330, SKY, 'Fribourg · 192.168.10.0/24'),
      zone('zb', 766, 80, 290, 330, GREEN, 'Bulle · 192.168.20.0/24'),
      text('tt', 520, 190, 'liaison louée · 10.0.0.0/30', 12, SLATE),
    ],
  },
};

const boucle: Challenge = {
  id: 'boucle',
  title: '9 · La boucle infernale',
  level: 3,
  intro:
    'Trois routeurs en chaîne relient le lycée (LAN 1) au centre de calcul (LAN 3). Depuis une « mise à jour » de R2 hier soir, plus rien ne passe et le journal parle de TTL expiré. Quand deux routeurs se renvoient le même paquet, celui-ci tourne en rond jusqu’à ce que son TTL meure : c’est exactement le genre de panne que « traceroute » sait révéler.',
  goalText: 'Cassez la boucle de routage à l’aide de traceroute et de la table de routage.',
  steps: [
    'Depuis PC1 : « traceroute 192.168.3.10 ». Quelles adresses reviennent, dans quel ordre ? Un motif se répète…',
    'R1, R2, R1, R2 : le paquet fait du ping-pong entre les deux premiers routeurs. Tapez « route » dans le Terminal de R2.',
    'La route de R2 vers 192.168.3.0/24 renvoie vers R1 (10.0.12.1) au lieu de continuer vers R3. Dans « Routage », supprimez-la et recréez-la avec la passerelle 10.0.23.2.',
  ],
  goal: {
    checks: [{ kind: 'ping', from: 'PC1', to: 'PC3', label: 'PC1 joint PC3 au bout de la chaîne' }],
  },
  setup: {
    name: 'Défi — boucle de routage',
    devices: [
      pc('pc1', 'PC1', 100, 220, '192.168.1.10', 24, { gateway: '192.168.1.1' }),
      router('r1', 'R1', 300, 220, [
        rif('r1_e0', 'eth0', '192.168.1.1', 24),
        rif('r1_e1', 'eth1', '10.0.12.1', 30),
      ], { gateway: '10.0.12.2' }),
      router('r2', 'R2', 520, 220, [
        rif('r2_e0', 'eth0', '10.0.12.2', 30),
        rif('r2_e1', 'eth1', '10.0.23.1', 30),
      ], {
        gateway: '10.0.12.1',
        // ← LA panne : la route vers LAN 3 repart en arrière, vers R1.
        routes: [{ destination: '192.168.3.0', prefix: 24, gateway: '10.0.12.1', interfaceId: 'r2_e0' }],
      }),
      router('r3', 'R3', 740, 220, [
        rif('r3_e0', 'eth0', '10.0.23.2', 30),
        rif('r3_e1', 'eth1', '192.168.3.1', 24),
      ], { gateway: '10.0.23.1' }),
      pc('pc3', 'PC3', 940, 220, '192.168.3.10', 24, { gateway: '192.168.3.1' }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'r1', 'r1_e0'),
      link('l2', 'r1', 'r1_e1', 'r2', 'r2_e0'),
      link('l3', 'r2', 'r2_e1', 'r3', 'r3_e0'),
      link('l4', 'r3', 'r3_e1', 'pc3', 'pc3_e0'),
    ],
    annotations: [
      zone('z1', 66, 180, 150, 140, SKY, 'Lycée · 192.168.1.0/24'),
      zone('z3', 906, 180, 150, 140, GREEN, 'Calcul · 192.168.3.0/24'),
      text('t12', 390, 200, '10.0.12.0/30', 11, SLATE),
      text('t23', 610, 200, '10.0.23.0/30', 11, SLATE),
    ],
  },
};

// ═══════════════════════ Niveau 4 · Les services ═══════════════════════

const classeMobile: Challenge = {
  id: 'classe-mobile',
  title: '10 · La classe mobile',
  level: 4,
  intro:
    'Le chariot de portables arrive en classe : impossible de configurer chaque machine à la main à chaque leçon. C’est précisément le travail du DHCP — le routeur distribue adresse, masque et passerelle à quiconque les demande. Trois portables attendent sur le chariot, ni câblés, ni configurés.',
  goalText: 'Mettez en service le DHCP et intégrez les portables sans aucune configuration manuelle.',
  steps: [
    'Câblez PORT1, PORT2 et PORT3 au commutateur.',
    'Console de R1 → DHCP : activez le service. Plage : début 192.168.1.100, 20 adresses, préfixe /24, passerelle 192.168.1.1.',
    'En Simulation, les machines sans adresse en demandent une toutes seules (ou tapez « dhcp » dans leur terminal).',
    'Observez la valse DORA dans le journal : Discover, Offer, Request, Ack.',
  ],
  goal: {
    checks: [
      { kind: 'dhcp', client: 'PORT1', label: 'PORT1 obtient une adresse par DHCP' },
      { kind: 'dhcp', client: 'PORT2', label: 'PORT2 obtient une adresse par DHCP' },
      { kind: 'ping', from: 'PORT1', to: 'FICHIERS', label: 'PORT1 joint le serveur FICHIERS' },
    ],
  },
  setup: {
    name: 'Défi — classe mobile',
    devices: [
      pc('port1', 'PORT1', 130, 110),
      pc('port2', 'PORT2', 130, 250),
      pc('port3', 'PORT3', 130, 390),
      sw('sw1', 'SW1', 380, 250, 6),
      router('r1', 'R1', 600, 150, [rif('r1_e0', 'eth0', '192.168.1.1', 24)]),
      host('fichiers', 'FICHIERS', 600, 350, '192.168.1.10', {}),
    ],
    links: [
      link('l1', 'r1', 'r1_e0', 'sw1', 'sw1_p4'),
      link('l2', 'fichiers', 'fichiers_e0', 'sw1', 'sw1_p5'),
    ],
    annotations: [
      zone('z1', 96, 80, 600, 380, SKY, 'Classe · 192.168.1.0/24 (adresses distribuées par DHCP)'),
      text('t1', 110, 460, 'Le chariot de portables : à câbler puis à servir en DHCP.', 12, SLATE),
    ],
  },
};

const noms: Challenge = {
  id: 'noms',
  title: '11 · Des noms plutôt que des numéros',
  level: 4,
  intro:
    'L’intranet du gymnase tourne sur SERVEUR (192.168.1.20)… mais personne ne retient ce numéro. Votre mission d’administrateur : monter un service DNS sur la machine ADMIN et baptiser le site « intranet.local ». Bonne nouvelle : les postes sont déjà réglés pour interroger ADMIN (192.168.1.53) — le service, lui, reste à installer.',
  goalText: 'Faites répondre le site à l’adresse http://intranet.local/.',
  steps: [
    'Double-cliquez ADMIN → « Logiciels » : installez le Serveur DNS.',
    'Ouvrez l’application Serveur DNS et ajoutez un enregistrement A : intranet.local → 192.168.1.20.',
    'Depuis PC1 : « nslookup intranet.local » au Terminal, puis http://intranet.local/ dans le Navigateur.',
  ],
  goal: {
    checks: [
      { kind: 'dns', from: 'PC1', name: 'intranet.local', label: 'PC1 résout intranet.local' },
      { kind: 'http', from: 'PC1', url: 'http://intranet.local/', label: 'La page se charge par son nom' },
    ],
  },
  setup: {
    name: 'Défi — service DNS',
    devices: [
      pc('pc1', 'PC1', 130, 130, '192.168.1.10', 24, {
        dns: '192.168.1.53',
        apps: [{ kind: 'terminal' }, { kind: 'web-browser' }],
      }),
      sw('sw1', 'SW1', 350, 230),
      host('admin', 'ADMIN', 570, 330, '192.168.1.53', {}),
      host('serveur', 'SERVEUR', 570, 130, '192.168.1.20', {
        apps: [
          { kind: 'terminal' },
          { kind: 'web-server', page: '<h1>Intranet du gymnase</h1><p>Menus de la cafétéria, horaires, casiers : tout est là.</p>' },
        ],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'admin', 'admin_e0', 'sw1', 'sw1_p1'),
      link('l3', 'serveur', 'serveur_e0', 'sw1', 'sw1_p2'),
    ],
    annotations: [zone('z1', 96, 96, 570, 330, SKY, 'Réseau du gymnase · 192.168.1.0/24')],
  },
};

const intranet: Challenge = {
  id: 'intranet',
  title: '12 · L’intranet complet',
  level: 4,
  intro:
    'Projet de synthèse : le gymnase vous confie l’informatique d’une nouvelle salle. Sur le plan : un serveur déjà adressé (les serveurs gardent une adresse FIXE) et deux postes d’élèves — rien d’autre. Commutation, adressage automatique, noms de domaine, site web : tout ce que vous avez appris, assemblé en un vrai petit intranet.',
  goalText: 'Montez l’infrastructure complète : DHCP pour les élèves, DNS et web sur le serveur.',
  steps: [
    'Ajoutez un Commutateur et un Routeur ; câblez SERVEUR, ELEVE1, ELEVE2 et le routeur au commutateur.',
    'Adressez le routeur : 10.10.0.1/24 sur son interface câblée.',
    'Console du routeur → DHCP : plage 10.10.0.100, 20 adresses, /24, passerelle 10.10.0.1 et DNS 10.10.0.53 (le serveur).',
    'Sur SERVEUR : installez « Serveur web » ET « Serveur DNS », puis ajoutez l’enregistrement A intranet.local → 10.10.0.53.',
    'En Simulation : les élèves obtiennent leur adresse tout seuls, puis chargez http://intranet.local/.',
  ],
  goal: {
    checks: [
      { kind: 'dhcp', client: 'ELEVE1', label: 'ELEVE1 obtient une adresse par DHCP' },
      { kind: 'dns', from: 'ELEVE1', name: 'intranet.local', label: 'ELEVE1 résout intranet.local (option DNS du DHCP)' },
      { kind: 'http', from: 'ELEVE2', url: 'http://intranet.local/', label: 'ELEVE2 affiche l’intranet par son nom' },
    ],
  },
  setup: {
    name: 'Défi — intranet complet',
    devices: [
      host('serveur', 'SERVEUR', 150, 140, '10.10.0.53', {}),
      pc('eleve1', 'ELEVE1', 150, 330, undefined, undefined, { apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
      pc('eleve2', 'ELEVE2', 320, 420, undefined, undefined, { apps: [{ kind: 'terminal' }, { kind: 'web-browser' }] }),
    ],
    links: [],
    annotations: [
      zone('z1', 110, 90, 600, 400, SKY, 'Nouvelle salle · 10.10.0.0/24'),
      text('t1', 130, 520, 'Serveur fixe : 10.10.0.53 · Élèves : adresses automatiques.', 12, SLATE),
    ],
  },
};

// ═══════════════════════ Niveau 5 · Vers l’Internet ═══════════════════════

const natChallenge: Challenge = {
  id: 'nat',
  title: '13 · Toute la maison derrière une adresse',
  level: 5,
  intro:
    'À la maison, vos appareils utilisent des adresses PRIVÉES (192.168.1.x) — des adresses que l’Internet refuse de router : le serveur public ne saurait pas où répondre. Votre « box » (R1) possède UNE adresse publique : 203.0.113.1. Le NAT est l’art de faire passer toute la maison par cette adresse-là. Ici, il n’est pas encore configuré.',
  goalText: 'Donnez l’accès à Internet au réseau de la maison grâce au NAT.',
  steps: [
    'Console de R1 → NAT : activez le NAT.',
    'Désignez l’interface EXTERNE : eth1 (203.0.113.1), celle qui regarde Internet.',
    'Depuis PC1, chargez http://203.0.113.10/ — et cherchez dans le journal l’adresse source du paquet AVANT et APRÈS la box.',
  ],
  goal: {
    checks: [{ kind: 'http', from: 'PC1', url: 'http://203.0.113.10/', label: 'PC1 charge la page du serveur public' }],
  },
  setup: {
    name: 'Défi — NAT',
    devices: [
      pc('pc1', 'PC1', 110, 200, '192.168.1.10', 24, {
        gateway: '192.168.1.1',
        apps: [{ kind: 'terminal' }, { kind: 'web-browser' }],
      }),
      sw('sw1', 'SW1', 250, 200, 3),
      router('r1', 'R1', 400, 200, [
        rif('r1_e0', 'eth0', '192.168.1.1', 24),
        rif('r1_e1', 'eth1', '203.0.113.1', 24),
      ]),
      sw('sw2', 'SW2', 550, 200, 3),
      host('web', 'WEB', 690, 200, '203.0.113.10', {
        apps: [
          { kind: 'terminal' },
          { kind: 'web-server', page: '<h1>Bienvenue depuis Internet</h1><p>Le NAT a masqué votre adresse privée derrière celle de la box.</p>' },
        ],
      }),
    ],
    links: [
      link('l1', 'pc1', 'pc1_e0', 'sw1', 'sw1_p0'),
      link('l2', 'r1', 'r1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e1', 'sw2', 'sw2_p0'),
      link('l4', 'web', 'web_e0', 'sw2', 'sw2_p1'),
    ],
    annotations: [
      zone('za', 86, 168, 252, 132, SKY, 'Maison · 192.168.1.0/24 (privé)'),
      zone('zb', 526, 168, 250, 132, RED, 'Internet · 203.0.113.0/24'),
      text('tr', 388, 286, 'la « box » (NAT)', 12, SLATE),
    ],
  },
};

const portForward: Challenge = {
  id: 'nat-port',
  title: '14 · Un serveur dans le salon',
  level: 5,
  intro:
    'Vous hébergez votre site perso sur l’ordinateur du salon (SRV, adresse privée). Un ami (CLIENT) veut le consulter depuis Internet : impossible — le NAT de la box jette les connexions entrantes qu’il n’a pas sollicitées. La parade s’appelle redirection de port : « tout ce qui frappe au port 80 de mon adresse publique, envoie-le à SRV ».',
  goalText: 'Exposez le serveur du salon à travers le NAT de la box.',
  steps: [
    'Console de R1 → NAT : le NAT est déjà actif, eth1 est l’interface externe.',
    'Ajoutez une redirection de port : TCP, port public 80 → 192.168.1.10, port 80.',
    'Depuis CLIENT, chargez http://203.0.113.1/ — l’adresse PUBLIQUE de la box, pas celle de SRV.',
  ],
  goal: {
    checks: [{ kind: 'http', from: 'CLIENT', url: 'http://203.0.113.1/', label: 'CLIENT charge le site hébergé derrière la box' }],
  },
  setup: {
    name: 'Défi — redirection de port',
    devices: [
      host('srv', 'SRV', 110, 200, '192.168.1.10', {
        gateway: '192.168.1.1',
        apps: [
          { kind: 'terminal' },
          { kind: 'web-server', page: '<h1>Mon site perso</h1><p>Servi depuis le salon, à travers la redirection de port de la box.</p>' },
        ],
      }),
      sw('sw1', 'SW1', 250, 200, 3),
      router('r1', 'R1', 400, 200, [
        rif('r1_e0', 'eth0', '192.168.1.1', 24),
        rif('r1_e1', 'eth1', '203.0.113.1', 24),
      ], { nat: { wanInterfaceId: 'r1_e1' } }),
      sw('sw2', 'SW2', 550, 200, 3),
      pc('client', 'CLIENT', 690, 200, '203.0.113.50', 24, {
        gateway: '203.0.113.1',
        apps: [{ kind: 'terminal' }, { kind: 'web-browser' }],
      }),
    ],
    links: [
      link('l1', 'srv', 'srv_e0', 'sw1', 'sw1_p0'),
      link('l2', 'r1', 'r1_e0', 'sw1', 'sw1_p1'),
      link('l3', 'r1', 'r1_e1', 'sw2', 'sw2_p0'),
      link('l4', 'client', 'client_e0', 'sw2', 'sw2_p1'),
    ],
    annotations: [
      zone('za', 86, 168, 252, 132, SKY, 'Salon · 192.168.1.0/24 (privé)'),
      zone('zb', 526, 168, 250, 132, RED, 'Internet · 203.0.113.0/24'),
      text('tr', 388, 286, 'la « box » (NAT)', 12, SLATE),
    ],
  },
};

const chemins: Challenge = {
  id: 'routage-dynamique',
  title: '15 · Le chemin le plus rapide',
  level: 5,
  intro:
    'Trois campus reliés en triangle : deux liaisons modernes à 1 Gb/s… et un vieux lien direct à 10 Mb/s d’une autre époque. Configurer toutes les routes à la main serait pénible — et tout serait à refaire au moindre changement. Les protocoles de routage dynamique s’en chargent : les routeurs se découvrent et calculent leurs routes tout seuls. Activez-en un, et comparez leurs philosophies.',
  goalText: 'Laissez les routeurs apprendre leurs routes avec RIP ou OSPF.',
  steps: [
    'Sur R1, R2 et R3 (console → Routage), choisissez le MÊME protocole : RIP ou OSPF.',
    'Tapez « route » dans le terminal d’un routeur : les routes apprises apparaissent.',
    'Comparez : RIP compte les SAUTS (il choisira le vieux lien direct), OSPF pèse la BANDE PASSANTE (il fera le détour rapide). Regardez circuler vos pings !',
  ],
  goal: {
    checks: [{ kind: 'ping', from: 'PC1', to: 'PC2', label: 'PC1 joint PC2 via des routes apprises automatiquement' }],
  },
  setup: {
    name: 'Défi — routage dynamique',
    devices: [
      pc('pc1', 'PC1', 80, 230, '192.168.1.10', 24, { gateway: '192.168.1.1' }),
      router('r1', 'R1', 270, 230, [
        rif('r1_e0', 'eth0', '192.168.1.1', 24),
        rif('r1_e1', 'eth1', '10.0.12.1', 30),
        rif('r1_e2', 'eth2', '10.0.13.1', 30),
      ]),
      router('r2', 'R2', 470, 110, [
        rif('r2_e0', 'eth0', '10.0.12.2', 30),
        rif('r2_e1', 'eth1', '10.0.23.1', 30),
      ]),
      router('r3', 'R3', 470, 350, [
        rif('r3_e0', 'eth0', '192.168.3.1', 24),
        rif('r3_e1', 'eth1', '10.0.23.2', 30),
        rif('r3_e2', 'eth2', '10.0.13.2', 30),
      ]),
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
      zone('z1', 56, 200, 130, 118, SKY, 'Campus 1 · 192.168.1.0/24'),
      zone('z3', 626, 320, 130, 118, GREEN, 'Campus 3 · 192.168.3.0/24'),
      text('t12', 360, 150, 'R1–R2 · 1 Gb/s', 11, SLATE),
      text('t23', 506, 240, 'R2–R3 · 1 Gb/s', 11, SLATE),
      text('t13', 300, 322, 'R1–R3 · 10 Mb/s (lent)', 11, SLATE),
    ],
  },
};

const delegation: Challenge = {
  id: 'dns-iteratif',
  title: '16 · L’annuaire est trop grand pour un seul serveur',
  level: 5,
  intro:
    'Le vrai DNS mondial n’est pas un annuaire unique : c’est une HIÉRARCHIE, où chaque serveur délègue les zones qu’il ne connaît pas à d’autres serveurs. Ici, votre résolveur DNS1 ne connaît pas la zone « local » — c’est DNS2 qui en fait autorité. Apprenez à DNS1 à qui la déléguer, et regardez le client suivre la piste lui-même.',
  goalText: 'Résolvez web.local grâce à une délégation de zone (enregistrement NS).',
  steps: [
    'Double-cliquez DNS1 → application Serveur DNS : ajoutez un enregistrement NS : zone « local » → 192.168.1.53 (DNS2).',
    'Depuis PC1 : « nslookup web.local ». En mode itératif, DNS1 renvoie une RÉFÉRENCE — c’est PC1 qui va frapper à la porte de DNS2.',
    'Suivez les DEUX requêtes successives de PC1 dans le journal : voilà l’itératif.',
  ],
  goal: {
    checks: [{ kind: 'dns', from: 'PC1', name: 'web.local', label: 'PC1 résout web.local en suivant la délégation' }],
  },
  setup: {
    name: 'Défi — délégation DNS',
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
    annotations: [
      zone('z1', 96, 86, 540, 326, SKY, 'Réseau local · 192.168.1.0/24'),
      text('t1', 500, 440, 'DNS1 = résolveur du client · DNS2 = autorité de la zone « local »', 12, SLATE),
    ],
  },
};

const recursif: Challenge = {
  id: 'dns-recursif',
  title: '17 · Le résolveur qui se déplace pour vous',
  level: 5,
  intro:
    'Même hiérarchie DNS, mais un piège : DNS2, le serveur qui fait autorité, vit dans un réseau que PC1 ne peut pas joindre (PC1 n’a pas de passerelle). Suivre la référence ne mène nulle part. Un résolveur RÉCURSIF règle le problème : il part LUI-MÊME chercher la réponse — lui sait passer le routeur — et vous la rapporte toute prête.',
  goalText: 'Activez la récursivité de DNS1 pour résoudre web.local malgré le réseau cloisonné.',
  steps: [
    'Constatez d’abord l’échec : « nslookup web.local » depuis PC1 (il reçoit la référence… qu’il ne peut pas suivre).',
    'Double-cliquez DNS1 → Serveur DNS : cochez « Résolution récursive ».',
    'Recommencez : DNS1 interroge DNS2 à votre place (lui a une passerelle) et renvoie la réponse finale à PC1.',
  ],
  goal: {
    checks: [{ kind: 'dns', from: 'PC1', name: 'web.local', label: 'PC1 obtient la réponse via le résolveur récursif' }],
  },
  setup: {
    name: 'Défi — DNS récursif',
    devices: [
      // PC1 n'a PAS de passerelle : il ne peut joindre que son réseau local.
      pc('pc1', 'PC1', 96, 96, '192.168.1.10', 24, { dns: '192.168.1.50' }),
      host('dns1', 'DNS1', 96, 300, '192.168.1.50', {
        gateway: '192.168.1.1',
        apps: [
          { kind: 'terminal' },
          { kind: 'dns-server', records: [{ type: 'NS', name: 'local', value: '192.168.2.53' }], recursive: false },
        ],
      }),
      sw('sw1', 'SW1', 300, 198),
      router('r1', 'R1', 490, 198, [
        rif('r1_e0', 'eth0', '192.168.1.1', 24),
        rif('r1_e1', 'eth1', '192.168.2.1', 24),
      ]),
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

export const CHALLENGES: Challenge[] = [
  premierReseau,
  troisiemePoste,
  posteMuet,
  masque,
  deuxSalles,
  routeurChallenge,
  reponsePerdue,
  deuxBatiments,
  boucle,
  classeMobile,
  noms,
  intranet,
  natChallenge,
  portForward,
  chemins,
  delegation,
  recursif,
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
