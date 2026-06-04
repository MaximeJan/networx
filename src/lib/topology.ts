// Mutations PURES de la topologie (le document). Aucune ne mute en place : elles
// renvoient une NOUVELLE topologie. Garder ces fonctions ici (et non dans
// l'orchestrateur) les rend testables et maintient les handlers minces.
//
// Invariant maintenu par `normalizeTopology` : chaque `interface.linkId` reflète
// exactement les liens présents, et aucun lien ne pend dans le vide.

import type {
  Annotation,
  AppKind,
  Device,
  DeviceId,
  DhcpConfig,
  DnsRecord,
  Endpoint,
  Ip,
  InterfaceId,
  Link,
  LinkId,
  NatConfig,
  NetInterface,
  Route,
  RoutingMode,
  Topology,
} from '../domain/types';
import { uid } from './id';
import { randomMac } from './mac';

export function emptyTopology(name = 'Réseau'): Topology {
  return { name, devices: [], links: [] };
}

export function findDevice(topo: Topology, id: DeviceId): Device | null {
  return topo.devices.find((d) => d.id === id) ?? null;
}

export function findInterface(
  topo: Topology,
  deviceId: DeviceId,
  interfaceId: InterfaceId,
): NetInterface | null {
  const dev = findDevice(topo, deviceId);
  return dev?.interfaces.find((i) => i.id === interfaceId) ?? null;
}

function endpointEq(a: Endpoint, b: Endpoint): boolean {
  return a.deviceId === b.deviceId && a.interfaceId === b.interfaceId;
}

const portKey = (ep: Endpoint): string => `${ep.deviceId}/${ep.interfaceId}`;

/** Vrai si un câble occupe déjà ce port. */
export function isPortBusy(topo: Topology, ep: Endpoint): boolean {
  return topo.links.some((l) => endpointEq(l.a, ep) || endpointEq(l.b, ep));
}

/** Vrai si l'on peut relier ces deux ports (existants, libres, distincts). */
export function canConnect(topo: Topology, a: Endpoint, b: Endpoint): boolean {
  if (a.deviceId === b.deviceId) return false;
  if (endpointEq(a, b)) return false;
  if (!findInterface(topo, a.deviceId, a.interfaceId)) return false;
  if (!findInterface(topo, b.deviceId, b.interfaceId)) return false;
  return !isPortBusy(topo, a) && !isPortBusy(topo, b);
}

/** Première interface libre d'un appareil (pour le câblage device→device). */
export function firstFreeInterface(topo: Topology, deviceId: DeviceId): InterfaceId | null {
  const dev = findDevice(topo, deviceId);
  if (!dev) return null;
  const free = dev.interfaces.find((i) => !isPortBusy(topo, { deviceId, interfaceId: i.id }));
  return free?.id ?? null;
}

export function addDevice(topo: Topology, device: Device): Topology {
  return { ...topo, devices: [...topo.devices, device] };
}

export function moveDevice(topo: Topology, id: DeviceId, x: number, y: number): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => (d.id === id ? { ...d, x, y } : d)),
  };
}

export function removeDevice(topo: Topology, id: DeviceId): Topology {
  return removeDevices(topo, [id]);
}

/** Supprime plusieurs appareils d'un coup (et les liens qui les touchent). */
export function removeDevices(topo: Topology, ids: DeviceId[]): Topology {
  const set = new Set(ids);
  const devices = topo.devices.filter((d) => !set.has(d.id));
  const links = topo.links.filter((l) => !set.has(l.a.deviceId) && !set.has(l.b.deviceId));
  return normalizeTopology({ ...topo, devices, links });
}

/** Place plusieurs appareils à des positions absolues (déplacement de groupe). */
export function moveDevicesTo(topo: Topology, positions: { id: DeviceId; x: number; y: number }[]): Topology {
  const by = new Map(positions.map((p) => [p.id, p]));
  return {
    ...topo,
    devices: topo.devices.map((d) => {
      const p = by.get(d.id);
      return p ? { ...d, x: p.x, y: p.y } : d;
    }),
  };
}

/** Place plusieurs annotations à des positions absolues (déplacement de groupe). */
export function moveAnnotationsTo(topo: Topology, positions: { id: string; x: number; y: number }[]): Topology {
  if (!topo.annotations || positions.length === 0) return topo;
  const by = new Map(positions.map((p) => [p.id, p]));
  return {
    ...topo,
    annotations: topo.annotations.map((a) => {
      const p = by.get(a.id);
      return p ? { ...a, x: p.x, y: p.y } : a;
    }),
  };
}

/**
 * Duplique un ensemble d'appareils ET d'annotations (copier/coller) : nouveaux ids
 * et MAC, position décalée, et les liens INTERNES au groupe d'appareils sont recopiés
 * et remappés. Renvoie la nouvelle topologie et les ids créés (pour les sélectionner).
 */
export function pasteDevices(
  topo: Topology,
  clip: { devices: Device[]; links: Link[]; annotations?: Annotation[] },
  dx: number,
  dy: number,
  rng: () => number = Math.random,
): { topo: Topology; newIds: DeviceId[]; newAnnotationIds: string[] } {
  const idMap = new Map<DeviceId, DeviceId>();
  const ifMap = new Map<string, InterfaceId>(); // `${oldDevId}/${oldIfId}` → newIfId

  const newDevices = clip.devices.map((d) => {
    const nid = uid('dev');
    idMap.set(d.id, nid);
    const interfaces = d.interfaces.map((itf) => {
      const nifid = uid('if');
      ifMap.set(`${d.id}/${itf.id}`, nifid);
      return { ...itf, id: nifid, mac: randomMac(rng), linkId: undefined };
    });
    return { ...d, id: nid, x: d.x + dx, y: d.y + dy, interfaces };
  });

  const newLinks = clip.links
    .filter((l) => idMap.has(l.a.deviceId) && idMap.has(l.b.deviceId))
    .map((l) => ({
      id: uid('link'),
      a: { deviceId: idMap.get(l.a.deviceId)!, interfaceId: ifMap.get(`${l.a.deviceId}/${l.a.interfaceId}`)! },
      b: { deviceId: idMap.get(l.b.deviceId)!, interfaceId: ifMap.get(`${l.b.deviceId}/${l.b.interfaceId}`)! },
    }));

  const newAnnotations: Annotation[] = (clip.annotations ?? []).map((a) => ({
    ...a,
    id: uid('ann'),
    x: a.x + dx,
    y: a.y + dy,
  }));

  const next = normalizeTopology({
    ...topo,
    devices: [...topo.devices, ...newDevices],
    links: [...topo.links, ...newLinks],
    annotations: [...(topo.annotations ?? []), ...newAnnotations],
  });
  return { topo: next, newIds: [...idMap.values()], newAnnotationIds: newAnnotations.map((a) => a.id) };
}

// ── Annotations (décorations du plan) ──

export function addAnnotation(topo: Topology, ann: Annotation): Topology {
  return { ...topo, annotations: [...(topo.annotations ?? []), ann] };
}

type AnnotationPatch = Partial<{
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize: number;
  label: string;
}>;

export function updateAnnotation(topo: Topology, id: string, patch: AnnotationPatch): Topology {
  return {
    ...topo,
    annotations: (topo.annotations ?? []).map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
  };
}

export function removeAnnotation(topo: Topology, id: string): Topology {
  return { ...topo, annotations: (topo.annotations ?? []).filter((a) => a.id !== id) };
}

export function addLink(topo: Topology, a: Endpoint, b: Endpoint): Topology | null {
  if (!canConnect(topo, a, b)) return null;
  const link: Link = { id: uid('link'), a, b };
  return normalizeTopology({ ...topo, links: [...topo.links, link] });
}

export function removeLink(topo: Topology, linkId: string): Topology {
  return normalizeTopology({ ...topo, links: topo.links.filter((l) => l.id !== linkId) });
}

/** Met à jour la config d'une interface (ip, prefix, name). linkId reste géré par normalize. */
export function updateInterface(
  topo: Topology,
  deviceId: DeviceId,
  interfaceId: InterfaceId,
  patch: Partial<Pick<NetInterface, 'ip' | 'prefix' | 'name'>>,
): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) =>
      d.id !== deviceId
        ? d
        : {
            ...d,
            interfaces: d.interfaces.map((i) =>
              i.id === interfaceId ? { ...i, ...patch } : i,
            ),
          },
    ),
  };
}

/** Installe un logiciel sur un hôte (sans doublon). */
export function installApp(topo: Topology, id: DeviceId, kind: AppKind): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => {
      if (d.id !== id) return d;
      const apps = d.apps ?? [];
      if (apps.some((a) => a.kind === kind)) return d;
      return { ...d, apps: [...apps, { kind }] };
    }),
  };
}

/** Désinstalle un logiciel d'un hôte. */
export function uninstallApp(topo: Topology, id: DeviceId, kind: AppKind): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) =>
      d.id === id ? { ...d, apps: (d.apps ?? []).filter((a) => a.kind !== kind) } : d,
    ),
  };
}

/** Remplace les enregistrements DNS d'un serveur (app dns-server). */
export function setDnsRecords(topo: Topology, id: DeviceId, records: DnsRecord[]): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) =>
      d.id === id
        ? {
            ...d,
            apps: (d.apps ?? []).map((a) => (a.kind === 'dns-server' ? { ...a, records } : a)),
          }
        : d,
    ),
  };
}

/** Active/désactive la résolution récursive du serveur DNS d'un hôte. */
export function setDnsRecursive(topo: Topology, id: DeviceId, recursive: boolean): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) =>
      d.id === id
        ? { ...d, apps: (d.apps ?? []).map((a) => (a.kind === 'dns-server' ? { ...a, recursive } : a)) }
        : d,
    ),
  };
}

/** Définit le mode de routage d'un routeur (`static` ⇒ retire le champ). */
export function setDeviceRouting(topo: Topology, id: DeviceId, routing: RoutingMode): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => {
      if (d.id !== id) return d;
      if (routing !== 'static') return { ...d, routing };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { routing: _routing, ...rest } = d;
      return rest;
    }),
  };
}

/** Définit le débit d'un câble en Mbit/s (`undefined` ⇒ retire le champ → défaut). */
export function setLinkBandwidth(topo: Topology, linkId: LinkId, bandwidth: number | undefined): Topology {
  return {
    ...topo,
    links: topo.links.map((l) => {
      if (l.id !== linkId) return l;
      if (bandwidth !== undefined) return { ...l, bandwidth };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { bandwidth: _bw, ...rest } = l;
      return rest;
    }),
  };
}

/** Remplace la table de routage statique d'un appareil (tableau vide ⇒ aucune route). */
export function setDeviceRoutes(topo: Topology, id: DeviceId, routes: Route[]): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => {
      if (d.id !== id) return d;
      if (routes.length > 0) return { ...d, routes };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { routes: _routes, ...rest } = d;
      return rest;
    }),
  };
}

/** Configure le NAT d'un routeur (`undefined` = NAT désactivé). */
export function setDeviceNat(topo: Topology, id: DeviceId, nat: NatConfig | undefined): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => {
      if (d.id !== id) return d;
      if (nat) return { ...d, nat };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { nat: _nat, ...rest } = d;
      return rest;
    }),
  };
}

/** Définit la page servie par le serveur web d'un hôte (app web-server). */
export function setWebPage(topo: Topology, id: DeviceId, page: string): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) =>
      d.id === id
        ? { ...d, apps: (d.apps ?? []).map((a) => (a.kind === 'web-server' ? { ...a, page } : a)) }
        : d,
    ),
  };
}

/** Active/désactive ou configure le service DHCP d'un appareil (routeur). */
export function setDeviceDhcp(topo: Topology, id: DeviceId, dhcp: DhcpConfig | undefined): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => (d.id === id ? { ...d, dhcp } : d)),
  };
}

/** Met à jour des champs de l'appareil (nom, passerelle, DNS). */
export function setDeviceFields(
  topo: Topology,
  id: DeviceId,
  patch: Partial<Pick<Device, 'name' | 'gateway' | 'dns'>>,
): Topology {
  return {
    ...topo,
    devices: topo.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  };
}

/**
 * Rétablit les invariants : supprime les liens pendants ou en doublon sur un
 * même port, puis recalcule chaque `interface.linkId` à partir des liens.
 */
export function normalizeTopology(topo: Topology): Topology {
  const seen = new Set<string>();
  const validLinks: Link[] = [];
  for (const l of topo.links) {
    if (l.a.deviceId === l.b.deviceId) continue;
    if (!findInterface(topo, l.a.deviceId, l.a.interfaceId)) continue;
    if (!findInterface(topo, l.b.deviceId, l.b.interfaceId)) continue;
    const ka = portKey(l.a);
    const kb = portKey(l.b);
    if (seen.has(ka) || seen.has(kb)) continue; // port déjà câblé → on ignore le doublon
    seen.add(ka);
    seen.add(kb);
    validLinks.push(l);
  }

  const linkByPort = new Map<string, string>();
  for (const l of validLinks) {
    linkByPort.set(portKey(l.a), l.id);
    linkByPort.set(portKey(l.b), l.id);
  }

  const devices = topo.devices.map((d) => ({
    ...d,
    interfaces: d.interfaces.map((itf) => {
      const linkId = linkByPort.get(`${d.id}/${itf.id}`);
      return linkId ? { ...itf, linkId } : { ...itf, linkId: undefined };
    }),
  }));

  return { ...topo, devices, links: validLinks };
}

/** Helper : construit un Endpoint. */
export function endpoint(deviceId: DeviceId, interfaceId: InterfaceId): Endpoint {
  return { deviceId, interfaceId };
}

/** Le câble branché sur ce port, ou null. */
export function linkForEndpoint(topo: Topology, ep: Endpoint): Link | null {
  return (
    topo.links.find(
      (l) =>
        (l.a.deviceId === ep.deviceId && l.a.interfaceId === ep.interfaceId) ||
        (l.b.deviceId === ep.deviceId && l.b.interfaceId === ep.interfaceId),
    ) ?? null
  );
}

/** L'autre extrémité d'un câble par rapport à un endpoint donné. */
export function otherEndpoint(link: Link, ep: Endpoint): Endpoint {
  return link.a.deviceId === ep.deviceId && link.a.interfaceId === ep.interfaceId ? link.b : link.a;
}

/** Compte les interfaces ayant une IP donnée (détection de doublon en UI). */
export function countDevicesWithIp(topo: Topology, ip: Ip): number {
  let n = 0;
  for (const d of topo.devices) {
    for (const i of d.interfaces) if (i.ip === ip) n++;
  }
  return n;
}
