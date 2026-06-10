# Networx — projet pédagogique

Simulateur de réseaux de type **Filius** pour élèves d'OC informatique au gymnase
suisse (Fribourg). Objectif : construire une topologie (PC, switch, routeur…),
configurer les adresses IP, puis **envoyer des paquets et les regarder circuler
en temps réel** saut par saut, avec inspection couche par couche. App web, aucune
installation, autosave navigateur. Projet jumeau de **Logix** (circuit-simulator)
dont il reprend l'architecture via le skill `appweb`.

## Public et style pédagogique

- Élèves 16-18 ans avec quelques bases (Python, binaire). Pas développeurs.
- Labels et UI en **français** (« Ordinateur », « Commutateur », « Routeur »).
- Deux modes comme Filius : **Conception** (placer, câbler, configurer) et
  **Simulation** (lancer des apps, envoyer des paquets, observer).
- Couverture des couches : physique (câbles), liaison (Ethernet/MAC, commutation,
  ARP), réseau (IPv4, CIDR, routage, ICMP), transport (UDP/TCP — phases futures),
  application (ping, puis web/DNS — phases futures).

## La différence clé avec Logix (à intégrer)

Logix est **combinatoire/synchrone** (tri topologique + évaluation → état stable).
Un réseau est **asynchrone/événementiel** : les trames se propagent avec un délai,
il y a des files et des temporisateurs (expiration ARP…). Le cœur de Networx est
donc un **moteur à événements discrets (DES)**, pas un `simulate()` :

- horloge virtuelle (ticks) + file d'événements triée par date ;
- `step(world)` : avance à l'événement suivant, le traite (peut émettre des
  trames et planifier de futurs événements), renvoie un **nouveau** `world` —
  **pur et déterministe**, donc testable à froid en Vitest ;
- `useSimulationEngine` mappe le temps réel (rAF) → ticks (play/pause/pas-à-pas/
  vitesse) et n'arme les timers que s'il y a des paquets en vol ou des événements
  en attente (cf. moteur temporel de Logix).

Chaque appareil = **pile de couches OSI**, chaque couche = fonction pure
`(pdu, deviceState) → actions` (remonter / redescendre / émettre sur une
interface / planifier un timer / jeter). Équivalent réseau du `fn` d'une porte.

> **Réflexe gagnant** : modéliser et tester le routage d'un paquet en logique pure
> AVANT de dessiner. Une fois « ping A→B » correct dans un test Vitest (Phase 4),
> l'animation (Phase 5) n'est plus que du rendu.

## Stack et organisation

- **React 18 + Vite + TypeScript strict**, Tailwind CSS, lucide-react,
  IBM Plex Sans/Mono (Google Fonts). **Vitest** pour la logique pure, **ESLint**
  (flat config) + **Prettier**.
- Séparation stricte : logique pure (`lib/`) sans React, état réutilisable
  (`hooks/`), présentation (`components/`). L'orchestrateur `src/App.tsx` ne tient
  que l'état partagé, les handlers et la composition — **aucune logique réseau**.

### Carte des fichiers (cible ; * = pas encore créé)

```
src/
  main.tsx               montage React
  App.tsx                ORCHESTRATEUR : état, handlers, composition
  domain/
    types.ts             vocabulaire COMPLET. Deux mondes : DOCUMENT (Topology,
                         Device, NetInterface, Link, Route, AppConfig, Annotation
                         (zone/texte) — persisté, undoable) et RUNTIME (World,
                         SimEvent, InFlightPacket, DeviceRuntime, ArpEntry,
                         MacTableEntry, LogEntry). + les PDU par couche
                         (EthernetFrame, ArpPacket, Ipv4Packet, IcmpMessage,
                         UdpDatagram, TcpSegment) et Selection (multi-appareils).
  lib/                   logique pure, SANS React :
    ip.ts                CIDR : parse/format, maskInt (gère le piège du <<32),
                         prefix↔mask, networkAddress, broadcast, sameSubnet
    mac.ts               normalizeMac, isValidMac, randomMac (RNG injectable),
                         BROADCAST_MAC, isUnicast/isBroadcast
    topology.ts          mutations PURES du document (add/move/remove device(s),
                         moveDevicesTo, pasteDevices (copier/coller), add/removeLink,
                         updateInterface, setDeviceFields, setDeviceRoutes (table de
                         routage), add/update/removeAnnotation) + normalizeTopology
    persist.ts           serialize / deserialize robuste (valide données externes,
                         filtre kinds inconnus, normalise MAC/IP) + FORMAT_VERSION
    storage.ts           load/saveTopology via localStorage (tolérant aux erreurs)
    geometry.ts          snap, deviceCenter, devicePortPositions, findPortPosition,
                         borderAnchor (ancrage câble mobile sur le bord, face au pair),
                         contentBounds (boîte englobante du contenu, pour cadrer la vue)
    id.ts                uid(prefix)
    file.ts              downloadText / readFileText (export/import .json ; DOM)
    constants.ts         GRID, STORAGE_KEY, DEVICE_W/H, PORT_R/GAP, ZOOM_MIN/MAX, APP_KINDS
    engine.ts            moteur à événements discrets : createWorld, emitFrame,
                         startPing (IP/nom), startDnsLookup, startHttpGet, startDhcp,
                         step, run. linkDelay(bandwidth) : propagation d'une trame
                         selon le débit du câble (100 Mb/s = LINK_DELAY de réf.).
                         describeFrame : libellé de journal par protocole (explicite).
                         Couches LIAISON (switch/filtre MAC), RÉSEAU
                         (ARP+file, routage IP, transfert+TTL, ICMP, broadcast, NAT),
                         TRANSPORT (UDP ; TCP simplifié = handshake+données+FIN) et
                         APPLI (DNS, web HTTP, DHCP DORA — servi par un routeur dont
                         device.dhcp est configuré → configure l'interface cliente
                         dans le world). Routeur renvoie ICMP time-exceeded si TTL
                         épuisé → startTraceroute. NAT (device.nat) : PAT sortant par
                         l'interface WAN + redirection de port entrante. applyDynamicRoutes
                         injecte les routes RIP/OSPF dans le runtime. Pur/déterministe.
    routing.ts           routage DYNAMIQUE pur : computeDynamicRoutes (segments L2 +
                         Dijkstra par routeur) → tables convergées RIP (sauts) / OSPF
                         (coût = REFERENCE_BW / débit du câble). ospfCost.
    challenge.ts         verifyGoal(topology, goal) : auto-configure les clients
                         DHCP puis rejoue la simu pour valider l'objectif d'un défi
                         (ping/http/dns/dhcp). Pur.
    frames.ts            constructeurs purs : ethernet (surcharges arp/ipv4),
                         arpRequest/Reply, ipv4(), udp(), tcp(), icmpEcho(), DEFAULT_TTL
    stack/
      arp.ts             cache ARP pur : lookupArp, withArp
      ip.ts              resolveRoute : direct → routes statiques+apprises
                         (longest-prefix, statique prioritaire) → gateway
    terminal.ts          runCommand pur : help/ipconfig/route/arp/clear + intentions
                         ping/nslookup/traceroute/dhcp
    diagnose.ts          diagnoseFailure pur : explique POURQUOI un ping/HTTP/DNS/DHCP
                         échoue (abandons journalisés + analyse de routage resolveRoute :
                         pas d'IP/route/passerelle, masques incohérents, ARP muet, TTL,
                         DNS, hôte sans serveur web). Utilisé par Terminal & WebBrowserApp
  devices/
    registry.ts          DEFS par kind (UNIQUEMENT pc/switch/router), DEVICE_ORDER,
                         getDeviceDef, createDevice, nextDeviceName. Un « serveur »
                         = un Ordinateur avec un logiciel serveur (web/DNS) installé.
    apps.ts              catalogue des logiciels (AppDef : label/icône/description/
                         system/available), APP_ORDER, getAppDef
  hooks/
    useHistory.ts        undo/redo générique : commit (structurel) / set (éphémère)
    useAutosave.ts       sauvegarde debounce
    useViewport.ts       zoom/pan + screenToWorld + fitTo (cadrage sur un rectangle)
    useKeyboardShortcuts.ts  Suppr / Ctrl+Z / Ctrl+Y / Échap
    useSimulationEngine.ts  rAF → ticks (play/pause/pas-à-pas/vitesse) ; n'arme le
                         rAF que s'il y a des événements en file ; clock continu
                         pour interpoler les paquets ; saute les temps morts (rien
                         en vol → l'horloge avance au prochain événement) ;
                         ping() = startPing + relance ; reset() ré-arme la boucle
    useDeviceWindows.ts  état des fenêtres d'appareils ouvertes (z-order) : open/
                         focus/close — utilisé en Conception ET en Simulation
  components/            présentation (.tsx), pilotées par props/handlers :
    DeviceShape.tsx      rendu partagé d'un appareil (DeviceCard : ombre douce, tuile
                         d'icône colorée, halo de sélection) + DotGrid (grille en points)
    cableGeometry.ts     linkAnchors/anchorOf : ancrages de câble sur les bords (pur)
    Canvas.tsx           canevas Conception : DÉPÔT d'appareil (drag & drop), CÂBLAGE
                         par les ports LIBRES (clic→clic, bandeau d'aide pendant le
                         tracé), SÉLECTION AU LASSO (clic gauche maintenu), PAN à la
                         molette PRESSÉE (bouton du milieu), CADRAGE AUTO de la vue
                         (montage + fitSignal au chargement défi/fichier) + accueil
                         du canevas vide (3 gestes de base),
                         déplacement de GROUPE, DÉPÔT d'annotation (drag & drop ;
                         zone à taille de base, redimensionnable par sa poignée),
                         DOUBLE-CLIC sur un appareil → ouvre sa fenêtre. Zones derrière.
    Toolbar              undo/redo, supprimer, Ouvrir/Enregistrer (JSON)
    Palette              appareils ET annotations (« Zone de texte », « Zone colorée »)
                         GLISSABLES (drag & drop) ; DEVICE_DND_TYPE / ANNOTATION_DND_TYPE
    DeviceWindows.tsx    couche de fenêtres d'appareils (MachineWindow/RouterWindow/
                         SwitchWindow par kind) — partagée Conception (sans moteur →
                         Terminal/Navigateur grisés) & Simulation (avec moteur).
                         DeviceWindowHandlers = tous les handlers de config par id.
    SwitchWindow.tsx     petite fenêtre commutateur (accent teal) : renommage + ports
                         + table MAC vivante (en Simulation, engine optionnel)
    AnnotationPanel      éditeur FLOTTANT d'une annotation (texte/zone) : contenu,
                         taille, nom de zone, couleur, suppression
    LinkPanel            éditeur FLOTTANT d'un câble : extrémités + débit (10/100/1000
                         Mb/s, coût OSPF affiché) + suppression
                         (le panneau de config docké a disparu : tout passe par les fenêtres)
  challenges.ts          15 défis (Goal, Challenge = intro + steps[] + setup avec
                         annotations zones/texte) + getChallenge
    SimulationView.tsx   orchestre la Simulation (hook + contrôles + panneaux + fenêtres)
    SimCanvas.tsx        canevas Simulation : topologie + annotations (lecture seule)
                         + paquets animés ; double-clic sur un hôte → fenêtre machine ;
                         cadrage auto à l'entrée + légende des couleurs de paquets
    ViewportControls.tsx contrôles de vue en surimpression (zoom −/%/+, cadrer) —
                         partagés par Canvas et SimCanvas
    PacketInspector.tsx  clic sur un paquet en vol (SimCanvas) → couches OSI dépliées
                         (Ethernet → ARP / IPv4 → ICMP / UDP→DNS·DHCP / TCP→HTTP)
    RouterConfig.tsx     éditeurs réseau réutilisables (Field, InterfacesSection,
                         RoutesSection [+ sélecteur de protocole Statique/RIP/OSPF],
                         DhcpSection, NatSection) — partagés par les fenêtres et leurs
                         éditeurs (Conception ET Simulation)
    RouterWindow.tsx     console d'administration d'un routeur (appliance sombre,
                         accent orange) — même mécanique que MachineWindow : MULTITÂCHE
                         (outils montés en fond, Terminal garde son historique), barre
                         des tâches persistante (Console · outils ouverts · LED des
                         services DHCP/NAT [vert actif / ambre armé sans WAN] + badge
                         Routage Statique/RIP/OSPF cliquables + horloge), barre de
                         titre par outil (réduire/fermer), écran redimensionnable ;
                         accueil = TABLEAU DE BORD (état des ports câblé/IP + services)
                         puis outils Terminal/Interfaces(+renommage)/Routage/DHCP/NAT ;
                         engine optionnel (Terminal grisé en Conception)
    MachineWindow.tsx    fenêtre façon OS d'un ordinateur : bureau + tuiles, MULTITÂCHE
                         (les apps ouvertes restent montées → le Terminal garde son
                         historique en arrière-plan), barre des tâches persistante
                         (Bureau · apps ouvertes · pastille réseau cliquable + horloge),
                         barre de titre par app (réduire/fermer), écran REDIMENSIONNABLE
                         (poignée bas-droit),
                         papier peint PROPRE À CHAQUE MACHINE (hash de l'id), TOAST
                         « Réseau connecté » quand la machine obtient une IP (DHCP !) ;
                         outils « Réseau » (IP/passerelle/DNS + renommage) et
                         « Logiciels » (installateur) ; engine optionnel
                         (Terminal/Navigateur grisés en Conception)
    Terminal.tsx         ligne de commande (historique ↑/↓) : ping, traceroute,
                         nslookup, dhcp, route, ipconfig, arp…
    AppInstaller.tsx     installer/désinstaller des logiciels (persiste dans le document)
    DnsServerApp.tsx     éditeur d'enregistrements DNS (nom→IP) du serveur
    WebServerApp.tsx     éditeur de la page HTML servie
    WebBrowserApp.tsx    navigateur au chrome complet : onglet (titre = hôte, spinner),
                         Précédente/Recharger, champ d'adresse, barre de progression,
                         rendu de la page (HTTP) + barre d'état (statut, octets)
    ChallengePanel.tsx   panneau LATÉRAL DROIT du défi : mise en situation + objectif
                         encadré + dépliant « Besoin d'aide ? » (indications repliées)
                         + bouton « Vérifier » + résultat. Affiché dans les 2 modes
                         (en Simulation, à droite à côté du journal).
    EventLog.tsx         journal coloré par tag, filtres par couche OSI (champ
                         layer des entrées) et par nœud, auto-scroll (SON conteneur)
tests/                   Vitest : importent la VRAIE logique de src/lib
    ip, mac, geometry, topology, persist, storage, devices, engine, stack, ping
exemples/
    reseau-demo.json     réseau de démo (DHCP+DNS+Web, pc/switch/router) — fichier
                         local autonome, PLUS importé par l'app : on l'ouvre via
                         le bouton « Ouvrir » (sélecteur de fichier). Pas de bouton
                         « Exemple ».
CLAUDE.md  ROADMAP.md  README.md
```

## Comment développer

```bash
npm install
npm run dev          # http://localhost:5191 (port dédié : 5173 = Logix)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm run format       # prettier --write
npm run test         # vitest run
npm run test:coverage
npm run build        # tsc --noEmit && vite build
```

Après une édition non triviale, **lancer `npm run build` + `npm run lint`**. Le
typage strict attrape la plupart des régressions de logique pure ; le rendu se
vérifie **à l'œil dans le navigateur** (je ne peux pas le tester moi-même —
signale-le si tu ne peux pas tester l'UI). Les tests importent la **vraie**
source de `src/lib`, jamais une copie.

## Conventions de code

- **TypeScript strict, partout.** Pas de `any`, pas de `@ts-ignore`.
- **Normalise aux frontières.** Adresses IP/MAC normalisées à l'entrée ; la
  désérialisation valide et nettoie des données externes non fiables.
- **Deux seuls chemins de mutation du document** (via `useHistory`) :
  `commit(updater)` pour le structurel (entre dans l'historique undo/redo, ex.
  placement/câblage/config), `set(updater)` pour l'interactif éphémère (drag en
  cours). Les handlers de l'orchestrateur délèguent aux fonctions pures de
  `lib/topology` ; `normalizeTopology` garde l'invariant `interface.linkId`.
- **Logique pure → `lib/`** ; définition/résolution d'appareil → `devices/` ;
  état réutilisable → un `hook` ; rendu → `components/`. L'orchestrateur ne garde
  que l'état partagé et la composition.
- **Dépendances minimales** : React, Tailwind, lucide-react. Le reste en TS pur.
- **`e.stopPropagation()`** quand un clic ne doit pas remonter au canevas.

## État des phases

Voir `ROADMAP.md`. Très brièvement :

- **0** : scaffold + boucle qualité + canevas vide + toggle de mode — ✅ fait
- **1** : types du domaine + maths IP/MAC pures (Vitest, lib à 100 % lignes) — ✅ fait
- **2** : éditeur de topologie (mode Conception) : palette, placement, câblage,
  propriétés IP, persist + autosave, zoom/pan, undo/redo — ✅ fait (59 tests)
- **3** : moteur à événements discrets + couche liaison (switch/hub) pur — ✅ fait (68 tests)
- **4** : ARP + routage IP + ICMP ping pur ⭐ jalon — ✅ fait (77 tests)
- **5** : mode Simulation + animation temps réel = **MVP** — ✅ fait (ping animé L1→L3)
- **6a** : bureaux flottants par machine (style Filius) + Terminal ; ping lancé
  UNIQUEMENT depuis le terminal (`ping`/`ipconfig`/`arp`/`help`/`clear`) — ✅ fait
- **6b** : installateur de logiciels + catalogue, apps persistées — ✅ fait
- **7** : couche transport **UDP** + **DNS fonctionnel** (serveur configurable,
  `nslookup`, `ping <nom>` qui résout puis pingue) — ✅ fait (93 tests)
- **8** : **TCP** simplifié (handshake) + **web HTTP** (serveur web à page éditable,
  navigateur qui affiche la page par IP ou par nom DNS) — ✅ fait (98 tests)
- **9** : **DHCP** (DORA ; activé/configuré sur un **routeur** via le panneau de
  propriétés ; terminal `dhcp` côté client) + **scénarios-défis**
  (réseau pré-conçu + objectif vérifié automatiquement en rejouant la simu) — ✅ fait (109 tests)
- **9b** : confort terminal — historique des commandes (↑/↓), `route`, `traceroute`
  (ICMP time-exceeded renvoyé par les routeurs) — ✅ fait (112 tests)
- **9c** : DNS réaliste — types d'enregistrement **A / CNAME / NS**, résolution
  **récursive vs itérative** (drapeau `recursive` du résolveur) + 2 défis (DNS
  itératif = délégation NS ; DNS récursif) — ✅ fait (119 tests)
- **9d** : **NAT configurable** (`device.nat = { wanInterfaceId?, portForwards? }`) :
  interface externe désignée, PAT sortant (overload) + redirection de port (DNAT)
  pour héberger un serveur derrière le NAT + 2 défis (accès Internet ; redirection
  de port) — ✅ fait (131 tests)
- **9e** : **13 défis** (`Challenge` = `intro` + `steps[]`, consignes numérotées
  sans emoji dans `ChallengeBanner`). 4 nouveaux : masque, routage 2 routeurs,
  options DHCP, alias CNAME. `verifyGoal` auto-configure les clients DHCP avant
  l'action — ✅ fait (135 tests)
- **9f** : confort d'édition — **sélection multiple au lasso** + Maj+clic,
  **déplacement de groupe**, **copier/coller** (Ctrl+C/V, `pasteDevices` régénère
  ids/MAC et recopie les liens internes), **pan à la molette pressée** (le clic
  gauche sur le fond fait le lasso), et **annotations** : outils « Zone de texte »
  et « Zone colorée » (rectangles translucides derrière les appareils) dans la
  palette, éditables via `AnnotationPanel` — ✅ fait (143 tests)
- **9g** : **routes statiques** (table de routage éditable sur les routeurs ;
  l'interface de sortie est déduite de la passerelle) + défi 14 « Route statique »
  (passerelle par défaut insuffisante → route nécessaire) — ✅ fait (145 tests)
- **9h** : **console d'administration du routeur** — double-clic sur un routeur en
  Simulation ouvre une fenêtre façon OS (accent orange, distincte des ordinateurs)
  avec outils Terminal/Interfaces/Routage/DHCP/NAT. Éditeurs extraits dans
  `RouterConfig.tsx`, partagés avec le PropertiesPanel — ✅ fait (145 tests)
- **9i** : **routage dynamique RIP / OSPF** — `device.routing` ('static'|'rip'|'ospf'),
  `Link.bandwidth` (coût OSPF), `lib/routing.computeDynamicRoutes` (tables convergées
  pures : RIP=sauts, OSPF=coût bande passante), injectées au runtime
  (`applyDynamicRoutes`). Sélecteur de protocole + panneau de débit du câble +
  défi 15. Aucune perturbation des défis statiques (mode absent ⇒ statique) — ✅ fait (154 tests)
- **9j** : **fenêtres unifiées** — la config des appareils se fait dans la fenêtre
  flottante (double-clic) en Conception ET en Simulation ; PC reçoit un outil
  « Réseau », tous reçoivent le renommage ; Terminal/Navigateur grisés sans moteur.
  **Panneau docké supprimé** (`PropertiesPanel` retiré) ; câbles/annotations →
  petits éditeurs flottants. `DeviceWindows` + `useDeviceWindows` mutualisés — ✅ fait (154 tests)
- **9k** : **défis annotés** — chaque défi délimite ses sous-réseaux par des zones
  colorées + étiquettes de texte (helpers `zone()`/`text()`) ; LAN peuplés
  (commutateurs + postes) pour passerelles/deux-routeurs/DHCP. ids/IP/liens et
  « pièces manquantes » inchangés (tests verts) — ✅ fait (154 tests)
- **9l** : **consigne du défi en panneau latéral droit** (`ChallengePanel`, remplace
  le bandeau) : mise en situation + objectif encadré + dépliant « Besoin d'aide ? »
  (indications repliées par défaut) + Vérifier. Déploiement **GitHub Pages** via
  GitHub Actions (`.github/workflows/deploy.yml`, base Vite auto) — ✅ fait
- **9m** : **diagnostic d'échec pédagogique** — `lib/diagnose.ts` (`diagnoseFailure`,
  pur) explique le POURQUOI d'un ping/HTTP/DNS/DHCP en échec (source sans IP, cible
  inexistante, autre réseau sans passerelle, passerelle hors sous-réseau, routeur en
  aval sans route, masques incohérents, ARP muet, TTL épuisé, pas de DNS/DHCP, hôte
  sans serveur web). Honnête sur l'ARP. Branché dans `Terminal` + `WebBrowserApp` — ✅ fait (167 tests)
- **9n** : **annotations en glisser-déposer** — « Zone de texte » et « Zone colorée »
  se glissent depuis la palette comme les appareils (`ANNOTATION_DND_TYPE`). La zone
  reçoit une **taille de base modeste** (`ZONE_DEFAULT_W/H`), redimensionnable par sa
  poignée. Suppression du mode-outil (clic/tracé) : `tool`/`AnnotationTool`/`onToolDone`
  retirés de `App`/`Palette`/`Canvas` — ✅ fait
- **10** : **expiration ARP** (requête sans réponse → paquets en attente abandonnés
  après `ARP_TIMEOUT`, journalisé ; annulée dès qu'une réponse arrive ; une seule
  requête ARP par saut en attente) + **table MAC vivante** dans `SwitchWindow` +
  journal filtré par **couche réelle** (`layer`) + **avance rapide des temps morts**
  (rien en vol → l'horloge saute au prochain événement) — ✅ fait (174 tests)
- **10+** : expiration du cache ARP (vieillissement des entrées), autres défis… — à venir

> ⚠️ rAF : la simulation s'auto-anime quand la page est **visible** ; le navigateur
> met `requestAnimationFrame` en pause si l'onglet est masqué (cf. preview headless).
> Le bouton « Pas » déroule la simulation indépendamment du rAF.

## Quand tu hésites

- **« Où mettre ce code ? »** Logique pure → `lib/`. Définition/résolution
  d'appareil → `devices/`. État réutilisable → un `hook`. Rendu → `components/`.
- **« Faut-il ajouter une dépendance ? »** Probablement pas.
- **« Comment tester ? »** Logique pure → Vitest. Rendu/interaction → à l'œil.
