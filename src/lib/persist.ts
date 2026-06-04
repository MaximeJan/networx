// (Dé)sérialisation de la topologie — fonctions PURES (string ↔ Topology).
//
// `deserialize` traite des données EXTERNES non fiables : il valide, normalise
// (MAC, IP, préfixe), filtre les types d'appareils inconnus, régénère les IDs
// manquants, puis rétablit les invariants via normalizeTopology. Renvoie `null`
// si l'entrée n'est pas exploitable.

import type {
  Annotation,
  AppConfig,
  AppKind,
  Device,
  DeviceKind,
  DhcpConfig,
  DnsRecord,
  Link,
  NatConfig,
  NetInterface,
  PortForward,
  Route,
  Topology,
} from '../domain/types';
import { isValidIp } from './ip';
import { normalizeMac } from './mac';
import { uid } from './id';
import { normalizeTopology } from './topology';
import { APP_KINDS } from './constants';

export const FORMAT_VERSION = 1;

const KNOWN_KINDS: ReadonlySet<string> = new Set<DeviceKind>(['pc', 'switch', 'router']);

export function serialize(topo: Topology): string {
  return JSON.stringify({ version: FORMAT_VERSION, topology: topo });
}

export function deserialize(raw: string): Topology | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  // Tolère { version, topology } ou directement une topologie nue.
  const record = obj as Record<string, unknown>;
  const t = (record.topology ?? record) as Record<string, unknown>;
  if (!t || typeof t !== 'object') return null;
  if (!Array.isArray(t.devices) || !Array.isArray(t.links)) return null;

  const devices = (t.devices as unknown[])
    .map(sanitizeDevice)
    .filter((d): d is Device => d !== null);
  const links = (t.links as unknown[]).map(sanitizeLink).filter((l): l is Link => l !== null);
  const name = typeof t.name === 'string' ? t.name : 'Réseau';
  const annotations = sanitizeAnnotations(t.annotations);

  const base: Topology = { name, devices, links };
  return normalizeTopology(annotations.length ? { ...base, annotations } : base);
}

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
function sanitizeColor(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_COLOR.test(v) ? v : fallback;
}

function sanitizeAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const r = a as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : uid('ann');
    if (r.kind === 'text' && typeof r.text === 'string') {
      out.push({
        id,
        kind: 'text',
        x: asNumber(r.x, 0),
        y: asNumber(r.y, 0),
        text: r.text,
        color: sanitizeColor(r.color, '#1e293b'),
        fontSize: asNumber(r.fontSize, 16),
      });
    } else if (r.kind === 'zone') {
      out.push({
        id,
        kind: 'zone',
        x: asNumber(r.x, 0),
        y: asNumber(r.y, 0),
        w: Math.max(1, asNumber(r.w, 120)),
        h: Math.max(1, asNumber(r.h, 80)),
        color: sanitizeColor(r.color, '#0ea5e9'),
        ...(typeof r.label === 'string' && r.label !== '' ? { label: r.label } : {}),
      });
    }
  }
  return out;
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sanitizeDevice(raw: unknown): Device | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.kind !== 'string' || !KNOWN_KINDS.has(d.kind)) return null;
  const interfaces = Array.isArray(d.interfaces)
    ? (d.interfaces as unknown[]).map(sanitizeInterface).filter((i): i is NetInterface => i !== null)
    : [];

  const device: Device = {
    id: typeof d.id === 'string' ? d.id : uid('dev'),
    kind: d.kind as DeviceKind,
    name: typeof d.name === 'string' ? d.name : 'Appareil',
    x: asNumber(d.x, 0),
    y: asNumber(d.y, 0),
    interfaces,
  };
  if (typeof d.gateway === 'string' && isValidIp(d.gateway)) device.gateway = d.gateway;
  if (typeof d.dns === 'string' && isValidIp(d.dns)) device.dns = d.dns;
  if (Array.isArray(d.routes)) {
    const routes = (d.routes as unknown[])
      .map((r) => sanitizeRoute(r, interfaces))
      .filter((r): r is Route => r !== null);
    if (routes.length > 0) device.routes = routes;
  }
  if (d.routing === 'rip' || d.routing === 'ospf') device.routing = d.routing;
  if (d.dhcp && typeof d.dhcp === 'object') {
    const cfg = sanitizeDhcp(d.dhcp as Record<string, unknown>);
    if (cfg) device.dhcp = cfg;
  }
  // NAT : objet de config, ou ancien format booléen (NAT activé sans interface désignée).
  if (d.nat === true) device.nat = {};
  else if (d.nat && typeof d.nat === 'object') {
    device.nat = sanitizeNat(d.nat as Record<string, unknown>, interfaces);
  }
  if (Array.isArray(d.apps)) {
    const apps = sanitizeApps(d.apps);
    if (apps.length > 0) device.apps = apps;
  }
  return device;
}

const KNOWN_APPS: ReadonlySet<string> = new Set<AppKind>(APP_KINDS);

function sanitizeApps(raw: unknown[]): AppConfig[] {
  const seen = new Set<string>();
  const apps: AppConfig[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const rec = a as Record<string, unknown>;
    const kind = rec.kind;
    if (typeof kind === 'string' && KNOWN_APPS.has(kind) && !seen.has(kind)) {
      seen.add(kind);
      const app: AppConfig = { kind: kind as AppKind };
      // Conserve la config spécifique : enregistrements DNS, page web.
      if (kind === 'dns-server') {
        if (Array.isArray(rec.records)) app.records = sanitizeRecords(rec.records);
        if (rec.recursive === true) app.recursive = true;
      }
      if (kind === 'web-server' && typeof rec.page === 'string') {
        app.page = rec.page;
      }
      apps.push(app);
    }
  }
  return apps;
}

function sanitizeRoute(raw: unknown, interfaces: NetInterface[]): Route | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.destination !== 'string' || !isValidIp(r.destination)) return null;
  if (typeof r.prefix !== 'number' || !Number.isInteger(r.prefix) || r.prefix < 0 || r.prefix > 32) return null;
  if (typeof r.interfaceId !== 'string' || !interfaces.some((i) => i.id === r.interfaceId)) return null;
  const route: Route = { destination: r.destination, prefix: r.prefix, interfaceId: r.interfaceId };
  if (typeof r.gateway === 'string' && isValidIp(r.gateway)) route.gateway = r.gateway;
  return route;
}

function sanitizeNat(d: Record<string, unknown>, interfaces: NetInterface[]): NatConfig {
  const cfg: NatConfig = {};
  // L'interface WAN doit exister sur l'appareil.
  if (typeof d.wanInterfaceId === 'string' && interfaces.some((i) => i.id === d.wanInterfaceId)) {
    cfg.wanInterfaceId = d.wanInterfaceId;
  }
  if (Array.isArray(d.portForwards)) {
    const forwards = (d.portForwards as unknown[])
      .map(sanitizePortForward)
      .filter((f): f is PortForward => f !== null);
    if (forwards.length > 0) cfg.portForwards = forwards;
  }
  return cfg;
}

function isPort(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 65535;
}

function sanitizePortForward(raw: unknown): PortForward | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.proto !== 'tcp' && r.proto !== 'udp') return null;
  if (!isPort(r.publicPort) || !isPort(r.privatePort)) return null;
  if (typeof r.privateIp !== 'string' || !isValidIp(r.privateIp)) return null;
  return { proto: r.proto, publicPort: r.publicPort, privateIp: r.privateIp, privatePort: r.privatePort };
}

function sanitizeDhcp(d: Record<string, unknown>): DhcpConfig | null {
  if (typeof d.poolStart !== 'string' || !isValidIp(d.poolStart)) return null;
  if (typeof d.poolSize !== 'number' || typeof d.prefix !== 'number') return null;
  const cfg: DhcpConfig = { poolStart: d.poolStart, poolSize: d.poolSize, prefix: d.prefix };
  if (typeof d.gateway === 'string' && isValidIp(d.gateway)) cfg.gateway = d.gateway;
  if (typeof d.dns === 'string' && isValidIp(d.dns)) cfg.dns = d.dns;
  return cfg;
}

const REC_TYPES: ReadonlySet<string> = new Set(['A', 'CNAME', 'NS']);

function sanitizeRecords(raw: unknown[]): DnsRecord[] {
  const records: DnsRecord[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    // Rétro-compatibilité : ancien format { name, ip } → enregistrement A.
    if (typeof rec.name === 'string' && typeof rec.ip === 'string' && isValidIp(rec.ip)) {
      records.push({ type: 'A', name: rec.name, value: rec.ip });
      continue;
    }
    if (typeof rec.type !== 'string' || !REC_TYPES.has(rec.type)) continue;
    if (typeof rec.name !== 'string' || typeof rec.value !== 'string') continue;
    // A et NS portent une IP ; CNAME un nom.
    if ((rec.type === 'A' || rec.type === 'NS') && !isValidIp(rec.value)) continue;
    records.push({ type: rec.type as DnsRecord['type'], name: rec.name, value: rec.value });
  }
  return records;
}

function sanitizeInterface(raw: unknown): NetInterface | null {
  if (!raw || typeof raw !== 'object') return null;
  const i = raw as Record<string, unknown>;
  const mac = typeof i.mac === 'string' ? normalizeMac(i.mac) : null;
  const itf: NetInterface = {
    id: typeof i.id === 'string' ? i.id : uid('if'),
    name: typeof i.name === 'string' ? i.name : 'eth0',
    mac: mac ?? '00:00:00:00:00:00',
  };
  if (typeof i.ip === 'string' && isValidIp(i.ip)) itf.ip = i.ip;
  if (typeof i.prefix === 'number' && Number.isInteger(i.prefix) && i.prefix >= 0 && i.prefix <= 32)
    itf.prefix = i.prefix;
  // linkId est recalculé par normalizeTopology → on l'ignore ici.
  return itf;
}

function sanitizeLink(raw: unknown): Link | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  const a = sanitizeEndpoint(l.a);
  const b = sanitizeEndpoint(l.b);
  if (!a || !b) return null;
  const link: Link = { id: typeof l.id === 'string' ? l.id : uid('link'), a, b };
  if (typeof l.bandwidth === 'number' && Number.isFinite(l.bandwidth) && l.bandwidth > 0) {
    link.bandwidth = l.bandwidth;
  }
  return link;
}

function sanitizeEndpoint(raw: unknown): { deviceId: string; interfaceId: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.deviceId !== 'string' || typeof e.interfaceId !== 'string') return null;
  return { deviceId: e.deviceId, interfaceId: e.interfaceId };
}
