// Moteur de simulation à ÉVÉNEMENTS DISCRETS — logique PURE et déterministe.
//
// Idée maîtresse (cf. CLAUDE.md) : un réseau est asynchrone. On modélise une
// horloge virtuelle (ticks) et une file d'événements. `step(world)` traite le
// PROCHAIN événement (le plus tôt), ce qui peut émettre des trames (donc planifier
// de futurs événements) et faire avancer/retirer des paquets en vol, puis renvoie
// un NOUVEAU world. Rien n'est muté en place → testable à froid, rejouable.
//
// Couches modélisées :
//   • LIAISON  — hôte filtre par MAC ; switch apprend MAC→port puis commute/diffuse.
//   • RÉSEAU+  — à la réception d'une trame acceptée, l'hôte/routeur fait remonter :
//                ARP (cache + requête/réponse), IP (routage longest-prefix +
//                passerelle, transfert routeur avec décrément TTL), ICMP (echo).
//   • Envoi    — un paquet IP est routé (resolveRoute), sa MAC de prochain saut est
//                résolue par ARP (paquet mis en attente puis ré-émis à la réponse).

import type {
  AppKind,
  ArpPacket,
  Device,
  DhcpConfig,
  DhcpMessage,
  DnsMessage,
  DnsPending,
  DnsThen,
  Endpoint,
  EthernetFrame,
  HttpMessage,
  IcmpMessage,
  InFlightPacket,
  InterfaceId,
  Ip,
  Ipv4Packet,
  Layer,
  LogTag,
  Mac,
  NatConfig,
  NatEntry,
  SimEvent,
  TcpConn,
  TcpSegment,
  Topology,
  UdpDatagram,
  World,
} from '../domain/types';
import { findDevice, findInterface, linkForEndpoint, otherEndpoint } from './topology';
import { isBroadcastMac, BROADCAST_MAC } from './mac';
import { isValidIp, parseIp, formatIp } from './ip';
import { arpReply, arpRequest, ethernet, icmpEcho, ipv4, tcp, udp, DEFAULT_TTL } from './frames';
import { lookupArp, withArp } from './stack/arp';
import { resolveRoute } from './stack/ip';
import { computeDynamicRoutes, DEFAULT_BW } from './routing';
import { uid } from './id';

/** Délai de propagation de référence (ticks) : celui d'un câble à 100 Mb/s (DEFAULT_BW). */
export const LINK_DELAY = 10;

/**
 * Délai de propagation d'un câble selon son débit : plus la bande passante est
 * élevée, plus la trame arrive vite. 100 Mb/s (DEFAULT_BW) = délai de référence
 * (LINK_DELAY) ; on fait varier en RACINE du rapport de débit pour garder une
 * animation lisible (≈ 3 ticks à 1 Gb/s, ~32 ticks à 10 Mb/s, borné [3, 40]). Un
 * câble sans débit défini prend le débit par défaut → timing identique à avant.
 */
export function linkDelay(bandwidth?: number): number {
  const bw = bandwidth && bandwidth > 0 ? bandwidth : DEFAULT_BW;
  const ticks = LINK_DELAY * Math.sqrt(DEFAULT_BW / bw);
  return Math.max(3, Math.min(40, Math.round(ticks)));
}
/** TTL initial des paquets émis par le moteur. */
export const TTL_DEFAULT = DEFAULT_TTL;

/**
 * Expiration d'une requête ARP (ticks) : si personne n'a répondu d'ici là, les
 * paquets en attente de cette MAC sont abandonnés (journalisés). Large : couvre
 * l'aller-retour le plus lent (câbles 10 Mb/s à travers plusieurs commutateurs).
 * L'événement est ANNULÉ dès qu'une trame ARP de la cible nous apprend sa MAC.
 */
export const ARP_TIMEOUT = 300;
/** Port UDP du service DNS. */
export const DNS_PORT = 53;
/** Port source (éphémère) des requêtes DNS du client. */
export const DNS_CLIENT_PORT = 50000;
/** Port TCP du service web (HTTP). */
export const HTTP_PORT = 80;
/** Ports UDP du service DHCP (serveur / client). */
export const DHCP_SERVER_PORT = 67;
export const DHCP_CLIENT_PORT = 68;
/** Adresse de diffusion limitée. */
const LIMITED_BROADCAST = '255.255.255.255';

/** Page servie par défaut par un serveur web sans contenu configuré. */
export const DEFAULT_PAGE =
  '<h1>Bienvenue !</h1>\n<p>Cette page est servie par un serveur web Networx.</p>';

/** Crée un world neuf à partir d'une topologie (runtime vide par appareil). */
export function createWorld(topology: Topology): World {
  const runtime: World['runtime'] = {};
  for (const d of topology.devices) {
    runtime[d.id] = {
      arpCache: [],
      macTable: [],
      pending: [],
      dnsPending: [],
      tcpConns: [],
      dhcpLeases: [],
      natTable: [],
      dynamicRoutes: [],
    };
  }
  return applyDynamicRoutes({ topology, tick: 0, eventQueue: [], inFlight: [], runtime, log: [] });
}

// ──────────────────────────── NAT (NAPT) ─────────────────────────────────

/** Port de départ pour l'allocation NAT (au-dessus des ports bien connus). */
const NAT_PORT_BASE = 10000;

type NatProto = NatEntry['proto'];

/** Le « port » pertinent pour le NAT : port source (UDP/TCP) ou identifiant ICMP. */
function natSrcPort(proto: string, payload: Ipv4Packet['payload']): { proto: NatProto; port: number } | null {
  if (proto === 'icmp') return { proto: 'icmp', port: (payload as IcmpMessage).id };
  if (proto === 'udp') return { proto: 'udp', port: (payload as UdpDatagram).srcPort };
  if (proto === 'tcp') return { proto: 'tcp', port: (payload as TcpSegment).srcPort };
  return null;
}

/** Le port DESTINATION (UDP/TCP) ou l'identifiant ICMP du paquet. */
function natDstPort(proto: string, payload: Ipv4Packet['payload']): { proto: NatProto; port: number } | null {
  if (proto === 'icmp') return { proto: 'icmp', port: (payload as IcmpMessage).id };
  if (proto === 'udp') return { proto: 'udp', port: (payload as UdpDatagram).dstPort };
  if (proto === 'tcp') return { proto: 'tcp', port: (payload as TcpSegment).dstPort };
  return null;
}

/** Réécrit le port SOURCE (ou l'id ICMP) d'un payload. */
function rewriteSrcPort(proto: NatProto, payload: Ipv4Packet['payload'], port: number): Ipv4Packet['payload'] {
  if (proto === 'icmp') return { ...(payload as IcmpMessage), id: port };
  if (proto === 'udp') return { ...(payload as UdpDatagram), srcPort: port };
  return { ...(payload as TcpSegment), srcPort: port };
}

/** Réécrit le port DESTINATION (ou l'id ICMP) d'un payload. */
function rewriteDstPort(proto: NatProto, payload: Ipv4Packet['payload'], port: number): Ipv4Packet['payload'] {
  if (proto === 'icmp') return { ...(payload as IcmpMessage), id: port };
  if (proto === 'udp') return { ...(payload as UdpDatagram), dstPort: port };
  return { ...(payload as TcpSegment), dstPort: port };
}

/**
 * Translation SORTANTE (LAN → WAN) : réécrit srcIp → IP publique (WAN) et le port
 * source → un port public. Si la source correspond à une redirection de port
 * (service hébergé), on réutilise SON port public fixe pour que le client externe
 * voie bien la réponse venir du port d'origine ; sinon on alloue dynamiquement (PAT).
 */
function applyOutboundNat(
  w: World,
  device: Device,
  wanIp: Ip,
  nat: NatConfig,
  packet: Ipv4Packet,
): { w: World; packet: Ipv4Packet } {
  const pp = natSrcPort(packet.protocol, packet.payload);
  if (!pp) return { w, packet };

  const rt = w.runtime[device.id];
  const natTable = rt.natTable;

  // 1. Réponse d'un service redirigé → on garde le port public de la règle.
  const fwd = (nat.portForwards ?? []).find(
    (r) => r.proto === pp.proto && r.privateIp === packet.srcIp && r.privatePort === pp.port,
  );

  let publicPort: number;
  let table = natTable;
  if (fwd) {
    publicPort = fwd.publicPort;
  } else {
    // 2. PAT dynamique : réutilise l'entrée existante ou en alloue une nouvelle.
    const existing = natTable.find(
      (e) => e.proto === pp.proto && e.privateIp === packet.srcIp && e.privatePort === pp.port,
    );
    if (existing) {
      publicPort = existing.publicPort;
    } else {
      publicPort = allocatePublicPort(natTable, nat, pp.proto);
      table = [...natTable, { proto: pp.proto, privateIp: packet.srcIp, privatePort: pp.port, publicPort, createdAt: w.tick }];
    }
  }

  const w2: World = { ...w, runtime: { ...w.runtime, [device.id]: { ...rt, natTable: table } } };
  const portStr = pp.proto === 'icmp' ? `id ${pp.port}` : `port ${pp.port}`;
  const logW = log(
    w2, 'network', device.id,
    `NAT sortant : masque l'adresse privée ${packet.srcIp} (${portStr}) derrière ${wanIp} (port ${publicPort})`,
    'forward', { ip: wanIp },
  );
  return { w: logW, packet: { ...packet, srcIp: wanIp, payload: rewriteSrcPort(pp.proto, packet.payload, publicPort) } };
}

/** Alloue un port public libre (≥ NAT_PORT_BASE), en évitant les ports déjà réservés. */
function allocatePublicPort(table: NatEntry[], nat: NatConfig, proto: NatProto): number {
  const used = new Set<number>([
    ...table.filter((e) => e.proto === proto).map((e) => e.publicPort),
    ...(nat.portForwards ?? []).filter((r) => r.proto === proto).map((r) => r.publicPort),
  ]);
  let port = NAT_PORT_BASE;
  while (used.has(port)) port++;
  return port;
}

/**
 * Translation ENTRANTE par redirection de port STATIQUE (DNAT) : un paquet TCP/UDP
 * vers IP_publique:portPublic est redirigé vers privateIp:privatePort. Permet
 * d'héberger un serveur derrière le NAT. `null` si aucune règle ne correspond.
 */
function staticPortForward(nat: NatConfig, packet: Ipv4Packet): Ipv4Packet | null {
  const dp = natDstPort(packet.protocol, packet.payload);
  if (!dp || dp.proto === 'icmp') return null; // pas de redirection statique pour ICMP
  const fwd = (nat.portForwards ?? []).find((r) => r.proto === dp.proto && r.publicPort === dp.port);
  if (!fwd) return null;
  const payload = rewriteDstPort(dp.proto, packet.payload, fwd.privatePort);
  return { ...packet, dstIp: fwd.privateIp, payload };
}

/** Cherche le retour d'une session PAT dynamique dans la table du routeur. */
function reverseDynamicNat(natTable: NatEntry[], packet: Ipv4Packet): Ipv4Packet | null {
  const dp = natDstPort(packet.protocol, packet.payload);
  if (!dp) return null;
  if (dp.proto === 'icmp' && (packet.payload as IcmpMessage).type !== 'echo-reply') return null;
  const entry = natTable.find((e) => e.proto === dp.proto && e.publicPort === dp.port);
  if (!entry) return null;
  return { ...packet, dstIp: entry.privateIp, payload: rewriteDstPort(dp.proto, packet.payload, entry.privatePort) };
}

// ─────────────────────────────────────────────────────────────────────────

function hasApp(device: Device, kind: AppKind): boolean {
  return (device.apps ?? []).some((a) => a.kind === kind);
}

/**
 * Recalcule les routes apprises par RIP/OSPF depuis la topologie et les installe
 * dans le runtime de chaque routeur dynamique. Journalise chaque route apprise
 * (à t courant). Sans routeur dynamique, ne change rien (défis statiques intacts).
 */
export function applyDynamicRoutes(world: World, options: { silent?: boolean } = {}): World {
  const learnedByDevice = computeDynamicRoutes(world.topology);
  const runtime = { ...world.runtime };
  let w: World = { ...world, runtime };
  for (const d of world.topology.devices) {
    const learned = learnedByDevice[d.id];
    const rt = runtime[d.id];
    if (!rt) continue;
    runtime[d.id] = {
      ...rt,
      dynamicRoutes: (learned ?? []).map((r) => ({
        destination: r.destination,
        prefix: r.prefix,
        gateway: r.gateway,
        interfaceId: r.interfaceId,
      })),
    };
    if (options.silent) continue;
    for (const r of learned ?? []) {
      w = log(
        w,
        'network',
        d.id,
        `${r.proto.toUpperCase()} : apprend la route vers ${r.destination}/${r.prefix} via ${r.gateway} (métrique ${r.metric})`,
        'routing',
        { ip: r.gateway },
      );
    }
  }
  return w;
}

/** Point d'entrée bas niveau : un appareil émet une trame brute sur une interface. */
export function emitFrame(world: World, from: Endpoint, frame: EthernetFrame): World {
  return putOnWire(world, from, frame, 'emit');
}

/**
 * Application : lance un ping depuis un appareil vers une cible qui peut être une
 * IP (envoi direct) ou un nom de domaine (résolution DNS d'abord, puis ping).
 */
export function startPing(world: World, srcDeviceId: string, target: string, seq = 1, id = 1): World {
  const device = findDevice(world.topology, srcDeviceId);
  if (!device) return world;
  if (isValidIp(target)) {
    const w0 = log(world, 'application', device.id, `lance un ping vers ${target}`, 'icmp', {
      ip: target,
      seq,
    });
    const packet = ipv4(firstIp(device), target, 'icmp', icmpEcho('echo-request', id, seq));
    return routePacket(w0, device, packet);
  }
  // Nom de domaine → on résout par DNS, puis on pingue l'IP obtenue.
  return startDnsLookup(world, srcDeviceId, target, id, { kind: 'ping', seq, pingId: id });
}

/** Application : résout un nom via le serveur DNS configuré (device.dns). */
export function startDnsLookup(
  world: World,
  srcDeviceId: string,
  name: string,
  id: number,
  then: DnsThen = { kind: 'lookup' },
): World {
  const device = findDevice(world.topology, srcDeviceId);
  if (!device) return world;
  if (!device.dns) {
    return log(world, 'application', device.id, `aucun serveur DNS configuré sur cette machine`, 'drop', {
      seq: id,
    });
  }
  return sendDnsQuery(world, device, device.dns, name, id, then);
}

/** Émet une requête DNS vers `server` et mémorise l'attente (then + serveur courant). */
function sendDnsQuery(
  world: World,
  device: Device,
  server: Ip,
  name: string,
  id: number,
  then: DnsThen,
): World {
  const rt = world.runtime[device.id];
  const dnsPending = [...rt.dnsPending.filter((p) => p.id !== id), { id, name, then, server }];
  let w: World = { ...world, runtime: { ...world.runtime, [device.id]: { ...rt, dnsPending } } };
  if (then.kind !== 'resolver') {
    w = log(w, 'application', device.id, `interroge le serveur DNS ${server} pour résoudre « ${name} »`, 'dns', {
      ip: server,
      seq: id,
    });
  }
  return sendUdp(w, device, server, DNS_CLIENT_PORT, DNS_PORT, { kind: 'query', id, name });
}

/** Application : récupère une page web (HTTP GET). L'URL peut viser une IP ou un nom. */
export function startHttpGet(world: World, srcDeviceId: string, url: string, reqId: number): World {
  const device = findDevice(world.topology, srcDeviceId);
  if (!device) return world;
  const { host, path } = parseUrl(url);
  const w0 = log(world, 'application', device.id, `ouvre http://${host}${path} dans le navigateur`, 'http', {
    seq: reqId,
  });
  if (isValidIp(host)) return httpConnect(w0, device, host, host, path, reqId);
  return startDnsLookup(w0, srcDeviceId, host, reqId, { kind: 'http', reqId, path });
}

/** Application : traceroute — envoie des echo-requests à TTL croissant (1..maxHops). */
export function startTraceroute(
  world: World,
  srcDeviceId: string,
  dstIp: Ip,
  id: number,
  maxHops = 8,
): World {
  const device = findDevice(world.topology, srcDeviceId);
  if (!device) return world;
  let w = log(world, 'application', device.id, `trace la route vers ${dstIp} (TTL croissant pour révéler chaque routeur)`, 'icmp', { ip: dstIp });
  for (let hop = 1; hop <= maxHops; hop++) {
    const packet = ipv4(firstIp(device), dstIp, 'icmp', icmpEcho('echo-request', id, hop), hop);
    w = routePacket(w, device, packet);
  }
  return w;
}

/**
 * Au démarrage de la simulation : chaque hôte (pc/serveur) câblé mais sans IP
 * demande automatiquement une adresse par DHCP (comme une interface en mode DHCP).
 */
export function autoConfigureDhcp(world: World): World {
  let w = world;
  let req = 9000;
  for (const d of world.topology.devices) {
    if (d.kind !== 'pc') continue;
    const itf = d.interfaces[0];
    if (!itf || itf.ip) continue;
    if (!linkForEndpoint(world.topology, { deviceId: d.id, interfaceId: itf.id })) continue;
    w = startDhcp(w, d.id, req++);
  }
  return w;
}

/** Application : le client demande une adresse IP par DHCP (diffusion Discover). */
export function startDhcp(world: World, srcDeviceId: string, reqId: number): World {
  const device = findDevice(world.topology, srcDeviceId);
  if (!device) return world;
  const itf = device.interfaces[0];
  if (!itf) return world;
  const w0 = log(world, 'application', device.id, `pas d'adresse IP → demande un bail DHCP (Discover)`, 'dhcp', {
    seq: reqId,
  });
  const disc: DhcpMessage = { kind: 'discover', xid: reqId, mac: itf.mac };
  return sendDhcp(w0, device, itf.id, '0.0.0.0', DHCP_CLIENT_PORT, DHCP_SERVER_PORT, disc);
}

function parseUrl(url: string): { host: string; path: string } {
  const noScheme = url.replace(/^https?:\/\//i, '');
  const slash = noScheme.indexOf('/');
  if (slash === -1) return { host: noScheme, path: '/' };
  return { host: noScheme.slice(0, slash), path: noScheme.slice(slash) || '/' };
}

/** Traite le prochain événement (le plus tôt). Renvoie le world inchangé si la file est vide. */
export function step(world: World): World {
  if (world.eventQueue.length === 0) return world;
  let idx = 0;
  for (let i = 1; i < world.eventQueue.length; i++) {
    if (world.eventQueue[i].atTick < world.eventQueue[idx].atTick) idx = i;
  }
  const event = world.eventQueue[idx];
  const eventQueue = world.eventQueue.filter((_, i) => i !== idx);
  const advanced: World = { ...world, tick: event.atTick, eventQueue };
  return processEvent(advanced, event);
}

/** Avance jusqu'à épuisement de la file (avec garde-fou anti-boucle). */
export function run(world: World, maxSteps = 10000): World {
  let w = world;
  let n = 0;
  while (w.eventQueue.length > 0 && n < maxSteps) {
    w = step(w);
    n++;
  }
  return w;
}

// ─────────────────────────────── Journal ────────────────────────────────

function log(
  w: World,
  layer: Layer,
  deviceId: string | undefined,
  message: string,
  tag: LogTag,
  extra?: { ttl?: number; seq?: number; ip?: Ip; body?: string },
): World {
  return { ...w, log: [...w.log, { tick: w.tick, layer, deviceId, message, tag, ...extra }] };
}

// ───────────────────── Description des trames (journal) ──────────────────

const DHCP_LABEL: Record<DhcpMessage['kind'], string> = {
  discover: 'Discover',
  offer: 'Offer',
  request: 'Request',
  ack: 'Ack',
};

function isDnsMsg(p: unknown): p is DnsMessage {
  const k = (p as DnsMessage | undefined)?.kind;
  return k === 'query' || k === 'response';
}

function tcpFlagsLabel(f: TcpSegment['flags']): string {
  const on = [f.syn && 'SYN', f.fin && 'FIN', f.rst && 'RST', f.ack && 'ACK'].filter(Boolean);
  return on.join('-') || 'données';
}

/**
 * Décrit le CONTENU d'une trame pour le journal (protocole + intention), du point de
 * vue d'un hôte/routeur qui l'émet. Sans nom d'appareil ni interface : l'appelant les
 * ajoute. C'est ce qui rend le journal explicite (« une requête ARP », « un message
 * DHCP Discover »…) plutôt qu'une suite d'adresses MAC.
 */
function describeFrame(frame: EthernetFrame): string {
  if (frame.etherType === 'arp') {
    const a = frame.payload;
    return a.op === 'request'
      ? `une requête ARP « qui a ${a.targetIp} ? »`
      : `une réponse ARP : ${a.senderIp} est en ${a.senderMac}`;
  }
  const p = frame.payload;
  if (p.protocol === 'icmp') {
    const m = p.payload as IcmpMessage;
    if (m.type === 'echo-request') return `une demande d'écho ICMP (ping)`;
    if (m.type === 'echo-reply') return `une réponse d'écho ICMP (pong)`;
    if (m.type === 'time-exceeded') return `un message ICMP « durée de vie (TTL) expirée »`;
    return `un message ICMP « destination injoignable »`;
  }
  if (p.protocol === 'udp') {
    const d = p.payload as UdpDatagram;
    const pl = d.payload;
    if (isDhcp(pl)) return `un message DHCP ${DHCP_LABEL[pl.kind]}`;
    if (isDnsMsg(pl)) {
      return pl.kind === 'query'
        ? `une requête DNS pour « ${pl.name} »`
        : `une réponse DNS pour « ${pl.name} »`;
    }
    return `un datagramme UDP (→ port ${d.dstPort})`;
  }
  const s = p.payload as TcpSegment;
  return `un segment TCP ${tcpFlagsLabel(s.flags)}${s.payload ? ' (avec données)' : ''}`;
}

/** Étiquette « couche liaison » : ce qu'un commutateur (L2) distingue d'une trame —
 *  juste son type, sans en lire le contenu (un switch ne regarde pas au-delà des MAC). */
function frameL2(frame: EthernetFrame): string {
  return frame.etherType === 'arp'
    ? 'une trame ARP'
    : `une trame IPv4 (${frame.payload.protocol.toUpperCase()})`;
}

// ────────────────────────── Couche physique ─────────────────────────────

/**
 * Physique pure : place une trame sur le câble branché à `from` (vol + livraison
 * planifiée après LINK_DELAY). Port non câblé → trame perdue (journalisée). Ne
 * journalise PAS l'émission elle-même : c'est le rôle de l'appelant (`putOnWire`,
 * `floodFrom`, `forwardOne`), pour formuler le message à la bonne couche.
 */
function emitOnWire(w: World, from: Endpoint, frame: EthernetFrame): World {
  const link = linkForEndpoint(w.topology, from);
  if (!link) {
    const ifName = findInterface(w.topology, from.deviceId, from.interfaceId)?.name ?? from.interfaceId;
    return log(w, 'physical', from.deviceId, `${ifName} n'est pas câblée → la trame est perdue`, 'drop');
  }
  const to = otherEndpoint(link, from);
  const flightId = uid('flight');
  const arriveTick = w.tick + linkDelay(link.bandwidth);
  const flight: InFlightPacket = {
    id: flightId,
    linkId: link.id,
    from,
    to,
    frame,
    departTick: w.tick,
    arriveTick,
  };
  const event: SimEvent = {
    id: uid('ev'),
    atTick: arriveTick,
    kind: 'deliver-frame',
    to,
    frame,
    flightId,
  };
  return { ...w, inFlight: [...w.inFlight, flight], eventQueue: [...w.eventQueue, event] };
}

/**
 * Émission par un hôte/routeur : journalise « quoi est émis, et vers quelle MAC »
 * (protocole nommé via `describeFrame`, diffusion glosée) puis pose la trame sur le
 * câble. La colonne colorée du journal porte déjà le nom de l'appareil → le message
 * commence directement par le verbe.
 */
function putOnWire(w: World, from: Endpoint, frame: EthernetFrame, tag: LogTag): World {
  const ifName = findInterface(w.topology, from.deviceId, from.interfaceId)?.name ?? from.interfaceId;
  const link = linkForEndpoint(w.topology, from);
  if (!link) {
    return log(w, 'physical', from.deviceId, `${ifName} n'est pas câblée → la trame est perdue`, 'drop');
  }
  const broadcast = isBroadcastMac(frame.dstMac);
  const relaying = findDevice(w.topology, from.deviceId)?.kind === 'router' && tag === 'forward';
  const verb = broadcast ? 'diffuse' : relaying ? 'transmet' : 'émet';
  const dest = broadcast
    ? `→ ${frame.dstMac} (diffusion : tous les hôtes du segment)`
    : `→ ${frame.dstMac}`;
  // L'IP cible d'une requête ARP alimente le diagnostic d'échec (ARP resté sans réponse).
  const extra =
    frame.etherType === 'arp' && frame.payload.op === 'request'
      ? { ip: frame.payload.targetIp }
      : undefined;
  const w1 = log(w, 'link', from.deviceId, `${verb} ${describeFrame(frame)} sur ${ifName} ${dest}`, tag, extra);
  return emitOnWire(w1, from, frame);
}

// ──────────────────────── Traitement d'événement ────────────────────────

function processEvent(w: World, event: SimEvent): World {
  switch (event.kind) {
    case 'deliver-frame': {
      const cur = event.flightId
        ? { ...w, inFlight: w.inFlight.filter((f) => f.id !== event.flightId) }
        : w;
      return deliverFrame(cur, event.to, event.frame);
    }
    case 'arp-timeout': {
      // Personne n'a répondu à la requête ARP : on abandonne les paquets qui
      // attendaient cette MAC (sinon ils resteraient en file pour toujours).
      const rt = w.runtime[event.deviceId];
      if (!rt) return w;
      if (lookupArp(rt.arpCache, event.ip)) return w; // résolue entre-temps
      const dropped = rt.pending.filter((p) => p.nextHopIp === event.ip);
      if (dropped.length === 0) return w;
      const pending = rt.pending.filter((p) => p.nextHopIp !== event.ip);
      const w2: World = { ...w, runtime: { ...w.runtime, [event.deviceId]: { ...rt, pending } } };
      const n = dropped.length;
      return log(
        w2,
        'network',
        event.deviceId,
        `${event.ip} ne répond pas à l'ARP → abandonne ${n} paquet${n > 1 ? 's' : ''} en attente`,
        'drop',
        { ip: event.ip },
      );
    }
    case 'app-wake':
      return w; // réservé (jamais planifié pour l'instant)
  }
}

/** Une trame arrive sur une interface : dispatch selon le type d'appareil. */
function deliverFrame(w: World, to: Endpoint, frame: EthernetFrame): World {
  const device = findDevice(w.topology, to.deviceId);
  if (!device) return w;
  const ingress = to.interfaceId;

  switch (device.kind) {
    case 'switch': {
      const cur = learnMac(w, device, ingress, frame.srcMac);
      if (isBroadcastMac(frame.dstMac)) return floodFrom(cur, device, ingress, frame);
      const port = lookupMac(cur, device.id, frame.dstMac);
      if (!port) return floodFrom(cur, device, ingress, frame);
      if (port === ingress) {
        return log(cur, 'link', device.id, `ignore ${frameL2(frame)} : le destinataire est déjà sur le port d'arrivée`, 'drop');
      }
      return forwardOne(cur, device, port, frame);
    }

    case 'pc':
    case 'router': {
      const itf = findInterface(w.topology, device.id, ingress);
      const forUs = !!itf && (isBroadcastMac(frame.dstMac) || frame.dstMac === itf.mac);
      if (!forUs) {
        return log(w, 'link', device.id, `ignore ${frameL2(frame)} : elle est adressée à une autre carte réseau (MAC)`, 'drop');
      }
      const accepted = log(w, 'link', device.id, `reçoit ${frameL2(frame)} et vérifie l'adresse MAC de destination`, 'host-receive');
      if (frame.etherType === 'arp') return handleArp(accepted, device, ingress, frame.payload);
      return receiveIp(accepted, device, ingress, frame.payload as Ipv4Packet);
    }
  }
}

// ──────────────────────── Couche liaison (switch) ───────────────────────

function floodFrom(w: World, device: Device, ingress: InterfaceId, frame: EthernetFrame): World {
  const ports = device.interfaces.filter(
    (itf) =>
      itf.id !== ingress &&
      linkForEndpoint(w.topology, { deviceId: device.id, interfaceId: itf.id }),
  );
  if (ports.length === 0) return w;
  // Le commutateur ne sait pas (encore) sur quel port joindre le destinataire : il
  // recopie la trame sur tous ses autres ports. Une seule ligne pour tout le segment.
  const where = ports.length === 1 ? 'son autre port' : `ses ${ports.length} autres ports`;
  const reason = isBroadcastMac(frame.dstMac)
    ? 'trame de diffusion'
    : `port du destinataire ${frame.dstMac} encore inconnu`;
  let cur = log(w, 'link', device.id, `diffuse ${frameL2(frame)} sur ${where} (${reason})`, 'flood');
  for (const itf of ports) {
    cur = emitOnWire(cur, { deviceId: device.id, interfaceId: itf.id }, frame);
  }
  return cur;
}

function forwardOne(w: World, device: Device, egress: InterfaceId, frame: EthernetFrame): World {
  const ifName = findInterface(w.topology, device.id, egress)?.name ?? egress;
  // Le port du destinataire est connu (appris) → transmission ciblée, pas de diffusion.
  const w1 = log(
    w,
    'link',
    device.id,
    `transmet ${frameL2(frame)} vers ${ifName} (→ ${frame.dstMac})`,
    'forward',
  );
  return emitOnWire(w1, { deviceId: device.id, interfaceId: egress }, frame);
}

function learnMac(w: World, device: Device, ingress: InterfaceId, mac: Mac): World {
  const rt = w.runtime[device.id];
  const existing = rt.macTable.find((e) => e.mac === mac);
  if (existing && existing.interfaceId === ingress) return w;
  const macTable = [
    ...rt.macTable.filter((e) => e.mac !== mac),
    { mac, interfaceId: ingress, learnedAtTick: w.tick },
  ];
  const w2: World = { ...w, runtime: { ...w.runtime, [device.id]: { ...rt, macTable } } };
  const ifName = findInterface(w.topology, device.id, ingress)?.name ?? ingress;
  return log(w2, 'link', device.id, `mémorise que ${mac} se trouve sur ${ifName} (apprentissage de la table MAC)`, 'switch-learn');
}

function lookupMac(w: World, deviceId: string, mac: Mac): InterfaceId | null {
  return w.runtime[deviceId]?.macTable.find((e) => e.mac === mac)?.interfaceId ?? null;
}

// ──────────────────────────── Couche réseau ─────────────────────────────

function handleArp(w: World, device: Device, ingress: InterfaceId, arp: ArpPacket): World {
  // On apprend toujours l'expéditeur dans le cache ARP (IP ↔ MAC), et l'éventuelle
  // expiration ARP en attente pour cette IP n'a plus lieu d'être : on l'annule.
  const rt = w.runtime[device.id];
  let cur: World = {
    ...w,
    eventQueue: w.eventQueue.filter(
      (e) => !(e.kind === 'arp-timeout' && e.deviceId === device.id && e.ip === arp.senderIp),
    ),
    runtime: {
      ...w.runtime,
      [device.id]: { ...rt, arpCache: withArp(rt.arpCache, arp.senderIp, arp.senderMac, w.tick) },
    },
  };
  if (arp.op === 'reply') {
    // C'est la réponse à NOTRE requête : on note la correspondance AVANT d'agir.
    cur = log(
      cur,
      'network',
      device.id,
      `réponse ARP reçue : ${arp.senderIp} est en ${arp.senderMac} → ajouté au cache ARP`,
      'arp',
      { ip: arp.senderIp },
    );
  }
  // La MAC est désormais connue : on libère les paquets qui l'attendaient (ex. le ping).
  cur = flushPending(cur, device, arp.senderIp);
  const itf = findInterface(cur.topology, device.id, ingress);
  if (arp.op === 'request' && itf?.ip && itf.ip === arp.targetIp) {
    // La requête nous cible : on connaît notre propre MAC → on répond en direct à l'émetteur.
    const reply = arpReply(itf.mac, itf.ip, arp.senderMac, arp.senderIp);
    cur = putOnWire(cur, { deviceId: device.id, interfaceId: ingress }, ethernet(itf.mac, arp.senderMac, 'arp', reply), 'arp');
  }
  return cur;
}

function receiveIp(w: World, device: Device, ingress: InterfaceId, packet: Ipv4Packet): World {
  const isBroadcast = packet.dstIp === LIMITED_BROADCAST;
  const forUs = isBroadcast || device.interfaces.some((i) => i.ip && i.ip === packet.dstIp);

  if (forUs) {
    // NAT entrant — uniquement sur l'interface externe (WAN). Le paquet vise l'IP
    // publique du routeur : soit une redirection de port (serveur hébergé), soit le
    // retour d'une session sortante. On retraduit le destinataire puis on re-route.
    if (device.kind === 'router' && device.nat && ingress === device.nat.wanInterfaceId) {
      const restored =
        staticPortForward(device.nat, packet) ?? reverseDynamicNat(w.runtime[device.id].natTable, packet);
      if (restored) {
        const logW = log(
          w, 'network', device.id,
          `NAT entrant : rétablit le destinataire privé → ${restored.dstIp}`,
          'forward', { ip: restored.dstIp },
        );
        // routePacketRaw : ne PAS ré-appliquer le NAT sortant sur ce paquet déjà traduit.
        return routePacketRaw(logW, device, restored);
      }
    }
    if (packet.protocol === 'udp') {
      return receiveUdp(w, device, ingress, packet, packet.payload as UdpDatagram);
    }
    if (packet.protocol === 'tcp') {
      return receiveTcp(w, device, packet, packet.payload as TcpSegment);
    }
    if (packet.protocol !== 'icmp') {
      return log(w, 'transport', device.id, `protocole ${packet.protocol} non géré → paquet abandonné`, 'drop');
    }
    const icmp = packet.payload as IcmpMessage;
    if (icmp.type === 'echo-request') {
      const w2 = log(
        w,
        'network',
        device.id,
        `reçoit une demande d'écho de ${packet.srcIp} → renvoie une réponse (pong)`,
        'icmp',
        { ttl: packet.ttl, seq: icmp.seq, ip: packet.srcIp },
      );
      const reply = ipv4(packet.dstIp, packet.srcIp, 'icmp', icmpEcho('echo-reply', icmp.id, icmp.seq));
      return routePacket(w2, device, reply);
    }
    if (icmp.type === 'echo-reply') {
      return log(
        w,
        'network',
        device.id,
        `reçoit la réponse au ping de ${packet.srcIp} (echo-reply, seq=${icmp.seq})`,
        'icmp',
        { seq: icmp.seq, ip: packet.srcIp, ttl: packet.ttl },
      );
    }
    if (icmp.type === 'time-exceeded') {
      return log(
        w,
        'network',
        device.id,
        `TTL expiré signalé par ${packet.srcIp} (révèle le saut n°${icmp.seq})`,
        'icmp',
        { seq: icmp.seq, ip: packet.srcIp },
      );
    }
    return log(w, 'network', device.id, `reçoit un message ICMP`, 'icmp');
  }

  // Pas pour nous : un routeur transfère, un hôte abandonne.
  if (device.kind === 'router') {
    if (packet.ttl <= 1) {
      // TTL épuisé : on prévient la source par un ICMP « time-exceeded » (sert au traceroute).
      const orig = packet.protocol === 'icmp' ? (packet.payload as IcmpMessage) : null;
      const te: IcmpMessage = { type: 'time-exceeded', id: orig?.id ?? 0, seq: orig?.seq ?? 0 };
      const w2 = log(w, 'network', device.id, `durée de vie (TTL) du paquet épuisée → prévient ${packet.srcIp} par un ICMP « TTL expiré »`, 'icmp', {
        ttl: packet.ttl,
        ip: packet.srcIp,
      });
      return routePacket(w2, device, ipv4(firstIp(device), packet.srcIp, 'icmp', te));
    }
    const fwd: Ipv4Packet = { ...packet, ttl: packet.ttl - 1 };
    const w2 = log(w, 'network', device.id, `route le paquet vers ${packet.dstIp} et décrémente le TTL (${packet.ttl} → ${fwd.ttl})`, 'forward', {
      ttl: fwd.ttl,
      ip: packet.dstIp,
    });
    return routePacket(w2, device, fwd);
  }
  return log(w, 'network', device.id, `abandonne le paquet : il ne lui est pas destiné (et ce n'est pas un routeur)`, 'drop', { ip: packet.dstIp });
}

/** Route un paquet IP sans appliquer le NAT (chemin retour après reverse-NAT). */
function routePacketRaw(w: World, device: Device, packet: Ipv4Packet): World {
  const decision = resolveRoute(device, packet.dstIp, w.runtime[device.id]?.dynamicRoutes);
  if (!decision) {
    return log(w, 'network', device.id, `aucune route connue vers ${packet.dstIp} → destination injoignable`, 'drop', {
      ip: packet.dstIp,
    });
  }
  return sendIpVia(w, device, decision.egressIfId, decision.nextHopIp, packet);
}

/** Route un paquet IP : choisit la sortie puis l'envoie (avec résolution ARP). */
function routePacket(w: World, device: Device, packet: Ipv4Packet): World {
  const decision = resolveRoute(device, packet.dstIp, w.runtime[device.id]?.dynamicRoutes);
  if (!decision) {
    return log(w, 'network', device.id, `aucune route connue vers ${packet.dstIp} → destination injoignable`, 'drop', {
      ip: packet.dstIp,
    });
  }

  // NAT sortant (LAN → WAN) : appliqué si le routeur a NAT activé avec une interface
  // externe désignée, que ce paquet SORT par cette interface, et qu'il est routé
  // (≠ originé par le routeur lui-même, dont l'IP est déjà publique).
  const nat = device.nat;
  if (device.kind === 'router' && nat?.wanInterfaceId && decision.egressIfId === nat.wanInterfaceId) {
    const wanItf = findInterface(w.topology, device.id, nat.wanInterfaceId);
    const isOwnPacket = device.interfaces.some((i) => i.ip === packet.srcIp);
    if (wanItf?.ip && !isOwnPacket) {
      const { w: natW, packet: natPacket } = applyOutboundNat(w, device, wanItf.ip, nat, packet);
      return sendIpVia(natW, device, decision.egressIfId, decision.nextHopIp, natPacket);
    }
  }

  return sendIpVia(w, device, decision.egressIfId, decision.nextHopIp, packet);
}

/** Émet un paquet IP par une interface vers un prochain saut (ARP si besoin). */
function sendIpVia(
  w: World,
  device: Device,
  egressIfId: InterfaceId,
  nextHopIp: Ip,
  packet: Ipv4Packet,
): World {
  const egress = findInterface(w.topology, device.id, egressIfId);
  if (!egress || !egress.ip) {
    return log(w, 'network', device.id, `interface de sortie sans adresse IP → impossible d'émettre`, 'drop');
  }
  const mac = lookupArp(w.runtime[device.id].arpCache, nextHopIp);
  if (mac) {
    const frame = ethernet(egress.mac, mac, 'ipv4', packet);
    return putOnWire(w, { deviceId: device.id, interfaceId: egressIfId }, frame, 'forward');
  }
  // MAC inconnue : mettre en attente puis émettre une requête ARP — sauf si une
  // résolution est DÉJÀ en cours pour ce saut (on ne rediffuse pas à chaque paquet).
  const rt = w.runtime[device.id];
  const alreadyAsking = rt.pending.some((p) => p.nextHopIp === nextHopIp);
  const pending = [...rt.pending, { egressIfId, nextHopIp, packet }];
  const queued: World = { ...w, runtime: { ...w.runtime, [device.id]: { ...rt, pending } } };
  return alreadyAsking ? queued : sendArpRequest(queued, device, egressIfId, nextHopIp);
}

function sendArpRequest(w: World, device: Device, egressIfId: InterfaceId, targetIp: Ip): World {
  const egress = findInterface(w.topology, device.id, egressIfId);
  if (!egress || !egress.ip) {
    return log(w, 'network', device.id, `résolution ARP impossible : interface de sortie sans adresse IP`, 'drop');
  }
  // La MAC du prochain saut est inconnue : on la demande par une requête ARP diffusée.
  // (Le journal de l'émission, avec « qui a ${targetIp} », est produit par putOnWire.)
  const frame = ethernet(egress.mac, BROADCAST_MAC, 'arp', arpRequest(egress.mac, egress.ip, targetIp));
  const sent = putOnWire(w, { deviceId: device.id, interfaceId: egressIfId }, frame, 'arp');
  // Garde-fou : si personne ne répond d'ici ARP_TIMEOUT, les paquets en attente
  // seront abandonnés (l'événement est annulé dès qu'une réponse arrive).
  const timeout: SimEvent = {
    id: uid('ev'),
    atTick: w.tick + ARP_TIMEOUT,
    kind: 'arp-timeout',
    deviceId: device.id,
    ip: targetIp,
  };
  return { ...sent, eventQueue: [...sent.eventQueue, timeout] };
}

// ──────────────────────── Couche transport (UDP) ────────────────────────

function sendUdp(
  w: World,
  device: Device,
  dstIp: Ip,
  srcPort: number,
  dstPort: number,
  payload: UdpDatagram['payload'],
): World {
  const packet = ipv4(firstIp(device), dstIp, 'udp', udp(srcPort, dstPort, payload));
  return routePacket(w, device, packet);
}

function receiveUdp(
  w: World,
  device: Device,
  ingress: InterfaceId,
  packet: Ipv4Packet,
  datagram: UdpDatagram,
): World {
  // DHCP (ports 67/68).
  if (datagram.dstPort === DHCP_SERVER_PORT && device.dhcp && isDhcp(datagram.payload)) {
    return handleDhcpServer(w, device, ingress, datagram.payload);
  }
  if (datagram.dstPort === DHCP_CLIENT_PORT && isDhcp(datagram.payload)) {
    return handleDhcpClient(w, device, ingress, datagram.payload);
  }
  // DNS (port 53).
  const payload = datagram.payload as DnsMessage | undefined;
  if (datagram.dstPort === DNS_PORT && hasApp(device, 'dns-server') && payload?.kind === 'query') {
    return handleDnsQuery(w, device, packet, datagram, payload);
  }
  if (payload?.kind === 'response') {
    return handleDnsResponse(w, device, payload);
  }
  return w; // port fermé / non concerné → ignoré
}

function isDhcp(p: unknown): p is DhcpMessage {
  if (!p || typeof p !== 'object') return false;
  const k = (p as DhcpMessage).kind;
  return k === 'discover' || k === 'offer' || k === 'request' || k === 'ack';
}

const eqName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** La zone couvre-t-elle le nom ? (ex. zone « local » couvre « web.local »). */
const zoneCovers = (zone: string, name: string) =>
  eqName(zone, name) || name.toLowerCase().endsWith('.' + zone.toLowerCase());

/**
 * Le serveur DNS traite une requête : enregistrement A (réponse finale), CNAME
 * (alias résolu localement) ou délégation NS. En mode RÉCURSIF il suit lui-même
 * la délégation ; sinon il renvoie une orientation (référence) que l'appelant suit.
 */
function handleDnsQuery(
  w: World,
  device: Device,
  packet: Ipv4Packet,
  datagram: UdpDatagram,
  query: DnsMessage,
): World {
  const app = (device.apps ?? []).find((a) => a.kind === 'dns-server');
  const records = app?.records ?? [];
  const name = query.name;
  const reply = (fields: Partial<DnsMessage>, msg: string, ip?: Ip) => {
    const w2 = log(w, 'application', device.id, `serveur DNS : ${msg}`, 'dns', ip ? { ip } : undefined);
    const response: DnsMessage = { kind: 'response', id: query.id, name, ...fields };
    return sendUdp(w2, device, packet.srcIp, DNS_PORT, datagram.srcPort, response);
  };

  // 1. Enregistrement A direct.
  const a = records.find((r) => r.type === 'A' && eqName(r.name, name));
  if (a) return reply({ answer: a.value }, `résout « ${name} » → ${a.value}`, a.value);

  // 2. Alias CNAME (résolu localement vers un A du même serveur).
  const c = records.find((r) => r.type === 'CNAME' && eqName(r.name, name));
  if (c) {
    const target = records.find((r) => r.type === 'A' && eqName(r.name, c.value));
    return target
      ? reply({ answer: target.value }, `« ${name} » est un alias de « ${c.value} » → ${target.value}`, target.value)
      : reply({ answer: null }, `« ${name} » : alias « ${c.value} » non résolu`);
  }

  // 3. Délégation NS (zone la plus longue qui couvre le nom).
  const ns = records
    .filter((r) => r.type === 'NS' && zoneCovers(r.name, name))
    .sort((x, y) => y.name.length - x.name.length)[0];
  if (ns) {
    if (app?.recursive) {
      // Récursif : le serveur interroge lui-même le serveur délégué.
      const w2 = log(w, 'application', device.id, `serveur DNS récursif : interroge à son tour ${ns.value} pour « ${name} »`, 'dns', { ip: ns.value });
      return sendDnsQuery(w2, device, ns.value, name, query.id, {
        kind: 'resolver',
        clientIp: packet.srcIp,
        clientPort: datagram.srcPort,
      });
    }
    return reply({ referral: ns.value }, `délègue « ${name} » au serveur ${ns.value} (zone ${ns.name})`, ns.value);
  }

  // 4. Inconnu.
  return reply({ answer: null }, `« ${name} » introuvable`);
}

/** Réception d'une réponse DNS : réponse finale, suivi d'alias/délégation, ou échec. */
function handleDnsResponse(w: World, device: Device, response: DnsMessage): World {
  const rt = w.runtime[device.id];
  const pending = rt.dnsPending.find((p) => p.id === response.id);
  if (!pending) return w; // réponse non sollicitée
  const cur: World = {
    ...w,
    runtime: { ...w.runtime, [device.id]: { ...rt, dnsPending: rt.dnsPending.filter((p) => p.id !== response.id) } },
  };

  if (response.answer != null) return finishDns(cur, device, pending, response.answer);
  // Itératif : on suit la référence vers le serveur délégué (même nom).
  if (response.referral) {
    const w2 = log(cur, 'application', device.id, `suit la délégation DNS → interroge ${response.referral}`, 'dns', { ip: response.referral, seq: pending.id });
    return sendDnsQuery(w2, device, response.referral, pending.name, pending.id, pending.then);
  }
  // Alias CNAME : on re-résout l'alias auprès du même serveur.
  if (response.cname && pending.server) {
    return sendDnsQuery(cur, device, pending.server, response.cname, pending.id, pending.then);
  }
  return failDns(cur, device, pending);
}

/** Résolution DNS aboutie (IP obtenue) : journalise et enchaîne l'action prévue. */
function finishDns(w: World, device: Device, pending: DnsPending, ip: Ip): World {
  const then = pending.then;
  if (then.kind === 'resolver') {
    // Serveur récursif : transmet la réponse finale au client d'origine.
    const w2 = log(w, 'application', device.id, `serveur DNS récursif : renvoie la réponse finale ${ip} pour « ${pending.name} »`, 'dns', { ip });
    return sendUdp(w2, device, then.clientIp, DNS_PORT, then.clientPort, {
      kind: 'response',
      id: pending.id,
      name: pending.name,
      answer: ip,
    });
  }
  const w1 = log(w, 'application', device.id, `résolution DNS terminée : « ${pending.name} » a pour adresse ${ip}`, 'dns', { ip, seq: pending.id });
  if (then.kind === 'ping') {
    const w2 = log(w1, 'application', device.id, `lance un ping vers ${pending.name} (${ip})`, 'icmp', { ip, seq: then.seq });
    return routePacket(w2, device, ipv4(firstIp(device), ip, 'icmp', icmpEcho('echo-request', then.pingId, then.seq)));
  }
  if (then.kind === 'http') return httpConnect(w1, device, ip, pending.name, then.path, then.reqId);
  return w1;
}

/** Résolution DNS échouée (introuvable). */
function failDns(w: World, device: Device, pending: DnsPending): World {
  const then = pending.then;
  if (then.kind === 'resolver') {
    return sendUdp(w, device, then.clientIp, DNS_PORT, then.clientPort, {
      kind: 'response',
      id: pending.id,
      name: pending.name,
      answer: null,
    });
  }
  return log(w, 'application', device.id, `« ${pending.name} » introuvable (le DNS n'a pas de réponse)`, 'dns', { seq: pending.id });
}

// ─────────────────────────────── DHCP ───────────────────────────────────

/** Émet une trame DHCP en diffusion (L2 + IP broadcast) sur une interface. */
function sendDhcp(
  w: World,
  device: Device,
  ifaceId: InterfaceId,
  srcIp: Ip,
  srcPort: number,
  dstPort: number,
  payload: DhcpMessage,
): World {
  const itf = findInterface(w.topology, device.id, ifaceId);
  if (!itf) return w;
  const frame = ethernet(itf.mac, BROADCAST_MAC, 'ipv4', ipv4(srcIp, LIMITED_BROADCAST, 'udp', udp(srcPort, dstPort, payload)));
  return putOnWire(w, { deviceId: device.id, interfaceId: ifaceId }, frame, 'flood');
}

function handleDhcpServer(w: World, device: Device, ingress: InterfaceId, msg: DhcpMessage): World {
  const cfg = device.dhcp;
  if (!cfg) {
    return log(w, 'application', device.id, `serveur DHCP non configuré`, 'drop', { seq: msg.xid });
  }
  if (msg.kind !== 'discover' && msg.kind !== 'request') return w;
  const ip = leaseFor(w, device, msg.mac, cfg);
  if (!ip) {
    return log(w, 'application', device.id, `plage DHCP épuisée → plus aucune adresse à attribuer`, 'drop', { seq: msg.xid });
  }
  let cur = reserveLease(w, device, msg.mac, ip);
  const offer = msg.kind === 'discover';
  cur = log(cur, 'application', device.id, `serveur DHCP : ${offer ? 'propose' : 'attribue'} ${ip} à ${msg.mac}`, 'dhcp', { ip, seq: msg.xid });
  const resp: DhcpMessage = {
    kind: offer ? 'offer' : 'ack',
    xid: msg.xid,
    mac: msg.mac,
    ip,
    prefix: cfg.prefix,
    gateway: cfg.gateway,
    dns: cfg.dns,
  };
  const srcIp = device.interfaces.find((i) => i.ip)?.ip ?? '0.0.0.0';
  return sendDhcp(cur, device, ingress, srcIp, DHCP_SERVER_PORT, DHCP_CLIENT_PORT, resp);
}

function handleDhcpClient(w: World, device: Device, ingress: InterfaceId, msg: DhcpMessage): World {
  const itf = device.interfaces.find((i) => i.mac === msg.mac);
  if (!itf) return w; // pas pour nous
  if (msg.kind === 'offer' && msg.ip) {
    const cur = log(w, 'application', device.id, `reçoit l'offre DHCP ${msg.ip} → la confirme (Request)`, 'dhcp', { ip: msg.ip, seq: msg.xid });
    const req: DhcpMessage = { kind: 'request', xid: msg.xid, mac: msg.mac, ip: msg.ip };
    return sendDhcp(cur, device, ingress, '0.0.0.0', DHCP_CLIENT_PORT, DHCP_SERVER_PORT, req);
  }
  if (msg.kind === 'ack' && msg.ip) {
    const cfg = { ip: msg.ip, prefix: msg.prefix, gateway: msg.gateway, dns: msg.dns };
    let cur = configureInterface(w, device.id, itf.id, cfg);
    // On mémorise le bail pour le réappliquer si le document est resynchronisé.
    const rt = cur.runtime[device.id];
    cur = { ...cur, runtime: { ...cur.runtime, [device.id]: { ...rt, dhcpLease: { interfaceId: itf.id, ...cfg } } } };
    return log(cur, 'application', device.id, `a obtenu ${msg.ip}/${msg.prefix ?? '?'} par DHCP (bail accepté)`, 'dhcp', { ip: msg.ip, seq: msg.xid });
  }
  return w;
}

function leaseFor(w: World, device: Device, mac: Mac, cfg: DhcpConfig): Ip | null {
  const leases = w.runtime[device.id].dhcpLeases;
  const existing = leases.find((l) => l.mac === mac);
  if (existing) return existing.ip;
  const used = new Set(leases.map((l) => l.ip));
  const base = parseIp(cfg.poolStart);
  if (base === null) return null;
  for (let i = 0; i < cfg.poolSize; i++) {
    const ip = formatIp((base + i) >>> 0);
    if (!used.has(ip)) return ip;
  }
  return null;
}

function reserveLease(w: World, device: Device, mac: Mac, ip: Ip): World {
  const rt = w.runtime[device.id];
  if (rt.dhcpLeases.some((l) => l.mac === mac)) return w;
  return { ...w, runtime: { ...w.runtime, [device.id]: { ...rt, dhcpLeases: [...rt.dhcpLeases, { mac, ip }] } } };
}

/**
 * Réapplique les baux DHCP obtenus (runtime) dans world.topology. À appeler après
 * avoir resynchronisé la topologie du document (sinon l'IP dynamique est perdue
 * quand on modifie la config, ex. installer un logiciel).
 */
export function reapplyDhcpLeases(world: World): World {
  let w = world;
  for (const d of world.topology.devices) {
    const lease = world.runtime[d.id]?.dhcpLease;
    if (lease) w = configureInterface(w, d.id, lease.interfaceId, lease);
  }
  return w;
}

/** Applique une config IP à une interface, dans le world (effet de la simulation). */
function configureInterface(
  w: World,
  deviceId: string,
  interfaceId: InterfaceId,
  cfg: { ip?: Ip; prefix?: number; gateway?: Ip; dns?: Ip },
): World {
  const topology = {
    ...w.topology,
    devices: w.topology.devices.map((d) =>
      d.id !== deviceId
        ? d
        : {
            ...d,
            gateway: cfg.gateway ?? d.gateway,
            dns: cfg.dns ?? d.dns,
            interfaces: d.interfaces.map((i) =>
              i.id === interfaceId ? { ...i, ip: cfg.ip, prefix: cfg.prefix } : i,
            ),
          },
    ),
  };
  return { ...w, topology };
}

// ──────────────────────── Couche transport (TCP) ────────────────────────

function addConn(w: World, device: Device, conn: TcpConn): World {
  const rt = w.runtime[device.id];
  return { ...w, runtime: { ...w.runtime, [device.id]: { ...rt, tcpConns: [...rt.tcpConns, conn] } } };
}
function updateConn(w: World, device: Device, id: string, patch: Partial<TcpConn>): World {
  const rt = w.runtime[device.id];
  return {
    ...w,
    runtime: {
      ...w.runtime,
      [device.id]: { ...rt, tcpConns: rt.tcpConns.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
    },
  };
}
function removeConn(w: World, device: Device, id: string): World {
  const rt = w.runtime[device.id];
  return {
    ...w,
    runtime: { ...w.runtime, [device.id]: { ...rt, tcpConns: rt.tcpConns.filter((c) => c.id !== id) } },
  };
}

function isHttp(p: unknown): p is HttpMessage {
  return (
    !!p &&
    typeof p === 'object' &&
    ((p as HttpMessage).kind === 'request' || (p as HttpMessage).kind === 'response')
  );
}

function sendTcp(
  w: World,
  device: Device,
  dstIp: Ip,
  srcPort: number,
  dstPort: number,
  flags: TcpSegment['flags'],
  seq: number,
  ack: number,
  payload?: HttpMessage,
): World {
  const packet = ipv4(firstIp(device), dstIp, 'tcp', tcp(srcPort, dstPort, seq, ack, flags, payload));
  return routePacket(w, device, packet);
}

/** Le client ouvre une connexion TCP vers ip:80 et y enverra un GET une fois établie. */
function httpConnect(w: World, device: Device, ip: Ip, host: string, path: string, reqId: number): World {
  const localPort = 49152 + (reqId % 4096);
  const seq = 1000 + (reqId % 1000);
  const conn: TcpConn = {
    id: uid('tcp'),
    localPort,
    remoteIp: ip,
    remotePort: HTTP_PORT,
    state: 'syn-sent',
    role: 'client',
    seq,
    ack: 0,
    request: { path, host, reqId },
  };
  const cur = log(addConn(w, device, conn), 'transport', device.id, `ouvre une connexion TCP vers ${ip}:80 (envoi du SYN)`, 'tcp', { ip, seq: reqId });
  return sendTcp(cur, device, ip, localPort, HTTP_PORT, { syn: true }, seq, 0);
}

function receiveTcp(w: World, device: Device, packet: Ipv4Packet, seg: TcpSegment): World {
  const conn = w.runtime[device.id].tcpConns.find(
    (c) => c.localPort === seg.dstPort && c.remoteIp === packet.srcIp && c.remotePort === seg.srcPort,
  );

  // Nouveau SYN vers un serveur web en écoute (port 80).
  if (!conn) {
    if (seg.flags.syn && !seg.flags.ack && seg.dstPort === HTTP_PORT && hasApp(device, 'web-server')) {
      const sseq = 5000;
      const server: TcpConn = {
        id: uid('tcp'),
        localPort: HTTP_PORT,
        remoteIp: packet.srcIp,
        remotePort: seg.srcPort,
        state: 'syn-rcvd',
        role: 'server',
        seq: sseq,
        ack: seg.seq + 1,
      };
      const cur = log(addConn(w, device, server), 'transport', device.id, `reçoit le SYN → répond SYN-ACK (poignée de main)`, 'tcp');
      return sendTcp(cur, device, packet.srcIp, HTTP_PORT, seg.srcPort, { syn: true, ack: true }, sseq, seg.seq + 1);
    }
    return w; // segment hors connexion → ignoré
  }

  // Client : SYN-ACK reçu → ACK puis envoi du GET.
  if (conn.role === 'client' && conn.state === 'syn-sent' && seg.flags.syn && seg.flags.ack) {
    let cur = updateConn(w, device, conn.id, { state: 'established', ack: seg.seq + 1 });
    cur = log(cur, 'transport', device.id, `reçoit le SYN-ACK → renvoie ACK : connexion TCP établie`, 'tcp');
    cur = sendTcp(cur, device, conn.remoteIp, conn.localPort, conn.remotePort, { ack: true }, conn.seq + 1, seg.seq + 1);
    if (conn.request) {
      const req: HttpMessage = { kind: 'request', method: 'GET', host: conn.request.host, path: conn.request.path };
      cur = log(cur, 'application', device.id, `envoie la requête HTTP GET ${conn.request.path}`, 'http', { seq: conn.request.reqId });
      cur = sendTcp(cur, device, conn.remoteIp, conn.localPort, conn.remotePort, { ack: true }, conn.seq + 1, seg.seq + 1, req);
    }
    return cur;
  }

  // Serveur : ACK final du handshake → established.
  if (conn.role === 'server' && conn.state === 'syn-rcvd' && seg.flags.ack && !seg.payload && !seg.flags.syn && !seg.flags.fin) {
    return updateConn(w, device, conn.id, { state: 'established' });
  }

  // Serveur : requête HTTP reçue → renvoie la page.
  if (conn.role === 'server' && isHttp(seg.payload) && seg.payload.kind === 'request') {
    const req = seg.payload;
    const app = (device.apps ?? []).find((a) => a.kind === 'web-server');
    const body = app?.page && app.page.trim() !== '' ? app.page : DEFAULT_PAGE;
    let cur = updateConn(w, device, conn.id, { state: 'established' });
    cur = log(cur, 'application', device.id, `reçoit GET ${req.path} → renvoie la page web (200 OK)`, 'http');
    const resp: HttpMessage = { kind: 'response', status: 200, body };
    return sendTcp(cur, device, conn.remoteIp, HTTP_PORT, conn.remotePort, { ack: true }, conn.seq + 1, seg.seq + 1, resp);
  }

  // Client : réponse HTTP reçue → livre la page puis ferme (FIN).
  if (conn.role === 'client' && isHttp(seg.payload) && seg.payload.kind === 'response') {
    const resp = seg.payload;
    let cur = log(w, 'application', device.id, `a reçu la page web (${resp.body.length} octets, statut ${resp.status})`, 'http', {
      seq: conn.request?.reqId,
      ip: conn.remoteIp,
      body: resp.body,
    });
    cur = log(cur, 'transport', device.id, `ferme la connexion TCP (FIN)`, 'tcp');
    cur = sendTcp(cur, device, conn.remoteIp, conn.localPort, conn.remotePort, { fin: true, ack: true }, conn.seq + 1, seg.seq + 1);
    return removeConn(cur, device, conn.id);
  }

  // Serveur : FIN reçu → ACK et fermeture.
  if (conn.role === 'server' && seg.flags.fin) {
    const cur = log(w, 'transport', device.id, `reçoit le FIN → connexion TCP fermée`, 'tcp');
    const acked = sendTcp(cur, device, conn.remoteIp, HTTP_PORT, conn.remotePort, { ack: true }, conn.seq + 1, seg.seq + 1);
    return removeConn(acked, device, conn.id);
  }

  return w; // autre segment → ignoré
}

function flushPending(w: World, device: Device, ip: Ip): World {
  const rt = w.runtime[device.id];
  const ready = rt.pending.filter((p) => p.nextHopIp === ip);
  if (ready.length === 0) return w;
  const pending = rt.pending.filter((p) => p.nextHopIp !== ip);
  let cur: World = { ...w, runtime: { ...w.runtime, [device.id]: { ...rt, pending } } };
  for (const p of ready) {
    cur = sendIpVia(cur, device, p.egressIfId, p.nextHopIp, p.packet);
  }
  return cur;
}

/** Première IP configurée d'un appareil (pour fixer la source d'un paquet émis). */
function firstIp(device: Device): Ip {
  return device.interfaces.find((i) => i.ip)?.ip ?? '0.0.0.0';
}
