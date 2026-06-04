// Journal d'événements de la simulation : une ligne par entrée, colorée par tag.
// Filtrable par couche OSI et par nœud. Défile automatiquement vers la dernière entrée.

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import type { LogEntry, LogTag, Topology } from '../domain/types';

const TAG_COLOR: Record<LogTag, string> = {
  emit: 'text-slate-500',
  forward: 'text-indigo-600',
  flood: 'text-amber-600',
  'switch-learn': 'text-teal-600',
  'host-receive': 'text-emerald-600',
  arp: 'text-orange-600',
  icmp: 'text-sky-600',
  udp: 'text-violet-600',
  dns: 'text-fuchsia-600',
  tcp: 'text-blue-700',
  http: 'text-cyan-700',
  dhcp: 'text-lime-600',
  routing: 'text-indigo-700',
  drop: 'text-rose-600',
};

/** Groupes de tags par couche OSI */
const LAYERS: { label: string; tags: LogTag[] | null }[] = [
  { label: 'Toutes', tags: null },
  // ARP est un protocole L2 : résolution IP→MAC au niveau Ethernet.
  { label: 'Liaison', tags: ['emit', 'forward', 'flood', 'switch-learn', 'host-receive', 'arp', 'drop'] },
  { label: 'Réseau', tags: ['icmp', 'routing'] },
  { label: 'Transport', tags: ['udp', 'tcp'] },
  { label: 'Application', tags: ['dns', 'http', 'dhcp'] },
];

interface Props {
  log: LogEntry[];
  topology: Topology;
}

export default function EventLog({ log, topology }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fsScrollRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [filterLayer, setFilterLayer] = useState('');   // '' = toutes
  const [filterDevice, setFilterDevice] = useState(''); // '' = tous

  const nameOf = (id?: string) =>
    id ? (topology.devices.find((d) => d.id === id)?.name ?? id) : '';

  // Filtrage
  const layerTags = LAYERS.find((l) => l.label === filterLayer)?.tags ?? null;
  const filtered = log.filter((e) => {
    const layerOk = !layerTags || (e.tag !== undefined && layerTags.includes(e.tag));
    const deviceOk = !filterDevice || e.deviceId === filterDevice;
    return layerOk && deviceOk;
  });

  // Auto-scroll vers le bas — uniquement le conteneur interne.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length]);

  useEffect(() => {
    const el = fsScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered.length, fullscreen]);

  // Nœuds actifs dans le log (ordre d'apparition, dédupliqués).
  const activeDevices = topology.devices.filter((d) =>
    log.some((e) => e.deviceId === d.id),
  );

  const selectCls =
    'rounded border border-slate-200 bg-slate-50 py-0.5 text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-400';

  // Barre de filtres (réutilisée en compact et plein écran)
  function Filters({ className = '' }: { className?: string }) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <select
          value={filterLayer}
          onChange={(e) => setFilterLayer(e.target.value)}
          className={`${selectCls} pl-1 pr-4`}
          title="Filtrer par couche"
        >
          {LAYERS.map((l) => (
            <option key={l.label} value={l.label === 'Toutes' ? '' : l.label}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          value={filterDevice}
          onChange={(e) => setFilterDevice(e.target.value)}
          className={`${selectCls} pl-1 pr-4`}
          title="Filtrer par nœud"
        >
          <option value="">Tous</option>
          {activeDevices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const countLabel =
    filtered.length === log.length
      ? `${log.length}`
      : `${filtered.length} / ${log.length}`;

  // Contenu des lignes (sans le conteneur scrollable, partagé entre compact et plein écran)
  const emptyMsg = log.length === 0
    ? 'Sélectionnez un ordinateur puis lancez un ping pour voir circuler les paquets.'
    : 'Aucune entrée ne correspond aux filtres sélectionnés.';

  const rowItems = (
    <>
      {filtered.length === 0 && (
        <p className="px-1 py-2 text-slate-400">{emptyMsg}</p>
      )}
      {filtered.map((e, i) => (
        <div key={i} className="flex gap-2 py-0.5">
          <span className="shrink-0 text-slate-300">t={e.tick}</span>
          <span className={`shrink-0 font-semibold ${e.tag ? TAG_COLOR[e.tag] : 'text-slate-500'}`}>
            {nameOf(e.deviceId) || '·'}
          </span>
          <span className="text-slate-600">{e.message}</span>
        </div>
      ))}
    </>
  );

  return (
    <>
      {/* ── Bandeau compact dans la sidebar ── */}
      <div className="flex h-full min-h-0 flex-col">
        {/* En-tête : titre + filtres + bouton plein écran */}
        <div className="flex flex-col gap-1 border-b border-slate-200 px-2 py-1.5">
          <div className="flex items-center">
            <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Journal ({countLabel})
            </span>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Agrandir le journal"
            >
              <Maximize2 size={13} />
            </button>
          </div>
          <Filters />
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-xs leading-relaxed">
          {rowItems}
        </div>
      </div>

      {/* ── Overlay plein écran ── */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2">
            <span className="text-sm font-semibold text-slate-700">
              Journal ({countLabel})
            </span>
            <Filters className="flex-1" />
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Réduire"
            >
              <Minimize2 size={16} />
            </button>
          </div>
          <div
            ref={fsScrollRef}
            className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm leading-relaxed"
          >
            {rowItems}
          </div>
        </div>
      )}
    </>
  );
}
