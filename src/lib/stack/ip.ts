// Décision de routage — fonction PURE. Détermine par où sortir et vers quel
// prochain saut envoyer un paquet destiné à `dstIp`, selon la config d'un appareil.
//
// Priorité (comme une vraie table de routage) :
//   1. réseau directement connecté (une interface est sur le même sous-réseau) ;
//   2. routes statiques, par préfixe le plus long (longest-prefix match) ;
//   3. passerelle par défaut de l'hôte.
// Renvoie null si rien ne correspond → destination injoignable.

import type { Device, InterfaceId, Ip, Route } from '../../domain/types';
import { isInSubnet, sameSubnet } from '../ip';

export interface RouteDecision {
  egressIfId: InterfaceId;
  /** IP du prochain saut (la destination elle-même si réseau direct). */
  nextHopIp: Ip;
}

/**
 * Décide par où router `dstIp`. Priorité : réseau directement connecté, puis routes
 * (statiques ET apprises par RIP/OSPF) au préfixe le plus long — les routes statiques
 * l'emportent à préfixe égal —, enfin passerelle par défaut. `dynamic` est vide pour
 * un routeur en mode statique → comportement inchangé.
 */
export function resolveRoute(device: Device, dstIp: Ip, dynamic: Route[] = []): RouteDecision | null {
  // 1. Directement connecté ?
  for (const itf of device.interfaces) {
    if (itf.ip && itf.prefix !== undefined && sameSubnet(dstIp, itf.ip, itf.prefix)) {
      return { egressIfId: itf.id, nextHopIp: dstIp };
    }
  }

  // 2. Routes statiques + apprises, préfixe le plus long d'abord (statique prioritaire à égalité).
  const tagged = [
    ...(device.routes ?? []).map((r) => ({ r, isStatic: true })),
    ...dynamic.map((r) => ({ r, isStatic: false })),
  ].sort((a, b) => b.r.prefix - a.r.prefix || Number(b.isStatic) - Number(a.isStatic));
  for (const { r } of tagged) {
    if (isInSubnet(dstIp, r.destination, r.prefix)) {
      return { egressIfId: r.interfaceId, nextHopIp: r.gateway ?? dstIp };
    }
  }

  // 3. Passerelle par défaut : sortir par l'interface qui la dessert.
  if (device.gateway) {
    for (const itf of device.interfaces) {
      if (itf.ip && itf.prefix !== undefined && sameSubnet(device.gateway, itf.ip, itf.prefix)) {
        return { egressIfId: itf.id, nextHopIp: device.gateway };
      }
    }
  }

  return null;
}
