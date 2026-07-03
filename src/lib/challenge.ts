// Vérification d'un défi — fonction PURE : on rejoue la simulation sur la
// topologie de l'élève et on évalue chaque objectif (Check) séparément, pour
// afficher une CHECKLIST (réussi/raté) plutôt qu'un verdict tout-ou-rien.
//
// Les appareils sont désignés par leur NOM (insensible à la casse) : l'élève
// peut construire lui-même ses machines et choisir son plan d'adressage — le
// contrôle « ping de PC1 vers PC2 » lit l'adresse RÉELLE de PC2 au moment de
// la vérification. En cas d'échec, le détail vient du diagnostic pédagogique
// (lib/diagnose) : la checklist explique POURQUOI, pas seulement « raté ».

import type { Device, Ip, Topology, World } from '../domain/types';
import type { Check, Goal } from '../challenges';
import { autoConfigureDhcp, createWorld, run, startDnsLookup, startHttpGet, startPing } from './engine';
import { diagnoseFailure, type FailureKind } from './diagnose';
import { getDeviceDef } from '../devices/registry';

/** Résultat d'un contrôle individuel (une ligne de la checklist). */
export interface CheckResult {
  label: string;
  ok: boolean;
  /** Explication de l'échec (diagnostic), absente si réussi. */
  detail?: string;
}

export interface VerifyResult {
  ok: boolean;
  message: string;
  results: CheckResult[];
}

const norm = (s: string) => s.trim().toLowerCase();

function deviceByName(topo: Topology, name: string): Device | undefined {
  return topo.devices.find((d) => norm(d.name) === norm(name));
}

function firstIpOf(d: Device): Ip | undefined {
  return d.interfaces.find((i) => i.ip)?.ip;
}

/** Monde de départ d'un contrôle : simulation fraîche + auto-configuration DHCP. */
function freshWorld(topology: Topology): World {
  return run(autoConfigureDhcp(createWorld(topology)));
}

const missingDevice = (name: string) =>
  `Aucun appareil ne s'appelle « ${name} ». Vérifiez le nom exact (ou renommez la machine).`;

export function verifyChallenge(topology: Topology, goal: Goal): VerifyResult {
  const results = goal.checks.map((c) => runCheck(topology, c));
  const ok = results.every((r) => r.ok);
  const n = results.filter((r) => r.ok).length;
  const message = ok
    ? 'Défi réussi : tous les objectifs sont atteints.'
    : `${n} objectif${n > 1 ? 's' : ''} sur ${results.length} atteint${n > 1 ? 's' : ''} — voyez le détail ci-dessus.`;
  return { ok, message, results };
}

function runCheck(topology: Topology, check: Check): CheckResult {
  const pass = (): CheckResult => ({ label: check.label, ok: true });
  const fail = (detail: string): CheckResult => ({ label: check.label, ok: false, detail });

  switch (check.kind) {
    case 'device-count': {
      const count = topology.devices.filter((d) => d.kind === check.device).length;
      if (count >= check.min) return pass();
      const label = getDeviceDef(check.device).label;
      return fail(`Pour l'instant : ${count} sur ${check.min} attendu${check.min > 1 ? 's' : ''}. Glissez « ${label} » depuis la palette.`);
    }

    case 'cabled': {
      const dev = deviceByName(topology, check.device);
      if (!dev) return fail(missingDevice(check.device));
      return dev.interfaces.some((i) => i.linkId) ? pass() : fail(`${dev.name} n'est relié à rien : tirez un câble depuis son port.`);
    }

    case 'ping': {
      const base = freshWorld(topology);
      const from = deviceByName(base.topology, check.from);
      if (!from) return fail(missingDevice(check.from));
      // Cible : un nom d'appareil (→ son IP réelle), une IP littérale, sinon un nom DNS.
      const toDev = deviceByName(base.topology, check.to);
      let target = check.to;
      if (toDev) {
        const ip = firstIpOf(toDev);
        if (!ip) return fail(`${toDev.name} n'a pas d'adresse IP : impossible de le pinguer.`);
        target = ip;
      }
      const w = run(startPing(base, from.id, target, 1, 1));
      const ok = w.log.some((l) => l.tag === 'icmp' && l.deviceId === from.id && /réponse au ping/.test(l.message));
      return ok ? pass() : fail(diagnose(w, from.id, 'ping', target));
    }

    case 'http': {
      const base = freshWorld(topology);
      const from = deviceByName(base.topology, check.from);
      if (!from) return fail(missingDevice(check.from));
      // Les jetons @NOM de l'URL sont remplacés par l'adresse réelle de l'appareil.
      let bad: string | null = null;
      const url = check.url.replace(/@([\w-]+)/g, (_, name: string) => {
        const dev = deviceByName(base.topology, name);
        const ip = dev ? firstIpOf(dev) : undefined;
        if (!ip) bad = dev ? `${dev.name} n'a pas d'adresse IP.` : missingDevice(name);
        return ip ?? name;
      });
      if (bad) return fail(bad);
      const w = run(startHttpGet(base, from.id, url, 1));
      const ok = w.log.some((l) => l.tag === 'http' && l.deviceId === from.id && l.body !== undefined);
      return ok ? pass() : fail(diagnose(w, from.id, 'http', url));
    }

    case 'dns': {
      const base = freshWorld(topology);
      const from = deviceByName(base.topology, check.from);
      if (!from) return fail(missingDevice(check.from));
      const w = run(startDnsLookup(base, from.id, check.name, 1));
      const ok = w.log.some((l) => l.tag === 'dns' && l.deviceId === from.id && /a pour adresse/.test(l.message));
      return ok ? pass() : fail(diagnose(w, from.id, 'lookup', check.name));
    }

    case 'dhcp': {
      const base = freshWorld(topology);
      const dev = deviceByName(base.topology, check.client);
      if (!dev) return fail(missingDevice(check.client));
      if (firstIpOf(dev)) return pass();
      return fail(diagnose(base, dev.id, 'dhcp', 'DHCP'));
    }
  }
}

/** Détail d'échec : le diagnostic pédagogique, en une ligne. */
function diagnose(world: World, deviceId: string, kind: FailureKind, target: string): string {
  return diagnoseFailure({ world, deviceId, kind, target, sinceTick: 0 }).join(' ');
}
