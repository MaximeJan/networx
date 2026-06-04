# Networx

**Simulateur de réseaux pédagogique** de type [Filius](https://www.lernsoftware-filius.de/),
100 % navigateur — aucune installation, sauvegarde automatique locale. Pensé pour
les élèves d'OC informatique au gymnase : on **construit une topologie**, on la
**configure**, puis on **envoie des paquets que l'on regarde circuler en temps réel**,
saut par saut, à travers les couches du modèle OSI.

Interface entièrement en français. Deux modes, comme dans Filius : **Conception**
(placer, câbler, configurer) et **Simulation** (lancer des commandes, observer les
paquets et le journal des événements).

---

## Ce que le simulateur permet de faire

### Construire un réseau (mode Conception)

- **Trois appareils**, glissés-déposés depuis la palette : **Ordinateur**,
  **Commutateur (switch)**, **Routeur**. Un « serveur » est simplement un
  ordinateur sur lequel on installe un logiciel serveur.
- **Câblage** par les ports : clic sur un port libre, puis clic sur un autre. Les
  câbles s'ancrent automatiquement sur le bord des appareils.
- **Édition confortable** :
  - **sélection au lasso** (clic gauche maintenu) et **Maj+clic** pour ajuster ;
  - **déplacement de groupe** et **copier/coller** (Ctrl+C / Ctrl+V) — appareils,
    câbles internes **et** annotations sont dupliqués ;
  - **déplacement de la vue** au clic-molette (bouton du milieu), **zoom** à la
    molette ;
  - **annuler / rétablir** (Ctrl+Z / Ctrl+Y), **supprimer** (Suppr).
- **Annotations** pour documenter le plan : **étiquettes de texte** et **zones
  colorées** (rectangles translucides posés derrière les appareils, p. ex. pour
  délimiter un sous-réseau), avec un **sélecteur de couleur précis** (pipette +
  code hexadécimal). Les annotations restent visibles en Simulation.
- **Persistance** : sauvegarde automatique dans le navigateur, plus **Ouvrir /
  Enregistrer** un réseau au format `.json`.

### Configurer les appareils

Un **double-clic** sur un appareil ouvre sa fenêtre façon système d'exploitation
(en Conception comme en Simulation) :

- **Ordinateur** — outil « Réseau » (adresse IP, masque, passerelle, serveur DNS),
  renommage, et **installateur de logiciels**.
- **Routeur** — console d'administration (accent orange) avec les outils
  **Interfaces**, **Table de routage**, **DHCP**, **NAT** et **Terminal**.
- **Commutateur** — renommage et état des ports.

Le Terminal et le Navigateur web n'émettent des paquets qu'en mode Simulation
(grisés en Conception).

### Couches et protocoles modélisés

- **Physique** — câbles, propagation avec délai.
- **Liaison (L2)** — trames Ethernet, adresses MAC, **commutateur** qui apprend
  les MAC et commute/diffuse, **ARP** (résolution IP→MAC avec cache).
- **Réseau (L3)** — **IPv4 / CIDR** (masques, sous-réseaux), **routage** :
  - **routes statiques** (table éditable, interface de sortie déduite de la
    passerelle),
  - **routage dynamique RIP** (métrique = nombre de sauts) et **OSPF** (métrique =
    coût, dérivé de la **bande passante** réglable sur chaque câble),
  - **ICMP** : `ping`, **`traceroute`** (TTL + time-exceeded),
  - **NAT** configurable : interface externe (WAN), translation de port sortante
    (PAT) et **redirection de port** entrante pour héberger un serveur.
- **Transport (L4)** — **UDP** et **TCP** simplifié (poignée de main, données, FIN).
- **Application (L7)** :
  - **DNS** réaliste — enregistrements **A / CNAME / NS**, résolution **récursive**
    ou **itérative** (délégation de zone) ;
  - **Web (HTTP)** — serveur web à page éditable, navigateur affichant la page par
    IP ou par nom ;
  - **DHCP** (DORA) — distribué par un routeur, avec options passerelle et DNS.

### Observer (mode Simulation)

- **Paquets animés en temps réel** le long des câbles, **colorés par protocole**.
- Contrôles **Lecture / Pause / Pas-à-pas / Vitesse** (0,5× à 4×).
- **Journal des événements** filtrable par **couche** et par **nœud**, avec mode
  **plein écran**.
- **Terminal** par machine : `ping`, `traceroute`, `nslookup`, `dhcp`, `route`,
  `ipconfig`, `arp`, `help`, `clear` (avec historique ↑/↓).

### Apprendre avec des défis

**15 défis guidés** progressifs (câblage → adresses IP → masque → passerelles →
deux routeurs → DHCP → options DHCP → DNS → CNAME → DNS itératif/récursif → NAT →
redirection de port → route statique → routage dynamique). Chaque défi présente
une **mise en situation**, un **objectif clair** et un dépliant **« Besoin d'aide ? »**
(indications repliées). L'objectif est **vérifié automatiquement** en rejouant la
simulation.

---

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5191
```

### Scripts

```bash
npm run typecheck    # tsc --noEmit (TypeScript strict)
npm run lint         # eslint .
npm run format       # prettier --write
npm run test         # vitest run  (logique pure : IP/MAC, moteur, routage, défis…)
npm run test:coverage
npm run build        # tsc --noEmit && vite build
```

## Déploiement

Déploiement automatique sur **GitHub Pages** via GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) à chaque push sur
`main`. La base d'URL Vite s'adapte automatiquement au nom du dépôt. Pour activer :
**Settings → Pages → Source : GitHub Actions**.

## Architecture

- **React 18 + Vite + TypeScript strict**, Tailwind CSS, lucide-react, **Vitest**.
- Séparation stricte : **logique pure** (`src/lib/`, sans React, testée à froid) —
  arithmétique IP/MAC, moteur à **événements discrets**, piles ARP/IP, routage
  dynamique, (dé)sérialisation ; **état réutilisable** dans des hooks ; **rendu**
  dans des composants présentationnels ; l'orchestrateur `src/App.tsx` ne tient que
  l'état partagé et la composition.

Voir [`CLAUDE.md`](CLAUDE.md) pour la carte des fichiers et [`ROADMAP.md`](ROADMAP.md)
pour l'avancement détaillé par phases.

> Projet jumeau de **Logix** (simulateur de circuits), dont il reprend l'ossature
> via le skill `appweb`. La différence clé : un réseau est **asynchrone /
> événementiel** (file d'événements à horloge virtuelle), là où un circuit
> combinatoire est synchrone.

## Licence

Distribué sous licence **Creative Commons Attribution - Pas d'Utilisation
Commerciale 4.0 International (CC BY-NC 4.0)** — voir [`LICENSE`](LICENSE).

© 2026 Maxime Jan. Vous êtes libre de partager et d'adapter ce travail à des fins
**non commerciales**, avec **attribution**.
[Résumé](https://creativecommons.org/licenses/by-nc/4.0/deed.fr) ·
[Texte complet](https://creativecommons.org/licenses/by-nc/4.0/legalcode)
