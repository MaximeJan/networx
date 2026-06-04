// Vocabulaire du domaine Networx.
//
// Deux mondes distincts, à ne pas confondre :
//
//   • LE DOCUMENT (Topology) — la topologie et la configuration saisies en mode
//     Conception. C'est lui qu'on persiste (autosave/JSON) et qui passe par
//     l'historique undo/redo. Statique entre deux actions de l'utilisateur.
//
//   • LE RUNTIME (World) — l'état vivant pendant la simulation : horloge, file
//     d'événements, paquets en vol, caches ARP/tables MAC appris, journal. Créé
//     à l'entrée en mode Simulation, jeté quand on en sort. Jamais persisté.
//
// Les PDU (unités de données par couche) circulent dans le runtime. Les couches
// transport/application sont esquissées ici pour réserver le vocabulaire ; elles
// seront étoffées dans les phases futures.

// ───────────────────────────── Identifiants ─────────────────────────────

export type DeviceId = string;
export type InterfaceId = string;
export type LinkId = string;

/** Adresse IPv4 en notation pointée, ex. "192.168.1.10". */
export type Ip = string;
/** Adresse MAC normalisée minuscule, ex. "aa:bb:cc:dd:ee:ff". */
export type Mac = string;

// ─────────────────────────────── Énumérés ───────────────────────────────

/** Les deux modes de l'application, comme dans Filius. */
export type Mode = 'design' | 'simulation';

/** Types d'appareils (résolus par getDeviceDef). Un « serveur » est simplement un
 *  Ordinateur sur lequel on installe un logiciel serveur (web, DNS…). */
export type DeviceKind = 'pc' | 'switch' | 'router';

/** Couches du modèle, pour le journal et l'inspecteur de paquet. */
export type Layer = 'physical' | 'link' | 'network' | 'transport' | 'application';

/** Nature d'une ligne de journal (pour filtrer/colorer). */
export type LogTag =
  | 'emit'
  | 'forward'
  | 'flood'
  | 'switch-learn'
  | 'host-receive'
  | 'arp'
  | 'icmp'
  | 'udp'
  | 'dns'
  | 'tcp'
  | 'http'
  | 'dhcp'
  | 'routing'
  | 'drop';

/** Logiciels installables sur un hôte (catalogue dans devices/apps.ts). */
export type AppKind = 'terminal' | 'web-browser' | 'web-server' | 'dns-server' | 'echo-server';

// ──────────────────────── Document : topologie ──────────────────────────

/** Une interface réseau (carte/port) d'un appareil. */
export interface NetInterface {
  id: InterfaceId;
  /** Nom court, ex. "eth0". */
  name: string;
  mac: Mac;
  /** Adresse IP. Absente sur les ports d'un switch (couche 2 pure). */
  ip?: Ip;
  /** Longueur de préfixe CIDR (canonique). Le masque pointé en dérive (lib/ip). */
  prefix?: number;
  /** Câble branché sur cette interface, le cas échéant. */
  linkId?: LinkId;
}

/** Mode de routage d'un routeur : statique (manuel) ou protocole dynamique. */
export type RoutingMode = 'static' | 'rip' | 'ospf';

/** Une entrée de table de routage (routeurs ; hôtes via passerelle implicite). */
export interface Route {
  /** Adresse réseau de destination, ex. "192.168.2.0". */
  destination: Ip;
  prefix: number;
  /** Prochain saut. Absent ⇒ réseau directement connecté (on-link). */
  gateway?: Ip;
  /** Interface de sortie. */
  interfaceId: InterfaceId;
}

/** Type d'enregistrement DNS. A = nom→IP, CNAME = alias→nom, NS = zone→IP du serveur. */
export type DnsRecordType = 'A' | 'CNAME' | 'NS';

/** Un enregistrement DNS. `value` = IP (A/NS) ou nom canonique (CNAME). */
export interface DnsRecord {
  type: DnsRecordType;
  name: string;
  value: string;
}

/** Plage et options distribuées par un serveur DHCP. */
export interface DhcpConfig {
  poolStart: Ip;
  poolSize: number;
  prefix: number;
  gateway?: Ip;
  dns?: Ip;
}

/** Configuration d'une application installée. */
export interface AppConfig {
  kind: AppKind;
  /** Enregistrements d'un serveur DNS (kind === 'dns-server'). */
  records?: DnsRecord[];
  /** Serveur DNS récursif (résout lui-même les délégations) plutôt qu'itératif. */
  recursive?: boolean;
  /** Page servie par un serveur web (kind === 'web-server'). */
  page?: string;
}

/** Un appareil de la topologie (état persistant, configurable). */
export interface Device {
  id: DeviceId;
  kind: DeviceKind;
  /** Nom affiché, ex. "PC-1". */
  name: string;
  x: number;
  y: number;
  interfaces: NetInterface[];
  /** Passerelle par défaut de l'hôte (pc/server). */
  gateway?: Ip;
  /** Serveur DNS de l'hôte. */
  dns?: Ip;
  /** Routes statiques (surtout pour les routeurs). */
  routes?: Route[];
  /** Mode de routage d'un routeur (absent ⇒ 'static'). RIP/OSPF apprennent
   *  automatiquement les routes pendant la simulation (runtime). */
  routing?: RoutingMode;
  /** Applications installées (pc/server). */
  apps?: AppConfig[];
  /** Service DHCP activé sur l'appareil (routeur) : plage distribuée. */
  dhcp?: DhcpConfig;
  /** Configuration NAT de ce routeur (présente ⇒ NAT activé). */
  nat?: NatConfig;
}

/** Une redirection de port (DNAT entrant) : expose un service interne sur l'IP publique. */
export interface PortForward {
  proto: 'tcp' | 'udp';
  /** Port visé sur l'IP publique (côté WAN). */
  publicPort: number;
  /** Hôte interne (LAN) vers lequel rediriger. */
  privateIp: Ip;
  /** Port sur l'hôte interne. */
  privatePort: number;
}

/** Configuration NAT d'un routeur (NAPT « overload » + redirections de port). */
export interface NatConfig {
  /**
   * Interface EXTERNE (WAN/publique). Les autres interfaces sont internes (LAN).
   * Tant qu'elle n'est pas définie, le NAT est activé mais inactif (rien n'est traduit).
   */
  wanInterfaceId?: InterfaceId;
  /** Redirections de port entrantes (pour héberger un serveur derrière le NAT). */
  portForwards?: PortForward[];
}

/** Un bout de câble côté appareil. */
export interface Endpoint {
  deviceId: DeviceId;
  interfaceId: InterfaceId;
}

/** Un câble reliant deux interfaces. */
export interface Link {
  id: LinkId;
  a: Endpoint;
  b: Endpoint;
  /** Débit du câble en Mbit/s (sert au coût OSPF ; absent ⇒ débit par défaut). */
  bandwidth?: number;
}

/** Étiquette de texte libre posée sur le plan (décoration, mode Conception). */
export interface TextAnnotation {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  /** Couleur du texte (hex). */
  color: string;
  fontSize: number;
}

/** Rectangle de couleur (opacité réduite) placé DERRIÈRE les appareils pour
 *  délimiter une zone (un sous-réseau, un site…). */
export interface ZoneAnnotation {
  id: string;
  kind: 'zone';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Couleur de la zone (hex) ; rendue en opacité réduite. */
  color: string;
  label?: string;
}

/** Décoration du plan (ni appareil ni câble). */
export type Annotation = TextAnnotation | ZoneAnnotation;

/** Outil d'annotation armé depuis la palette. */
export type AnnotationTool = 'text' | 'zone';

/** Le document complet : la topologie éditée. */
export interface Topology {
  name: string;
  devices: Device[];
  links: Link[];
  /** Décorations du plan (zones colorées, étiquettes de texte). */
  annotations?: Annotation[];
}

// ───────────────────────── PDU (par couche) ─────────────────────────────

export type EtherType = 'ipv4' | 'arp';

/**
 * Couche liaison : trame Ethernet. Union DISCRIMINÉE par `etherType` pour que le
 * type du `payload` se précise automatiquement (pas de cast à la réception).
 */
export type EthernetFrame =
  | { srcMac: Mac; dstMac: Mac; etherType: 'arp'; payload: ArpPacket }
  | { srcMac: Mac; dstMac: Mac; etherType: 'ipv4'; payload: Ipv4Packet };

/** Couche liaison : paquet ARP (résolution IP → MAC). */
export interface ArpPacket {
  op: 'request' | 'reply';
  senderMac: Mac;
  senderIp: Ip;
  /** Inconnu (null) dans une requête. */
  targetMac: Mac | null;
  targetIp: Ip;
}

export type IpProtocol = 'icmp' | 'udp' | 'tcp';

/** Couche réseau : paquet IPv4. */
export interface Ipv4Packet {
  srcIp: Ip;
  dstIp: Ip;
  ttl: number;
  protocol: IpProtocol;
  payload: IcmpMessage | UdpDatagram | TcpSegment;
}

/** Couche réseau : message ICMP (ping, erreurs). */
export interface IcmpMessage {
  type: 'echo-request' | 'echo-reply' | 'dest-unreachable' | 'time-exceeded';
  id: number;
  seq: number;
  data?: string;
}

/** Couche transport : datagramme UDP. */
export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
  payload?: DnsMessage | unknown;
}

/** Message DNS (porté par UDP). */
export interface DnsMessage {
  kind: 'query' | 'response';
  /** Identifiant de transaction (relie réponse ↔ requête). */
  id: number;
  name: string;
  /** Réponse finale (A) : IP résolue, ou null si le nom est introuvable. */
  answer?: Ip | null;
  /** Réponse itérative : adresse du serveur DNS à interroger ensuite (délégation NS). */
  referral?: Ip;
  /** Réponse : alias CNAME à résoudre à la place. */
  cname?: string;
}

/** Couche transport : segment TCP. */
export interface TcpSegment {
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: { syn?: boolean; ack?: boolean; fin?: boolean; rst?: boolean };
  payload?: HttpMessage | unknown;
}

/** Message HTTP (porté par TCP). */
export type HttpMessage =
  | { kind: 'request'; method: 'GET'; host: string; path: string }
  | { kind: 'response'; status: number; body: string };

/** Message DHCP (porté par UDP, ports 67/68). DORA simplifié. */
export interface DhcpMessage {
  kind: 'discover' | 'offer' | 'request' | 'ack';
  /** Identifiant de transaction (relie les 4 messages). */
  xid: number;
  /** MAC du client concerné. */
  mac: Mac;
  ip?: Ip;
  prefix?: number;
  gateway?: Ip;
  dns?: Ip;
}

// ───────────────────────── Runtime : simulation ─────────────────────────

/** Une entrée de cache ARP (IP ↔ MAC apprise). */
export interface ArpEntry {
  ip: Ip;
  mac: Mac;
  learnedAtTick: number;
}

/** Une entrée de table MAC d'un switch (MAC ↔ port appris). */
export interface MacTableEntry {
  mac: Mac;
  interfaceId: InterfaceId;
  learnedAtTick: number;
}

/** Un paquet IP en attente de résolution ARP du prochain saut. */
export interface PendingSend {
  egressIfId: InterfaceId;
  nextHopIp: Ip;
  packet: Ipv4Packet;
}

/** Suite d'une résolution DNS une fois l'IP obtenue. */
export type DnsThen =
  | { kind: 'lookup' }
  | { kind: 'ping'; seq: number; pingId: number }
  | { kind: 'http'; reqId: number; path: string }
  // Serveur récursif résolvant pour un client : forward la réponse finale.
  | { kind: 'resolver'; clientIp: Ip; clientPort: number };

/** État d'une connexion TCP (simplifiée). */
export type TcpState = 'syn-sent' | 'syn-rcvd' | 'established' | 'fin-wait';

/** Une connexion TCP suivie par un appareil. */
export interface TcpConn {
  id: string;
  localPort: number;
  remoteIp: Ip;
  remotePort: number;
  state: TcpState;
  role: 'client' | 'server';
  seq: number;
  ack: number;
  /** Côté client : requête HTTP à émettre une fois la connexion établie. */
  request?: { path: string; host: string; reqId: number };
}

/** Une requête DNS émise et en attente de réponse. */
export interface DnsPending {
  id: number;
  name: string;
  then: DnsThen;
  /** Serveur DNS actuellement interrogé (change en suivant une délégation NS). */
  server?: Ip;
}

/** Entrée de la table NAT d'un routeur. */
export interface NatEntry {
  proto: 'icmp' | 'udp' | 'tcp';
  /** IP privée du client (côté LAN). */
  privateIp: Ip;
  /** « Port » privé : port source (UDP/TCP) ou identifiant ICMP. */
  privatePort: number;
  /** Port public alloué sur l'interface WAN du routeur. */
  publicPort: number;
  /** Tick de création (pour expiration future). */
  createdAt: number;
}

/** État vivant propre à un appareil pendant la simulation. */
export interface DeviceRuntime {
  /** Hôtes/routeurs : IP → MAC. */
  arpCache: ArpEntry[];
  /** Switches : MAC → port. */
  macTable: MacTableEntry[];
  /** Paquets en attente d'une réponse ARP (vidés quand la MAC est connue). */
  pending: PendingSend[];
  /** Requêtes DNS en attente de réponse. */
  dnsPending: DnsPending[];
  /** Connexions TCP en cours. */
  tcpConns: TcpConn[];
  /** Baux DHCP attribués par CE serveur DHCP. */
  dhcpLeases: { mac: Mac; ip: Ip }[];
  /** Config obtenue par DHCP côté CLIENT (réappliquée après resync du document). */
  dhcpLease?: { interfaceId: InterfaceId; ip: Ip; prefix?: number; gateway?: Ip; dns?: Ip };
  /** Table NAT (routeurs avec nat=true). */
  natTable: NatEntry[];
  /** Routes apprises par un protocole dynamique (RIP/OSPF) — recalculées, non persistées. */
  dynamicRoutes: Route[];
}

/** Une trame en cours de propagation sur un câble (pour l'animation). */
export interface InFlightPacket {
  id: string;
  linkId: LinkId;
  from: Endpoint;
  to: Endpoint;
  frame: EthernetFrame;
  departTick: number;
  arriveTick: number;
}

/** Base commune des événements de simulation. */
export interface SimEventBase {
  id: string;
  /** Date (tick) à laquelle l'événement doit être traité. */
  atTick: number;
}

/**
 * Un événement de la file du moteur à événements discrets.
 * Union discriminée par `kind`. La Phase 3 (moteur) et la Phase 4 (pile OSI)
 * complèteront cette union ; `deliver-frame` est le cas certain dès maintenant.
 */
export type SimEvent =
  | (SimEventBase & {
      kind: 'deliver-frame';
      to: Endpoint;
      frame: EthernetFrame;
      /** Lie l'événement au paquet en vol correspondant (retiré à la livraison). */
      flightId?: string;
    })
  | (SimEventBase & { kind: 'arp-timeout'; deviceId: DeviceId; ip: Ip })
  | (SimEventBase & { kind: 'app-wake'; deviceId: DeviceId; appKind: AppKind });

/** Une ligne du journal d'événements. */
export interface LogEntry {
  tick: number;
  layer: Layer;
  deviceId?: DeviceId;
  message: string;
  tag?: LogTag;
  /** Détails structurés optionnels (pour l'inspecteur et les tests). */
  ttl?: number;
  seq?: number;
  ip?: Ip;
  /** Corps d'une page web reçue (résultat HTTP, lu par le navigateur). */
  body?: string;
}

/** L'état complet du runtime de simulation. */
export interface World {
  /** La topologie simulée (le document, en lecture). */
  topology: Topology;
  tick: number;
  eventQueue: SimEvent[];
  inFlight: InFlightPacket[];
  /** État runtime par appareil. */
  runtime: Record<DeviceId, DeviceRuntime>;
  log: LogEntry[];
}

// ─────────────────────────────── Sélection ──────────────────────────────

/** Ce qui est sélectionné sur le canevas. Le lasso/Maj+clic produit une sélection
 *  `items` mixte (appareils ET annotations) — déplaçable et copiable en bloc. Un
 *  seul appareil ⇒ config (double-clic) ; une seule annotation ⇒ éditeur ; un lien
 *  reste à part. */
export type Selection =
  | { kind: 'none' }
  | { kind: 'link'; id: LinkId }
  | { kind: 'items'; deviceIds: DeviceId[]; annotationIds: string[] };
