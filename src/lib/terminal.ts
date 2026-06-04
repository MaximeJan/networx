// Terminal — analyse et exécution des commandes, en logique PURE et testable.
//
// Les commandes synchrones (help, ipconfig, arp, clear) renvoient directement
// leur résultat. `ping` est asynchrone : runCommand renvoie l'intention
// { kind: 'ping', ip } et c'est le composant Terminal qui déclenche le moteur et
// affiche les réponses au fil de l'eau.

import type { Device, Route, World } from '../domain/types';
import { isValidIp, networkAddress, prefixToMask } from './ip';

export interface TerminalCtx {
  device: Device;
  world: World;
}

export type CommandResult =
  | { kind: 'output'; lines: string[] }
  | { kind: 'clear' }
  | { kind: 'ping'; target: string }
  | { kind: 'lookup'; name: string }
  | { kind: 'traceroute'; target: string }
  | { kind: 'dhcp' }
  | { kind: 'error'; lines: string[] };

const HELP = [
  'Commandes disponibles :',
  '  ping <ip|nom>      teste la connexion (résout le nom par DNS si besoin)',
  '  traceroute <ip>    affiche les routeurs traversés jusqu’à la destination',
  '  nslookup <nom>     résout un nom de domaine en adresse IP',
  '  dhcp               demande une adresse IP automatique (DHCP)',
  '  ipconfig           affiche la configuration réseau de la machine',
  '  route              affiche la table de routage',
  '  arp                affiche le cache ARP (IP ↔ MAC connues)',
  '  clear              efface l’écran',
  '  help               affiche cette aide',
];

export function runCommand(line: string, ctx: TerminalCtx): CommandResult {
  const trimmed = line.trim();
  if (trimmed === '') return { kind: 'output', lines: [] };
  const [cmd, ...args] = trimmed.split(/\s+/);
  switch (cmd.toLowerCase()) {
    case 'help':
      return { kind: 'output', lines: HELP };
    case 'clear':
      return { kind: 'clear' };
    case 'ipconfig':
    case 'ifconfig':
      return { kind: 'output', lines: ipconfigLines(ctx.device) };
    case 'arp':
      return { kind: 'output', lines: arpLines(ctx) };
    case 'route':
      return { kind: 'output', lines: routeLines(ctx.device, ctx.world.runtime[ctx.device.id]?.dynamicRoutes ?? []) };
    case 'traceroute':
    case 'tracert': {
      const target = args[0];
      if (!target) return { kind: 'error', lines: ['Usage : traceroute <adresse IP>'] };
      if (!isValidIp(target)) return { kind: 'error', lines: [`Adresse IP invalide : ${target}`] };
      return { kind: 'traceroute', target };
    }
    case 'ping': {
      const target = args[0];
      if (!target) return { kind: 'error', lines: ['Usage : ping <adresse IP | nom>'] };
      return { kind: 'ping', target };
    }
    case 'nslookup': {
      const name = args[0];
      if (!name) return { kind: 'error', lines: ['Usage : nslookup <nom>'] };
      return { kind: 'lookup', name };
    }
    case 'dhcp':
      return { kind: 'dhcp' };
    default:
      return { kind: 'error', lines: [`Commande inconnue : ${cmd} (tapez « help »).`] };
  }
}

function ipconfigLines(device: Device): string[] {
  const lines = [`Configuration réseau de ${device.name} :`];
  for (const itf of device.interfaces) {
    lines.push(`  ${itf.name}`);
    lines.push(`    MAC    : ${itf.mac}`);
    if (itf.ip) {
      lines.push(`    IPv4   : ${itf.ip}`);
      if (itf.prefix !== undefined) lines.push(`    Masque : ${prefixToMask(itf.prefix)}`);
    } else {
      lines.push('    (aucune adresse IP)');
    }
  }
  if (device.gateway) lines.push(`  Passerelle par défaut : ${device.gateway}`);
  return lines;
}

function routeLines(device: Device, dynamic: Route[]): string[] {
  const lines = [`Table de routage de ${device.name} :`];
  for (const itf of device.interfaces) {
    if (itf.ip && itf.prefix !== undefined) {
      lines.push(`  ${networkAddress(itf.ip, itf.prefix)}/${itf.prefix} → directement connecté (${itf.name})`);
    }
  }
  for (const r of device.routes ?? []) {
    lines.push(`  ${r.destination}/${r.prefix} → ${r.gateway ?? 'direct'} (statique)`);
  }
  const protoLabel = device.routing === 'ospf' ? 'OSPF' : device.routing === 'rip' ? 'RIP' : 'apprise';
  for (const r of dynamic) {
    lines.push(`  ${r.destination}/${r.prefix} → ${r.gateway ?? 'direct'} (${protoLabel})`);
  }
  if (device.gateway) lines.push(`  0.0.0.0/0 → ${device.gateway} (passerelle par défaut)`);
  if (lines.length === 1) lines.push('  (vide)');
  return lines;
}

function arpLines(ctx: TerminalCtx): string[] {
  const cache = ctx.world.runtime[ctx.device.id]?.arpCache ?? [];
  if (cache.length === 0) return ['Cache ARP vide.'];
  return [
    'Adresse IP         Adresse MAC',
    ...cache.map((e) => `${e.ip.padEnd(18)} ${e.mac}`),
  ];
}
