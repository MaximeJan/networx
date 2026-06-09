# Roadmap — Networx

Chaque phase se termine **verte** (`typecheck` + `lint` + `test` + `build`) et
est démontrable. La logique pure est validée en Vitest ; le rendu se vérifie à
l'œil dans le navigateur. Cible de la **première version (MVP)** : phases 0 → 5.

## Phase 0 — Échafaudage & boucle qualité ✅
Scaffold Vite + React + TS strict, configs du skill `appweb`, squelette de
dossiers, `CLAUDE.md` + `ROADMAP.md`, en-tête avec toggle Conception/Simulation,
canevas vide.
**Critère :** les 5 scripts npm tournent verts ; le canevas vide s'affiche.

## Phase 1 — Types du domaine + maths IP/MAC pures ✅
`domain/types.ts` complet (séparation Document/Runtime ; Device, NetInterface,
Link, Route, PDU par couche, World, SimEvent…), `lib/ip.ts`, `lib/mac.ts`.
**Critère atteint :** 25 tests Vitest verts, `src/lib` à 100 % lignes / 98 %
branches (CIDR, masques contigus/non, sous-réseaux, réseau/broadcast, MAC
normalisation/validation/génération déterministe).

## Phase 2 — Éditeur de topologie (mode Conception) ✅
Palette d'appareils, placement (clic), câblage entre interfaces (outil Câble),
sélection / déplacement (drag) / suppression, panneau de propriétés (IP / masque
/ passerelle / DNS / nom), persistance JSON + autosave, zoom/pan, undo/redo.
`lib/topology.ts`, `lib/persist.ts`, `lib/storage.ts`, `lib/geometry.ts`,
`devices/registry.ts` (getDeviceDef/createDevice). Hooks `useHistory`,
`useAutosave`, `useViewport`, `useKeyboardShortcuts`.
**Critère atteint :** round-trip `persist` testé en Vitest (59 tests verts au
total) ; vérifié en preview — « 2 PC + 1 switch » construit, IP configurées,
câblés, **restaurés à l'identique après rechargement** (autosave localStorage).

## Phase 3 — Moteur événementiel + couche liaison (pur) ✅
`lib/engine.ts` (createWorld, emitFrame, `step` = traite le prochain événement,
`run`, propagation d'une trame sur un câble avec délai `LINK_DELAY`). Commutation :
apprentissage MAC du switch, flood du hub, filtrage MAC à l'hôte. `lib/frames.ts`
(constructeurs ethernet/arp). Ethernet L2 brut.
**Critère atteint :** trame A→B via switch arrive (host-receive) ; table MAC
apprise ; broadcast diffusé ; hub diffuse à tous sauf l'entrant et n'apprend rien ;
commutation point-à-point une fois les MAC connues (sans inonder C) ; trame mise en
vol puis retirée à la livraison ; trame perdue sur port non câblé. 68 tests verts,
`src/lib` à ~99 %.

## Phase 4 — ARP + routage IP + ICMP ping (pur) ✅ ⭐ jalon clé
`lib/stack/arp.ts` (cache), `lib/stack/ip.ts` (resolveRoute : direct →
longest-prefix → passerelle). Pile branchée dans `engine.ts` : à la réception
d'une trame acceptée, l'hôte/routeur remonte ARP/IP/ICMP ; envoi IP avec
résolution ARP (paquet mis en attente puis ré-émis), transfert routeur avec
décrément TTL, `startPing`. `lib/frames.ts` étendu (ipv4, icmpEcho).
**Critère atteint (Vitest) :** « ping A→B » même sous-réseau (échange ARP, cache
rempli) ; « ping A→B via routeur » (relais + réponse) ; TTL 64→63 au passage du
routeur ; IP injoignable → échec propre. 77 tests, `src/lib` à ~98 %.
*Validé entièrement en logique pure, avant toute animation.*

## Phase 5 — Mode Simulation + animation temps réel ✅ ⭐ MVP
`hooks/useSimulationEngine` (rAF → ticks, play/pause/pas-à-pas/vitesse, rAF armé
seulement s'il y a du travail), `SimCanvas` (paquets en vol animés le long des
câbles), `PacketInspector` (clic → couches dépliées), `DeviceSimPanel` (tables
ARP/MAC vivantes + commande ping), `EventLog` (journal coloré), `SimulationView`.
**Critère atteint :** vérifié en preview — 2 PC + 1 switch, IP configurées, ping
lancé depuis PC1 → échange ARP puis ICMP echo/reply animés saut par saut, réponse
reçue par PC1 (×2), cache ARP rempli, journal coloré hop-par-hop. *(Le canevas
animé se vérifie à l'œil dans un vrai navigateur : le screenshot headless glitche
sur la couche SVG animée, mais le DOM et le journal confirment tout.)*

## Phase 6a — Bureaux & Terminal (style Filius) ✅
Chaque hôte a un « écran » : double-clic sur un PC/serveur en Simulation →
fenêtre flottante déplaçable (`MachineWindow`) montrant le bureau (icône
Terminal). Le `Terminal` exécute `help`/`ipconfig`/`arp`/`clear` et `ping <ip>`.
Le **ping ne se lance plus que depuis le terminal** (bouton latéral retiré).
`lib/terminal.ts` pur (`runCommand`), testé. `engine.ping` renvoie le n° de
séquence ; le terminal suit le journal pour afficher la réponse (ttl/temps) ou
un délai dépassé / « injoignable ».
**Critère atteint :** 85 tests (parsing + sorties terminal en Vitest) ; vérifié
en preview — double-clic PC1 → Terminal → `ping 192.168.1.20` → « Réponse de
192.168.1.20 : ttl=64 temps=80 ticks », paquets animés, `ipconfig` OK.

## Phase 6b — Installateur de logiciels ✅
Catalogue `devices/apps.ts` (Terminal, Navigateur web, Serveur web, Serveur DNS,
Serveur d'écho). Dans la fenêtre machine : bureau dynamique (icônes des logiciels
installés) + « Logiciels » → `AppInstaller` (installer/désinstaller). Apps
persistées dans le document (`device.apps`), mutations pures `installApp`/
`uninstallApp`, validées à la désérialisation. Terminal = système (par défaut,
non désinstallable) et seul fonctionnel ; les autres ouvrent un écran « à venir »
(en attendant la couche transport).
**Critère atteint :** 87 tests ; vérifié en preview — installer le Serveur DNS
le fait apparaître sur le bureau et persiste ; il ouvre l'écran « à venir ».

## Phase 7 — Couche transport UDP + DNS fonctionnel ✅
Transport UDP dans `engine.ts` (`sendUdp`/`receiveUdp`). Serveur DNS :
`handleDnsQuery` résout depuis les enregistrements de l'app, `handleDnsResponse`
côté client + file `dnsPending`. `startDnsLookup` et `startPing` étendu (cible IP
→ ping direct ; nom → résolution DNS puis ping). UI : `DnsServerApp` (édition des
enregistrements nom→IP, persistés), Terminal `nslookup <nom>` et `ping <ip|nom>`,
hook synchronise la config (apps/DNS) dans le world en cours. Inspecteur : couches
UDP + DNS. Paquets UDP en violet.
**Critère atteint :** 93 tests (résolution DNS, nom introuvable, sans serveur,
ping par nom de bout en bout). Vérifié en preview — enregistrement DNS ajouté via
l'app, `nslookup pc2.local` → 192.168.1.20, `ping pc2.local` → résolution puis
« Réponse de 192.168.1.20 ttl=64 ».

## QoL (avant Phase 8) ✅
- Câblage **par les ports** : clic sur un port puis sur un autre (plus de bouton
  « Câble »). Échap / clic-fond annule.
- **Export/Import JSON** du réseau (boutons Ouvrir / Enregistrer ; `lib/file.ts`).
- Réseau d'**exemple** `src/examples/reseau-demo.json` (tous les composants,
  configurés et reliés ; DNS avec enregistrements, web-server installé), chargé
  par le bouton « Exemple ».
- Bureau de machine **façon OS** : papier peint, icônes en tuiles, barre des tâches.

## Phase 8 — TCP + Web (HTTP) ✅
TCP simplifié dans `engine.ts` : poignée de main SYN/SYN-ACK/ACK, segment de
données (requête puis réponse), fermeture FIN ; connexions suivies dans
`DeviceRuntime.tcpConns`. HTTP : `startHttpGet` (URL par IP ou par nom → résout
le DNS puis ouvre TCP), le serveur web répond avec sa page. UI : `WebServerApp`
(page HTML éditable, persistée), `WebBrowserApp` (barre d'adresse + rendu de la
page). Inspecteur : couches TCP (ports, seq/ack, drapeaux) + HTTP. Paquets TCP
en indigo. Correctif important : `deserialize` conserve désormais les
enregistrements DNS et les pages web (auparavant jetés).
**Critère atteint :** 98 tests (HTTP par IP, page par défaut, par nom via DNS,
échec sans serveur). Vérifié en preview — `http://web.local` depuis PC1 :
résolution DNS + routage via R1 + handshake TCP + page rendue dans le navigateur.

## Phase 9 — DHCP + Scénarios-défis ✅
**DHCP** : DORA simplifié dans `engine.ts` (`startDhcp` → Discover/Offer/Request/Ack
en diffusion ; le client configure son interface dans le world). Le service est
**activé et configuré sur un routeur** (`device.dhcp`, section dédiée du panneau de
propriétés en mode Conception — ce n'est PAS un logiciel installable). Commande
terminal `dhcp` côté client, baux suivis dans `DeviceRuntime.dhcpLeases`. **Défis** : `challenges.ts` (5 défis : câbler,
adresses IP, passerelles, DHCP, DNS+web — chacun avec un réseau pré-conçu
incomplet) ; `lib/challenge.ts` `verifyGoal` **rejoue la simulation** pour valider
l'objectif (ping/http/dns/dhcp) ; UI = sélecteur « Défis » + `ChallengeBanner`
(consigne + objectif + bouton Vérifier + résultat coloré). Correctif : `deserialize`
conserve aussi la config DHCP.
**Critère atteint :** 109 tests (DHCP : DORA, baux distincts, réutilisation ;
défis : chaque défi échoue au départ et réussit après la bonne action). Vérifié en
preview — défi « Brancher le câble » : échec, on câble PC2, Vérifier → succès vert.

## Confort terminal ✅
Historique des commandes (↑/↓), commande `route` (table de routage), et
`traceroute <ip>` : `engine.startTraceroute` envoie des echo-requests à TTL
croissant ; les routeurs renvoient un **ICMP time-exceeded** quand le TTL expire,
ce qui révèle chaque saut. Le Terminal collecte les sauts et les affiche.
**Critère atteint :** 112 tests (traceroute révèle routeur+destination ; `route`
et validation IP de `traceroute`). Vérifié en preview (traceroute → 1·routeur,
2·destination ; ↑ rappelle les commandes).

## DNS réaliste : types d'enregistrement + récursif/itératif ✅
Le serveur DNS gère désormais trois **types d'enregistrement** (`DnsRecord` =
`{ type: 'A' | 'CNAME' | 'NS'; name; value }`) :
- **A** : nom → adresse IP (résolution directe) ;
- **CNAME** : alias → nom canonique (résolu localement vers le A correspondant) ;
- **NS** : zone → IP d'un serveur DNS faisant autorité (délégation).

Deux **modes de résolution**, déterminés par le seul drapeau `recursive` du
résolveur (`AppConfig.recursive`, case à cocher dans `DnsServerApp`) :
- **itératif** (défaut) : le serveur renvoie la **référence** (NS) ; c'est le
  client qui suit la piste jusqu'au serveur autoritatif ;
- **récursif** : le résolveur interroge **lui-même** le serveur délégué, puis
  renvoie la réponse finale au client.
Le code client/résolveur qui suit les références est **identique** : seule la
réponse du serveur (référence vs résolution complète) change. `engine.ts` :
`sendDnsQuery`/`handleDnsQuery`/`handleDnsResponse`/`finishDns`/`failDns`,
`DnsMessage` porte `answer | referral | cname`. `persist.ts` valide les types
(rétro-compat : ancien `{ name, ip }` → `{ type:'A', name, value }`) et le drapeau
`recursive`. Deux **nouveaux défis** : « 6 · DNS itératif » (ajouter une délégation
NS sur le résolveur) et « 7 · DNS récursif » (activer la récursivité quand le
client ne peut PAS joindre le serveur autoritatif — autre sous-réseau).
**Critère atteint :** 119 tests (CNAME local ; hiérarchie NS résolue en itératif et
en récursif ; persistance des types A/CNAME/NS + `recursive` ; les deux défis
échouent au départ et réussissent après la bonne action). Rendu de l'UI
`DnsServerApp` (sélecteur de type, case « Résolution récursive ») à confirmer en
navigateur.

## Rafraîchissement visuel ✅
Inspiré de Logix : grille de fond en **points**, appareils rendus en **cartes**
soignées (ombre douce, tuile d'icône colorée, libellé + IP, halo de sélection bleu
pointillé) via un composant partagé `DeviceShape` (DeviceCard/DotGrid). Fenêtre
machine **façon système d'exploitation** : barre de titre à pastilles, bureau avec
icônes en tuiles claires + barre des tâches affichant le nom et l'IP de la machine,
barre d'application avec bouton « Bureau ». 112 tests verts (changements purement
présentationnels, vérifiés en DOM ; rendu à confirmer dans un vrai navigateur).

## Ajustements
- **DHCP auto** : à l'entrée en simulation, tout hôte câblé sans IP demande une
  adresse (`autoConfigureDhcp`). La fenêtre machine lit l'appareil dans le world
  runtime → `ipconfig` reflète l'IP obtenue par DHCP. Le bail est mémorisé
  (`DeviceRuntime.dhcpLease`) et **réappliqué** (`reapplyDhcpLeases`) après chaque
  resynchronisation du document → l'IP DHCP ne disparaît plus quand on installe un
  logiciel ou modifie la config en cours de simulation.
- **Ancrages de câble mobiles** : un lien s'ancre sur le bord de chaque appareil
  face au pair (`geometry.borderAnchor`, `cableGeometry.linkAnchors`) → plus de
  câbles qui passent derrière les composants. Les ports cliquables ne restent
  affichés que pour les interfaces libres.
- **Placement par drag & drop** : on glisse un appareil de la palette vers le
  canevas (HTML5 DnD : `Palette` items `draggable`, `Canvas` onDragOver/onDrop →
  `onPlaceDevice` à la position du dépôt). Suppression du mode/outil de placement
  (type `Tool` retiré) ; le canevas est toujours en mode sélection/câblage.

## Nettoyage — 3 composants + exemple local ✅
- **`DeviceKind` réduit à `pc | switch | router`** : suppression définitive des
  types `server`, `hub`, `cloud` (DEFS du registre, `KNOWN_KINDS` de persist,
  branches de `engine.deliverFrame`/`autoConfigureDhcp`, gardes `pc||server` des
  composants). Un **« serveur » est désormais un Ordinateur** sur lequel on installe
  un logiciel serveur (web/DNS) — comme dans Filius. Tests du concentrateur (hub)
  retirés (`engine.test.ts`), helpers de test passés en `kind:'pc'`.
- **Bouton « Exemple » retiré** (Toolbar + handler `handleLoadExample` + import JSON
  dans App). Le réseau de démo est maintenant un **fichier local autonome**
  `exemples/reseau-demo.json` (hors `src/`, plus bundlé) qu'on ouvre via « Ouvrir ».
- **Exemple refondu** avec seulement pc/switch/router et illustrant toutes les
  fonctionnalités actuelles : 2 sous-réseaux + routeur, **DHCP** (R1 sert PC1),
  **DNS** (enregistrements A + CNAME sur un PC-serveur), **Web** (page servie par un
  PC-serveur), navigateurs sur PC1/PC2. Vérifié : `deserialize` + replay → PC1 obtient
  son IP DHCP, PC2 résout web.local et www.local et charge http://web.local/.
**Critère atteint :** 116 tests verts, lint + build OK, bundle légèrement réduit.

## NAT configurable (NAPT + redirection de port) ✅
NAT réaliste et **réellement configurable** sur un routeur (pas un simple on/off).
`Device.nat?: NatConfig = { wanInterfaceId?, portForwards? }` :
- **Interface externe (WAN) désignée explicitement** dans le panneau de propriétés
  (menu déroulant) ; les autres interfaces sont internes (LAN). Tant qu'aucune WAN
  n'est choisie, le NAT est activé mais inactif → la configuration est un geste
  visible et obligatoire.
- **PAT sortant (overload)** : un paquet routé qui SORT par l'interface WAN voit sa
  source réécrite en IP publique + port public (table dynamique `DeviceRuntime.natTable`,
  réutilisée par session). Le retour est retraduit par correspondance de port.
- **Redirection de port (DNAT entrant)** : règles `{proto, publicPort → privateIp:privatePort}`
  éditables (ajout/suppression) pour héberger un serveur derrière le NAT. La réponse du
  service réutilise le port public de la règle (corrélation aller/retour correcte).
- Direction pilotée par la **config** (egress == WAN) et non plus par une heuristique
  de sous-réseau ; NAT entrant tenté uniquement sur l'ingress WAN. `routePacketRaw`
  évite de re-NATer un paquet déjà retraduit. ICMP : id echo comme « port ».
UI : section « NAT » dans `PropertiesPanel` (case + menu WAN + éditeur de
redirections). `topology.setDeviceNat`, `persist.sanitizeNat` (valide WAN existante,
règles ; rétro-compat ancien `nat:true` → `{}`). 2 défis NAT (désigner l'interface
externe ; exposer un serveur privé par redirection de port). **Critère atteint :**
131 tests (PAT ICMP/TCP, mauvaise interface = échec, redirection de port HTTP de bout
en bout, vraie IP client vue par le serveur, défis). Vérifié en preview : défi NAT
résolu en désignant eth1.

## Défis enrichis + consignes claires ✅
Le modèle `Challenge` passe de `brief` (un pavé) à **`intro` (contexte) + `steps[]`
(étapes numérotées)**. `ChallengeBanner` affiche un contexte, une **liste numérotée**
(pastilles), puis une ligne **Objectif** encadrée (icône cible) — **sans aucun emoji**
(retirés aussi des messages de `verifyGoal` et de l'écran « à venir »).
`verifyGoal` lance désormais `autoConfigureDhcp` avant l'action : les clients DHCP
s'auto-configurent (adresse, passerelle, **DNS**), ce qui débloque les défis qui en
dépendent. **13 défis** (au lieu de 9), progression physique → IP → masque → routage
→ multi-routeurs → DHCP → options DHCP → DNS → CNAME → DNS itératif/récursif → NAT →
redirection de port. 4 nouveaux : **masque de sous-réseau** (élargir /24→/16),
**routage entre deux routeurs** (passerelle par défaut sur chaque routeur),
**options DHCP** (distribuer le DNS), **alias CNAME**. **Critère atteint :** 135 tests
(chaque défi échoue au départ et réussit après la bonne action). Vérifié en preview :
13 défis listés, bandeau étapes + objectif sans emoji.

## Confort d'édition : multi-sélection, copier/coller, annotations ✅
Le mode Conception gagne en ergonomie :
- **Sélection multiple** : `Selection` devient `{ kind:'devices'; ids[] }` ; on
  sélectionne au **lasso** (clic gauche maintenu sur le fond → rectangle) et on
  ajuste au **Maj+clic**. Le **déplacement de groupe** bouge tous les appareils
  sélectionnés (`moveDevicesTo`).
- **Pan à la molette pressée** (bouton du milieu) ; le clic gauche sur le fond est
  désormais réservé au lasso. La molette zoome toujours ; l'autoscroll du clic-molette
  est neutralisé.
- **Copier/coller** (Ctrl+C / Ctrl+V) : `pasteDevices` clone les appareils avec de
  nouveaux ids et de nouvelles MAC, décale la position, et **recopie les liens
  internes** au groupe (remappés sur les nouvelles interfaces).
- **Annotations** (`Topology.annotations`) : `TextAnnotation` (étiquette) et
  `ZoneAnnotation` (rectangle de couleur en opacité réduite, **rendu derrière** les
  appareils). Deux entrées dans la palette, « Zone de texte » et « Zone colorée »,
  glissées-déposées sur le plan (cf. « Annotations en glisser-déposer » plus bas).
  Le remplissage d'une zone ne capte pas le pointeur (lasso et
  clics d'appareils passent au travers) ; on la déplace par son étiquette et on la
  redimensionne par une poignée. `AnnotationPanel` édite texte/taille/nom/couleur.
  `persist` valide et conserve les annotations (couleurs hex, tailles). Les
  annotations s'affichent AUSSI en mode **Simulation** (lecture seule, `SimCanvas`).
**Critère atteint :** 143 tests (pasteDevices : nouveaux ids/MAC, liens internes
remappés, lien externe ignoré ; moveDevicesTo ; removeDevices ; annotations CRUD ;
persist round-trip + sanitisation). Vérifié en preview : lasso (« 2 appareils
sélectionnés »), Ctrl+C/V (duplication), tracé de zone, pose de texte, pan molette.

## Routes statiques (table de routage) ✅
Les routeurs ont une **table de routage statique** éditable (`Device.routes`, que le
moteur exploitait déjà via `resolveRoute` en longest-prefix). Section « Table de
routage » dans `PropertiesPanel` : on saisit destination + préfixe + passerelle, et
**l'interface de sortie est déduite automatiquement** (interface sur le même
sous-réseau que la passerelle ; sinon la passerelle est signalée injoignable).
`topology.setDeviceRoutes`, `persist.sanitizeRoute` (destination/préfixe valides,
interface existante). Le terminal `route` affiche déjà ces routes. Défi 14 **« Route
statique »** : R1 a deux voisins (R2, R3) mais une seule passerelle par défaut (vers
R2) ; pour joindre le réseau derrière R3, l'élève ajoute une route statique.
**Critère atteint :** 145 tests (setDeviceRoutes ; défi : échoue avec la seule
passerelle par défaut, réussit après l'ajout de la route). Vérifié en preview : ajout
de la route via le panneau (interface déduite) → « Ping vers 192.168.3.10 réussi ».

## Console d'administration du routeur ✅
Les routeurs accumulaient beaucoup de réglages dans l'étroit panneau de droite. Ils
ont maintenant, **comme les ordinateurs, une fenêtre flottante façon OS** — mais au
**visuel distinct** (console d'appliance réseau sombre à accent orange, vs le bureau
bleu/violet des PC). Double-clic sur un routeur en **Simulation** → la console, dont
les « logiciels » sont les outils de configuration : **Terminal** (ping, route,
traceroute…), **Interfaces** (IP/masque + passerelle/DNS), **Routage** (routes
statiques), **DHCP**, **NAT**. Les éditeurs ont été **extraits dans `RouterConfig.tsx`**
(`Field`, `InterfacesSection`, `RoutesSection`, `DhcpSection`, `NatSection`) et sont
désormais **partagés** entre le `PropertiesPanel` (Conception, panneau compact) et la
`RouterWindow` (Simulation, plein écran). Les éditions commitent au document (comme
l'install de logiciels / DNS / web). **Critère atteint :** 145 tests inchangés, lint +
build OK. Vérifié en preview : double-clic routeur → console orange avec les 5 outils ;
« Routage » ouvre l'éditeur de table de routage.

## Routage dynamique : RIP et OSPF ✅
Le routage d'un routeur peut être **statique** (manuel) ou confié à un **protocole
dynamique** (`device.routing` : 'static' | 'rip' | 'ospf', absent ⇒ statique).
Plutôt que de simuler le bavardage des protocoles paquet par paquet, `lib/routing.ts`
calcule **les tables convergées** par un Dijkstra pur (fonction testable à froid) :
RIP et OSPF ne diffèrent que par la **métrique** — RIP compte les **sauts** (plafond
15), OSPF somme les **coûts** (coût = bande passante de référence / débit du câble).
La **bande passante** est portée par le câble (`Link.bandwidth`, Mb/s, optionnelle) :
un panneau `LinkPanel` permet de la régler (10/100/1000 Mb/s) et affiche le coût OSPF.
`engine.applyDynamicRoutes` injecte les routes apprises dans le runtime
(`DeviceRuntime.dynamicRoutes`) et les journalise ; `resolveRoute` les fusionne avec
les routes statiques (préfixe le plus long, statique prioritaire). Le sélecteur de
protocole est dans la section Routage (panneau de Conception ET console du routeur).
**Aucune perturbation des défis existants** : un routeur sans mode reste statique, un
câble sans débit prend la valeur par défaut → comportement identique. Défi 15
**« Routage dynamique »** : un triangle de 3 routeurs où RIP prend le raccourci direct
lent (1 saut) et OSPF le chemin à 2 sauts plus rapide ; il suffit d'activer le même
protocole sur les 3 routeurs (la configuration manuelle de routes serait fastidieuse).
**Critère atteint :** 154 tests (RIP vs OSPF choisissent des chemins différents,
`ospfCost`, fusion statique/dynamique dans `resolveRoute`, statique ⇒ aucune route
dynamique, défi réussi en RIP comme en OSPF). Vérifié en preview : sélecteur de
protocole, activation RIP sur les 3 routeurs → ping réussi ; panneau de débit du câble.

## Fenêtres unifiées : config dans la fenêtre, panneau docké supprimé ✅
La configuration d'un appareil se fait désormais dans sa **fenêtre flottante façon OS**,
disponible **en Conception ET en Simulation** (double-clic). Le **panneau docké de
droite** (`PropertiesPanel`) a été **supprimé** : la Conception laisse le canevas
pleine largeur. Détails :
- Les éditeurs de config (`RouterConfig`) ne dépendent pas du moteur → ils marchent en
  Conception sans rien changer. Seuls le **Terminal** et le **Navigateur** (émission de
  paquets) sont grisés hors Simulation (écran « disponible en Simulation »).
- L'**ordinateur** gagne un outil « Réseau » (IP/masque/passerelle/DNS), tous les
  appareils gagnent le **renommage** dans leur fenêtre. Le **commutateur** a une petite
  fenêtre (`SwitchWindow`, accent teal : renommage + ports).
- Rendu mutualisé : `DeviceWindows` (choisit MachineWindow/RouterWindow/SwitchWindow par
  type) + `useDeviceWindows` (état des fenêtres) — utilisés par App (Conception, sans
  moteur) et `SimulationView` (avec moteur). Un seul sac `DeviceWindowHandlers` porte
  toutes les mutations.
- Les éléments qui ne sont pas des machines gardent un **petit éditeur flottant** :
  câble (débit, « un petit truc »), annotation (texte/zone), multi-sélection.
**Critère atteint :** 154 tests (logique pure inchangée), lint + build OK. Vérifié en
preview : double-clic appareil → fenêtre de config en Conception (outil Réseau, IP) ;
Terminal grisé en Conception et actif en Simulation ; console routeur OK.

## Défis annotés et réseaux plus grands ✅
Tous les défis délimitent désormais leurs **sous-réseaux** par des **zones colorées**
(derrière les appareils) et des **étiquettes de texte** (helpers `zone()`/`text()` dans
`challenges.ts`). Chaque LAN/transit porte son CIDR (« LAN A · 192.168.1.0/24 »,
« 10.0.12.0/30 »…). Plusieurs défis sont **agrandis et plus réalistes** : les défis
passerelles, deux-routeurs et DHCP ont des **LAN peuplés** (commutateur + plusieurs
postes) au lieu d'un PC unique relié directement au routeur. Les ids, adresses, liens
et « pièces manquantes » des objectifs sont **inchangés** → les 15 tests de défi
restent verts (chaque défi échoue au départ, réussit après la bonne action).
**Critère atteint :** 154 tests, lint + build OK. Vérifié en preview (Conception) :
défi « passerelles » = 2 zones LAN A/B peuplées + routeur central ; défi « route
statique » = 3 zones LAN + liaisons /30 étiquetées.

## Diagnostic d'échec pédagogique ✅
Quand un `ping` / `nslookup` / une requête HTTP / une demande DHCP n'aboutit pas, le
terminal et le navigateur affichent désormais le **pourquoi** probable au lieu d'un
simple « délai dépassé ». Module **pur** `lib/diagnose.ts` (`diagnoseFailure`) qui
combine deux sources, de la plus fiable à la plus générale : (1) les **abandons
réellement journalisés** par la simulation (ils disent QUEL appareil a bloqué) ;
(2) à défaut, une **analyse statique** de la config source avec la vraie logique de
routage du moteur (`resolveRoute`). Causes couvertes : source sans IP, adresse cible
inexistante, cible dans un autre réseau **sans passerelle**, **passerelle hors
sous-réseau**, **routeur en aval sans route**, **masques incohérents** (la réponse
n'a pas de chemin de retour), **ARP sans réponse**, **TTL épuisé** (boucle), **pas de
serveur DNS**, **pas de réponse DHCP**, et **hôte joignable mais sans serveur web**.
Diagnostic **honnête sur l'ARP** : si la cible a répondu à l'ARP (donc joignable),
on n'accuse pas l'ARP mais le service (HTTP) ou la machine. Branché dans `Terminal`
(ping/nslookup/dhcp) et `WebBrowserApp` (http, rendu multi-lignes).
**Critère atteint :** 167 tests (11 pour le diagnostic — chaque cause produit le bon
message), `build` + `lint` verts. Rendu terminal/navigateur à confirmer en navigateur.

## Annotations en glisser-déposer ✅
Les annotations se créent désormais **comme les appareils** : on glisse « Zone de
texte » ou « Zone colorée » depuis la palette et on les **dépose** sur le plan
(`ANNOTATION_DND_TYPE`, géré dans `Canvas.onDrop` à côté du dépôt d'appareil). Une
zone déposée prend une **taille de base modeste** (`ZONE_DEFAULT_W/H` = 192×120 px
monde), ensuite **redimensionnable** par sa poignée — au lieu d'être tracée à la
souris. Le **mode-outil** précédent (sélectionner un outil puis cliquer/tracer) est
supprimé : `tool` / `AnnotationTool` / `onToolDone` retirés de `App`, `Palette` et
`Canvas` (drag-zone et son aperçu en moins), pour une UX cohérente avec les appareils.
**Critère atteint :** `build` + `lint` + 167 tests verts (logique pure inchangée).
Rendu (glisser-déposer, taille de base) à confirmer en navigateur.

## Journal pédagogique explicite ✅
Le journal nommait des MAC sans dire QUEL protocole ni POURQUOI. Refonte des messages
du moteur (`engine.ts`) : un descripteur PUR `describeFrame` nomme le protocole de
chaque trame (« une requête ARP « qui a X ? » », « un message DHCP Discover »…), la
diffusion est glosée (`ff:ff:… → diffusion : tous les hôtes du segment`), le
commutateur journalise au niveau L2 (« diffuse une trame ARP sur ses N autres ports »)
en UNE ligne, et le nom de l'appareil — déjà porté par la colonne colorée — n'est plus
répété. `putOnWire` (émission + journal) est séparé d'`emitOnWire` (physique pure).
Ordre logique corrigé (réception ARP mise en cache AVANT l'envoi du paquet en attente).
Les ~14 sous-chaînes consommées par `diagnose.ts`, `Terminal.tsx` et les tests sont
préservées. **Critère atteint :** 167 tests inchangés ; vérifié en navigateur (journal
d'un ping/DHCP qui se lit comme un récit).

## Bande passante → vitesse de propagation ✅
Le débit d'un câble (`Link.bandwidth`) agit désormais sur la VITESSE des trames, pas
seulement sur le coût OSPF. `engine.linkDelay(bandwidth)` : 100 Mb/s (`DEFAULT_BW`) =
délai de référence (`LINK_DELAY`), variation en RACINE du rapport de débit, bornée
[3, 40] ticks (≈ 3 à 1 Gb/s, ~32 à 10 Mb/s). Un câble sans débit défini garde le timing
d'avant (tests intacts). L'animation `SimCanvas` le reflète automatiquement
(interpolation sur `arriveTick − departTick`) ; `LinkPanel` affiche le délai de
propagation à côté du coût OSPF. **Critère atteint :** 171 tests (4 nouveaux :
monotonie, bornes, date d'arrivée) ; vérifié en navigateur (DORA à ~32 ticks/saut sur
un câble 10 Mb/s).

## Reset corrigé + inspecteur de paquet rétabli ✅
- **Reset** : `useSimulationEngine.reset` recréait le monde (avec la config DHCP auto
  qui réinjecte des paquets) mais ne RÉ-ARMAIT pas la boucle rAF → après un reset
  consécutif à une simulation terminée, les paquets restaient figés. Corrigé : `reset`
  bumpe `restart` (comme `ping`/`dhcp`/…). Vérifié en navigateur (t repart de 0 et
  progresse de nouveau).
- **Inspecteur de paquet** : `PacketInspector.tsx` (décrit dans la doc mais absent du
  code) recréé et rebranché dans `SimulationView` ; clic sur un paquet en vol → ses
  couches OSI dépliées (Ethernet → ARP / IPv4 → ICMP / UDP→DNS·DHCP / TCP→HTTP). Un bug
  de câblage trouvé en preview (le clic sélectionnait puis désélectionnait le paquet)
  est corrigé. Vérifié en navigateur (DHCP Discover entièrement décodé, couche par
  couche).

## Phase 10 — Expiration ARP + audit (table MAC visible, journal par couche) ✅
Audit complet du système de simulation, puis quatre améliorations :
- **Expiration ARP** (l'item « 10+ » de la roadmap) : une requête ARP restée sans
  réponse expire après `ARP_TIMEOUT` (300 ticks) — les paquets en attente de cette
  MAC sont **abandonnés et journalisés** (« X ne répond pas à l'ARP → abandonne
  N paquet(s) ») au lieu de rester en file pour toujours. L'événement `arp-timeout`
  (déclaré depuis la Phase 3 mais jamais traité) est **annulé** dès qu'une trame ARP
  de la cible nous apprend sa MAC. En prime, **une seule requête ARP par saut en
  attente** : les paquets suivants vers le même next-hop se mettent en file sans
  rediffuser (un traceroute n'émet plus 8 broadcasts identiques).
- **Avance rapide des temps morts** (`useSimulationEngine`) : quand rien n'est en
  vol mais qu'un événement daté attend (ex. l'expiration ARP à t+300), l'horloge
  **saute à sa date** — il n'y a rien à animer entre-temps. L'échec d'un ping
  s'affiche donc immédiatement au lieu de faire patienter ~25 s.
- **Table MAC vivante** dans `SwitchWindow` (Simulation) : le commutateur n'a pas
  de terminal, sa table d'apprentissage était invisible. Sa fenêtre reçoit le moteur
  (optionnel) et affiche `MAC → port (t=…)` en direct. (`DeviceSimPanel`, documenté
  mais jamais créé, est retiré de la doc.)
- **Journal filtré par couche réelle** : `EventLog` filtre sur le champ `layer` des
  entrées (au lieu de groupes de tags approximatifs — les transferts des routeurs
  apparaissaient sous « Liaison »). ARP s'affiche fidèlement à cheval : émission en
  Liaison, traitement (réponse, cache) en Réseau. Texte d'accueil remis à jour
  (double-clic → Terminal).
**Critère atteint :** 174 tests (3 nouveaux : cible muette → abandon journalisé à
t=ARP_TIMEOUT ; réponse → expiration annulée ; dédoublonnage ARP), build + lint OK.
Vérifié en navigateur : table MAC remplie en direct (t=10, t=30), ping vers une IP
muette → abandon à t=330 + diagnostic terminal, filtre « Réseau » exact.

## Phases futures
- Expiration du **cache** ARP (vieillissement des entrées apprises).
- TCP : retransmission sur perte (nécessiterait des pertes simulables — câble
  « défectueux » configurable ?).
- Serveur d'écho fonctionnel (l'app est au catalogue mais ouvre « à venir »),
  transfert de fichiers.
- Nuage « Internet » simulé (latence, IP publiques) pour donner du sens au NAT.
- Autres défis (lecture de table MAC, débit/OSPF, diagnostic guidé).
- Confort : préférences d'apparence, raccourcis supplémentaires, exports d'images.
