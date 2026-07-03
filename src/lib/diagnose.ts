// Diagnostic pédagogique d'un échec réseau — logique PURE et testable.
//
// Quand un ping / une résolution DNS / une requête HTTP / une demande DHCP
// n'aboutit pas, on explique le « pourquoi » le plus probable plutôt qu'un simple
// « délai dépassé ». On combine deux sources, de la plus fiable à la plus
// générale :
//   1. les abandons RÉELLEMENT observés dans le journal de la simulation — ils
//      disent QUEL appareil a bloqué (routeur sans route, ARP sans réponse, TTL…) ;
//   2. à défaut, une analyse statique de la configuration de la source, avec les
//      mêmes règles de routage que le moteur (resolveRoute).
// Renvoie 1 à 2 courtes lignes de conseil (jamais vide), sans emoji.

import type { Device, Ip, LogEntry, World } from '../domain/types';
import { isValidIp, networkAddress, sameSubnet } from './ip';
import { resolveRoute } from './stack/ip';
import { lookupArp } from './stack/arp';

export type FailureKind = 'ping' | 'lookup' | 'http' | 'dhcp';

export interface DiagnoseCtx {
  world: World;
  /** Machine qui a lancé la commande (source). */
  deviceId: string;
  kind: FailureKind;
  /** Cible saisie : IP ou nom (ignoré pour dhcp). */
  target: string;
  /** N'examiner le journal qu'à partir de cette date (début de la requête). */
  sinceTick: number;
}

/** Explique l'échec le plus probable d'une requête restée sans réponse. */
export function diagnoseFailure(ctx: DiagnoseCtx): string[] {
  const { world, deviceId, kind, target, sinceTick } = ctx;
  const source = world.topology.devices.find((d) => d.id === deviceId);
  if (!source) return ['Machine source introuvable.'];
  const recent = world.log.filter((e) => e.tick >= sinceTick);

  if (kind === 'dhcp') return diagnoseDhcp(recent, source);

  // Cible de type nom → la résolution DNS doit d'abord aboutir.
  const host = hostOf(target);
  if (!isValidIp(host)) {
    if (!source.dns) {
      return [
        `Aucun serveur DNS n'est configuré sur ${source.name}.`,
        `Renseignez l'adresse d'un serveur DNS dans sa configuration réseau.`,
      ];
    }
    const resolved = lastResolvedIp(recent);
    if (!resolved) {
      // Le DNS n'a jamais répondu → le serveur DNS lui-même est injoignable.
      return [`Le serveur DNS ${source.dns} ne répond pas.`, ...diagnoseIpReach(world, recent, source, source.dns, 'lookup')];
    }
    if (kind === 'lookup') {
      return [`Le nom « ${host} » a bien été résolu en ${resolved} ; la réponse est seulement arrivée trop tard.`];
    }
    // ping / http par nom : le nom est résolu, l'échec est au niveau IP.
    return diagnoseIpReach(world, recent, source, resolved, kind);
  }

  // La cible est une IP littérale.
  return diagnoseIpReach(world, recent, source, host, kind);
}

/** Cœur du diagnostic : pourquoi `dstIp` n'est-il pas joignable depuis `source` ? */
function diagnoseIpReach(world: World, recent: LogEntry[], source: Device, dstIp: Ip, kind: FailureKind): string[] {
  // (a) La source n'a aucune adresse IP.
  if (!source.interfaces.some((i) => i.ip)) {
    return [`${source.name} n'a pas d'adresse IP.`, `Configurez-la (outil « Réseau ») ou demandez-en une par DHCP.`];
  }

  // (b) Aucun appareil ne porte cette adresse dans le réseau simulé.
  const targetDev = deviceByIp(world, dstIp);
  if (!targetDev) {
    return [`Aucun appareil n'a l'adresse ${dstIp}.`, `Vérifiez l'adresse saisie et les adresses IP réellement configurées.`];
  }

  // (c) Un appareil du chemin a explicitement abandonné « injoignable » (souvent un routeur en aval).
  const drop = recent.find((e) => e.tag === 'drop' && e.ip === dstIp && /injoignable/.test(e.message));
  if (drop?.deviceId && drop.deviceId !== source.id) {
    return [
      `${nameOf(world, drop.deviceId)} n'a aucune route vers ${dstIp}.`,
      `Configurez sa table de routage ou sa passerelle par défaut.`,
    ];
  }

  // (c′) La CIBLE a jeté un paquet « injoignable » : la demande lui est bien
  // parvenue, mais sa RÉPONSE ne trouve pas le chemin du retour. Piège classique
  // (passerelle absente/fausse côté cible) : l'aller ne suffit pas.
  const backDrop = recent.find(
    (e) => e.tag === 'drop' && e.deviceId === targetDev.id && /injoignable/.test(e.message),
  );
  if (backDrop) {
    return (
      maskMismatch(source, targetDev, dstIp) ?? [
        `La demande ARRIVE à ${targetDev.name}, mais sa réponse ne trouve pas le chemin du retour${backDrop.ip ? ` vers ${backDrop.ip}` : ''}.`,
        targetDev.gateway
          ? `Vérifiez la passerelle de ${targetDev.name} (${targetDev.gateway}) et son masque.`
          : `${targetDev.name} n'a pas de passerelle par défaut : renseignez-la.`,
      ]
    );
  }

  // (d) TTL épuisé signalé : boucle de routage probable.
  if (recent.some((e) => e.tag === 'icmp' && /TTL expiré signalé/.test(e.message))) {
    return [`Le paquet a dépassé le nombre de sauts autorisé (TTL).`, `Il y a probablement une boucle de routage entre les routeurs.`];
  }

  // (e) Une requête ARP est restée sans réponse → on pointe l'adresse muette.
  const arp = unansweredArp(world, recent, source);
  if (arp) {
    if (arp.ip === dstIp) return targetSilent(world, arp.requester, targetDev, dstIp, kind);
    return [
      `Le prochain saut ${arp.ip} ne répond pas (requête ARP sans réponse).`,
      `Câble manquant vers lui, ou adresse de passerelle / route incorrecte.`,
    ];
  }

  // (f) Analyse statique du routage côté source.
  const decision = resolveRoute(source, dstIp, world.runtime[source.id]?.dynamicRoutes);
  if (!decision) return noRoute(world, source, dstIp);
  if (decision.nextHopIp === dstIp) return targetSilent(world, source, targetDev, dstIp, kind);
  if (kind === 'http') {
    return [
      `Le premier saut (${decision.nextHopIp}) est joignable, mais ${dstIp} ne répond pas en HTTP.`,
      `Vérifiez qu'un serveur web tourne sur ${targetDev.name} et la configuration des routeurs du chemin.`,
    ];
  }
  return [
    `Le premier saut (${decision.nextHopIp}) semble joignable, mais ${dstIp} ne répond pas.`,
    `Vérifiez la configuration des routeurs du chemin (routes, masques) et celle de ${targetDev.name}.`,
  ];
}

function diagnoseDhcp(recent: LogEntry[], source: Device): string[] {
  if (recent.some((e) => e.tag === 'drop' && /plage DHCP épuisée/.test(e.message))) {
    return [`Le serveur DHCP n'a plus d'adresses libres dans sa plage.`, `Élargissez la plage d'adresses ou libérez des baux.`];
  }
  return [
    `Aucune réponse DHCP.`,
    `Vérifiez qu'un routeur de ce réseau a le service DHCP activé et configuré (plage d'adresses), et que ${source.name} est bien câblé.`,
  ];
}

/**
 * Piège classique des masques incohérents : la cible reçoit la demande, mais son
 * masque (plus étroit) ne place pas l'émetteur dans son réseau → sa réponse n'a
 * aucun chemin de retour. `null` si les masques sont cohérents.
 */
function maskMismatch(requester: Device, targetDev: Device, dstIp: Ip): string[] | null {
  const egress = requester.interfaces.find((i) => i.ip !== undefined && i.prefix !== undefined && sameSubnet(dstIp, i.ip, i.prefix));
  const tItf = targetDev.interfaces.find((i) => i.ip === dstIp);
  if (egress?.ip !== undefined && egress.prefix !== undefined && tItf?.prefix !== undefined && !sameSubnet(egress.ip, dstIp, tItf.prefix)) {
    return [
      `${targetDev.name} (${dstIp}) reçoit peut-être la demande, mais son masque /${tItf.prefix} ne place pas ${egress.ip} dans son réseau : sa réponse n'a aucun chemin de retour.`,
      `Alignez le masque de ${targetDev.name} sur celui du réseau (/${egress.prefix}).`,
    ];
  }
  return null;
}

/** La livraison est directe (même réseau) mais la cible reste muette. */
function targetSilent(world: World, requester: Device, targetDev: Device, dstIp: Ip, kind: FailureKind): string[] {
  const mm = maskMismatch(requester, targetDev, dstIp);
  if (mm) return mm;
  const egress = requester.interfaces.find((i) => i.ip !== undefined && i.prefix !== undefined && sameSubnet(dstIp, i.ip, i.prefix));
  // L'ARP a-t-il abouti ? Si oui, la cible est joignable au niveau réseau : le
  // problème est plus haut (service absent), pas une trame ARP perdue.
  const arpResolved = lookupArp(world.runtime[requester.id]?.arpCache ?? [], dstIp) !== null;
  if (!arpResolved) {
    const net = egress?.ip !== undefined && egress.prefix !== undefined ? `${networkAddress(egress.ip, egress.prefix)}/${egress.prefix}` : 'ce réseau';
    return [
      `${dstIp} ne répond pas à la requête ARP.`,
      `Vérifiez que ${targetDev.name} est allumé, câblé au bon réseau, et possède une adresse IP dans ${net}.`,
    ];
  }
  if (kind === 'http') {
    return [
      `${targetDev.name} (${dstIp}) est joignable, mais ne répond pas en HTTP.`,
      `Vérifiez qu'un serveur web est bien installé et démarré sur ${targetDev.name}.`,
    ];
  }
  return [
    `${dstIp} est joignable (ARP résolu) mais ne répond pas.`,
    `Vérifiez que ${targetDev.name} est bien allumé et configuré.`,
  ];
}

function noRoute(world: World, source: Device, dstIp: Ip): string[] {
  const gw = source.gateway;
  if (!gw) {
    // Sans routeur sur le plan, parler de passerelle serait un faux indice : la
    // vraie question est « pourquoi ces machines ne sont-elles pas dans le même réseau ? ».
    const hasRouter = world.topology.devices.some((d) => d.kind === 'router');
    if (!hasRouter) {
      return [
        `${dstIp} n'est pas dans le réseau de ${source.name} — et il n'y a aucun routeur pour l'y mener.`,
        `Sans routeur, toutes les machines doivent partager le MÊME réseau : vérifiez adresses et masques.`,
      ];
    }
    return [
      `${dstIp} est dans un autre réseau et ${source.name} n'a pas de passerelle par défaut.`,
      `Renseignez la passerelle (l'adresse du routeur de votre réseau).`,
    ];
  }
  const gwReachable = source.interfaces.some((i) => i.ip !== undefined && i.prefix !== undefined && sameSubnet(gw, i.ip, i.prefix));
  if (!gwReachable) {
    return [
      `La passerelle ${gw} de ${source.name} n'est pas dans son réseau : elle est injoignable.`,
      `Corrigez l'adresse de la passerelle ou le masque de ${source.name}.`,
    ];
  }
  return [`${source.name} ne sait pas joindre ${dstIp} (aucune route).`, `Ajoutez une route appropriée ou vérifiez la passerelle.`];
}

// ───────────────────────────── Outils internes ──────────────────────────────

interface ArpMiss {
  requester: Device;
  ip: Ip;
}

/** Première requête ARP restée sans réponse (la MAC n'a jamais été apprise). On
 *  privilégie celle émise par la source elle-même (la plus actionnable). */
function unansweredArp(world: World, recent: LogEntry[], source: Device): ArpMiss | null {
  const misses: ArpMiss[] = [];
  for (const e of recent) {
    if (e.tag !== 'arp' || e.ip === undefined || e.deviceId === undefined || !/qui a/.test(e.message)) continue;
    const cache = world.runtime[e.deviceId]?.arpCache ?? [];
    if (lookupArp(cache, e.ip)) continue; // la MAC a fini par être apprise → l'ARP a abouti
    const requester = world.topology.devices.find((d) => d.id === e.deviceId);
    if (requester) misses.push({ requester, ip: e.ip });
  }
  if (misses.length === 0) return null;
  return misses.find((m) => m.requester.id === source.id) ?? misses[0];
}

function deviceByIp(world: World, ip: Ip): Device | undefined {
  return world.topology.devices.find((d) => d.interfaces.some((i) => i.ip === ip));
}

function nameOf(world: World, id: string): string {
  return world.topology.devices.find((d) => d.id === id)?.name ?? 'Un appareil';
}

/** Extrait l'hôte d'une cible (retire le schéma et le chemin d'une URL). */
function hostOf(target: string): string {
  const noScheme = target.replace(/^https?:\/\//i, '');
  const slash = noScheme.indexOf('/');
  return slash === -1 ? noScheme : noScheme.slice(0, slash);
}

/** Dernière IP obtenue par résolution DNS dans la fenêtre observée, ou null. */
function lastResolvedIp(recent: LogEntry[]): Ip | null {
  let ip: Ip | null = null;
  for (const e of recent) if (e.tag === 'dns' && e.ip && /a pour adresse/.test(e.message)) ip = e.ip;
  return ip;
}
