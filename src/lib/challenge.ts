// Vérification d'un objectif de défi — fonction PURE : on rejoue la simulation
// sur la topologie courante de l'élève et on inspecte le résultat.

import type { Topology } from '../domain/types';
import type { Goal } from '../challenges';
import { autoConfigureDhcp, createWorld, run, startDnsLookup, startHttpGet, startPing } from './engine';
import { findDevice } from './topology';

export interface VerifyResult {
  ok: boolean;
  message: string;
}

export function verifyGoal(topology: Topology, goal: Goal): VerifyResult {
  // On laisse d'abord les hôtes configurés en DHCP s'auto-configurer (adresse,
  // passerelle, DNS) comme à l'entrée en simulation, puis on lance l'action visée.
  const base = run(autoConfigureDhcp(createWorld(topology)));

  switch (goal.kind) {
    case 'ping': {
      if (!findDevice(topology, goal.from)) return fail('Appareil de départ introuvable.');
      const w = run(startPing(base, goal.from, goal.to, 1, 1));
      const ok = w.log.some(
        (l) => l.tag === 'icmp' && l.deviceId === goal.from && /réponse au ping/.test(l.message),
      );
      return ok
        ? pass(`Ping vers ${goal.to} réussi.`)
        : fail(`Pas de réponse au ping vers ${goal.to}. Vérifiez câblage, adresses et passerelles.`);
    }
    case 'http': {
      const w = run(startHttpGet(base, goal.from, goal.url, 1));
      const ok = w.log.some((l) => l.tag === 'http' && l.deviceId === goal.from && l.body !== undefined);
      return ok
        ? pass(`Page ${goal.url} chargée.`)
        : fail(`Impossible de charger ${goal.url}. Vérifiez le DNS et le serveur web.`);
    }
    case 'dns': {
      const w = run(startDnsLookup(base, goal.from, goal.name, 1));
      const ok = w.log.some(
        (l) => l.tag === 'dns' && l.deviceId === goal.from && /a pour adresse/.test(l.message),
      );
      return ok ? pass(`« ${goal.name} » résolu.`) : fail(`« ${goal.name} » non résolu par le DNS.`);
    }
    case 'dhcp': {
      const dev = findDevice(base.topology, goal.device);
      const ip = dev?.interfaces.find((i) => i.ip)?.ip;
      return ip
        ? pass(`${dev?.name} a obtenu l'adresse ${ip} par DHCP.`)
        : fail('Aucune adresse obtenue. Le serveur DHCP a-t-il une plage configurée ?');
    }
  }
}

const pass = (message: string): VerifyResult => ({ ok: true, message });
const fail = (message: string): VerifyResult => ({ ok: false, message });
