// Fenêtre flottante représentant l'« écran » d'un ordinateur, façon vrai petit OS :
// bureau à icônes, MULTITÂCHE (les logiciels ouverts restent montés → le Terminal
// garde son historique, le navigateur sa page), barre des tâches persistante
// (Bureau · applications ouvertes · zone de notification : état réseau + horloge),
// chaque application a sa barre de titre (réduire / fermer), et l'écran est
// redimensionnable par son coin bas-droit. Ouvrable en Conception ET en Simulation ;
// les logiciels qui émettent des paquets (Terminal, Navigateur) ne sont actifs
// qu'en Simulation (quand un moteur est fourni).

import { useEffect, useRef, useState } from 'react';
import { Package, X, LayoutGrid, Minus, Network, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import type { AppKind, Device, DnsRecord, InterfaceId, Ip } from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import { getAppDef } from '../devices/apps';
import type { SimEngine } from '../hooks/useSimulationEngine';
import Terminal from './Terminal';
import AppInstaller from './AppInstaller';
import DnsServerApp from './DnsServerApp';
import WebServerApp from './WebServerApp';
import WebBrowserApp from './WebBrowserApp';
import { Field, InterfacesSection } from './RouterConfig';

interface Props {
  device: Device;
  /** Moteur de simulation : absent en mode Conception (Terminal/Navigateur désactivés). */
  engine?: SimEngine;
  zIndex: number;
  initialX: number;
  initialY: number;
  onClose: () => void;
  onFocus: () => void;
  onInstall: (kind: AppKind) => void;
  onUninstall: (kind: AppKind) => void;
  onSetDnsRecords: (records: DnsRecord[]) => void;
  onSetDnsRecursive: (recursive: boolean) => void;
  onSetWebPage: (page: string) => void;
  onRename: (name: string) => void;
  onSetInterfaceIp: (ifId: InterfaceId, ip: Ip | undefined) => void;
  onSetInterfacePrefix: (ifId: InterfaceId, prefix: number | undefined) => void;
  onSetGateway: (ip: Ip | undefined) => void;
  onSetDns: (ip: Ip | undefined) => void;
}

/** Une « application » de la machine : un logiciel installé ou un outil système. */
type View = 'reseau' | 'installer' | AppKind;

function viewMeta(view: View): { label: string; icon: LucideIcon } {
  if (view === 'reseau') return { label: 'Réseau', icon: Network };
  if (view === 'installer') return { label: 'Logiciels', icon: Package };
  const def = getAppDef(view);
  return { label: def.label, icon: def.icon };
}

const SIZE_MIN = { w: 400, h: 240 };
const SIZE_MAX = { w: 760, h: 540 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Papiers peints disponibles — chaque machine a le sien (déterminé par son id). */
const WALLPAPERS = [
  'from-sky-500 via-indigo-600 to-violet-700',
  'from-emerald-500 via-teal-600 to-cyan-800',
  'from-orange-400 via-rose-500 to-pink-700',
  'from-indigo-500 via-purple-600 to-slate-800',
] as const;

function wallpaperOf(id: string): string {
  let h = 0;
  for (const c of id) h = (h + c.charCodeAt(0)) % WALLPAPERS.length;
  return WALLPAPERS[h];
}

export default function MachineWindow({
  device,
  engine,
  zIndex,
  initialX,
  initialY,
  onClose,
  onFocus,
  onInstall,
  onUninstall,
  onSetDnsRecords,
  onSetDnsRecursive,
  onSetWebPage,
  onRename,
  onSetInterfaceIp,
  onSetInterfacePrefix,
  onSetGateway,
  onSetDns,
}: Props) {
  const def = getDeviceDef(device.kind);
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: 460, h: 320 });
  // Applications ouvertes (montées, dans l'ordre d'ouverture) + application au premier plan.
  // `active === null` → on voit le bureau (les apps ouvertes restent dans la barre des tâches).
  const [open, setOpen] = useState<View[]>([]);
  const [active, setActive] = useState<View | null>(null);
  const [name, setName] = useState(device.name);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);
  const apps = device.apps ?? [];

  // Horloge de la barre des tâches (heure réelle, rafraîchie chaque demi-minute).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const primaryIp = device.interfaces.find((i) => i.ip)?.ip;
  const cabled = device.interfaces.some((i) => i.linkId);

  // Notification réseau : quand la machine OBTIENT une adresse IP (config manuelle
  // ou bail DHCP pendant la simulation), un toast l'annonce — comme un vrai système.
  const prevIpRef = useRef(primaryIp);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const prev = prevIpRef.current;
    prevIpRef.current = primaryIp;
    if (primaryIp && primaryIp !== prev) {
      setToast(`Réseau connecté — ${primaryIp}`);
      const id = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(id);
    }
  }, [primaryIp]);

  // Une app désinstallée pendant qu'elle est ouverte disparaît de la barre des tâches.
  const validOpen = open.filter(
    (v) => v === 'reseau' || v === 'installer' || apps.some((a) => a.kind === v),
  );
  const shown = active !== null && validOpen.includes(active) ? active : null;

  function openView(v: View) {
    setOpen((o) => (o.includes(v) ? o : [...o, v]));
    setActive(v);
  }
  function closeView(v: View) {
    setOpen((o) => o.filter((x) => x !== v));
    setActive((a) => (a === v ? null : a));
  }

  function onHeaderDown(e: React.PointerEvent) {
    onFocus();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
  }
  function onHeaderMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setPos({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
  }
  function onHeaderUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
  }

  function onResizeDown(e: React.PointerEvent) {
    e.stopPropagation();
    onFocus();
    (e.target as Element).setPointerCapture(e.pointerId);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h };
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resizeRef.current;
    if (!r) return;
    setSize({
      w: clamp(r.ow + (e.clientX - r.sx), SIZE_MIN.w, SIZE_MAX.w),
      h: clamp(r.oh + (e.clientY - r.sy), SIZE_MIN.h, SIZE_MAX.h),
    });
  }
  function onResizeUp(e: React.PointerEvent) {
    resizeRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
  }

  /** Contenu d'une application (le composant reste monté quand l'app passe en fond). */
  function appContent(view: View) {
    if (view === 'reseau') {
      return (
        <div className="space-y-3 p-3">
          <Field label="Nom de la machine" value={name} valid={name.trim() !== ''} onChange={(v) => { setName(v); onRename(v); }} />
          <InterfacesSection
            device={device}
            onSetInterfaceIp={onSetInterfaceIp}
            onSetInterfacePrefix={onSetInterfacePrefix}
            onSetGateway={onSetGateway}
            onSetDns={onSetDns}
          />
        </div>
      );
    }
    if (view === 'installer') return <AppInstaller device={device} onInstall={onInstall} onUninstall={onUninstall} />;
    if (view === 'terminal') return engine ? <Terminal device={device} engine={engine} /> : <RuntimeOnly />;
    if (view === 'web-browser') return engine ? <WebBrowserApp device={device} engine={engine} /> : <RuntimeOnly />;
    if (view === 'dns-server')
      return <DnsServerApp device={device} onSetRecords={onSetDnsRecords} onSetRecursive={onSetDnsRecursive} />;
    if (view === 'web-server') return <WebServerApp device={device} onSetPage={onSetWebPage} />;
    return <ComingSoon kind={view} />;
  }

  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/15"
      style={{ left: pos.x, top: pos.y, zIndex, width: size.w }}
      onPointerDown={onFocus}
    >
      {/* Barre de titre de la fenêtre (l'écran physique) — le feu rouge ferme. */}
      <div
        className="flex cursor-move items-center gap-2 bg-gradient-to-b from-slate-700 to-slate-800 px-3 py-2 text-white"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
      >
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-3 w-3 rounded-full bg-rose-400 hover:bg-rose-300"
            title="Fermer"
            aria-label="Fermer"
          />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </span>
        <span className="ml-1 flex flex-1 items-center gap-1.5 truncate text-sm font-medium">
          <def.icon size={14} /> {device.name}
          {shown && <span className="text-slate-400">— {viewMeta(shown).label}</span>}
        </span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-white/20" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      {/* L'écran : bureau toujours présent, applications ouvertes par-dessus (montées). */}
      <div className="relative" style={{ height: size.h }}>
        {/* Bureau (papier peint propre à la machine + icônes) */}
        <div className={`absolute inset-0 flex flex-col bg-gradient-to-br ${wallpaperOf(device.id)}`}>
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-20 -left-8 h-56 w-56 rounded-full bg-white/5" />
          <div className="relative flex flex-1 flex-wrap content-start gap-2 p-3">
            <DesktopIcon icon={Network} label="Réseau" title="Adresse IP, passerelle, DNS, nom" onOpen={() => openView('reseau')} />
            {apps.map((a) => (
              <DesktopIcon
                key={a.kind}
                icon={getAppDef(a.kind).icon}
                label={getAppDef(a.kind).label}
                title={getAppDef(a.kind).description}
                onOpen={() => openView(a.kind)}
              />
            ))}
            <DesktopIcon icon={Package} label="Logiciels" title="Installer ou retirer des logiciels" onOpen={() => openView('installer')} />
          </div>
        </div>

        {/* Applications ouvertes : chacune garde son état ; seule l'active est visible. */}
        {validOpen.map((v) => {
          const meta = viewMeta(v);
          const Icon = meta.icon;
          return (
            <div key={v} className={v === shown ? 'absolute inset-0 flex flex-col bg-white' : 'hidden'}>
              {/* Barre de titre de l'application */}
              <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-2">
                <Icon size={13} className="text-slate-500" />
                <span className="flex-1 truncate text-xs font-medium text-slate-700">{meta.label}</span>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  title="Réduire (revenir au bureau)"
                >
                  <Minus size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => closeView(v)}
                  className="rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                  title="Fermer l'application"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{appContent(v)}</div>
            </div>
          );
        })}

        {/* Notification réseau (toast au-dessus de la barre des tâches) */}
        {toast && (
          <div className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-2 rounded-lg bg-slate-800/95 px-3 py-2 text-xs text-white shadow-xl ring-1 ring-white/10">
            <Wifi size={14} className="text-emerald-400" />
            {toast}
          </div>
        )}

      </div>

      {/* Barre des tâches persistante : Bureau · apps ouvertes · zone de notification. */}
      <div className="flex h-9 items-center gap-1 border-t border-white/10 bg-slate-900 px-1.5 text-white">
        <button
          type="button"
          onClick={() => setActive(null)}
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${shown === null ? 'bg-white/20' : 'hover:bg-white/10'}`}
          title="Afficher le bureau"
        >
          <LayoutGrid size={13} /> Bureau
        </button>
        <span className="mx-0.5 h-4 w-px bg-white/15" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {validOpen.map((v) => {
            const meta = viewMeta(v);
            const Icon = meta.icon;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setActive(v)}
                className={`flex min-w-0 items-center gap-1 rounded px-2 py-1 text-[11px] ${v === shown ? 'bg-white/20' : 'bg-white/5 hover:bg-white/10'}`}
                title={meta.label}
              >
                <Icon size={13} className="shrink-0" />
                <span className="truncate">{meta.label}</span>
              </button>
            );
          })}
        </div>
        {/* Zone de notification : état réseau (clic → Réseau) + horloge */}
        <button
          type="button"
          onClick={() => openView('reseau')}
          className="flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] hover:bg-white/10"
          title={primaryIp ? `Adresse IP : ${primaryIp} — cliquez pour ouvrir Réseau` : 'Aucune adresse IP — cliquez pour configurer'}
        >
          {cabled && primaryIp ? (
            <Wifi size={13} className="text-emerald-400" />
          ) : (
            <WifiOff size={13} className="text-amber-400" />
          )}
          {primaryIp ?? 'pas d’IP'}
        </button>
        <span className="px-1.5 font-mono text-[11px] text-slate-300">{clock}</span>
      </div>

      {/* Poignée de redimensionnement (coin bas-droit) */}
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        title="Redimensionner"
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-white/40">
          <path d="M14 8 L8 14 M14 11 L11 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
    </div>
  );
}

function DesktopIcon({
  icon: Icon,
  label,
  title,
  onOpen,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onOpen}
      title={title}
      className="group flex w-[80px] flex-col items-center gap-1.5 rounded-lg p-2 focus:outline-none"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/95 text-slate-700 shadow-lg ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-xl">
        <Icon size={26} />
      </span>
      <span className="rounded bg-black/25 px-1.5 py-0.5 text-center text-[11px] font-medium text-white">
        {label}
      </span>
    </button>
  );
}

/** Écran d'un logiciel qui ne fonctionne qu'en Simulation (Terminal, Navigateur). */
function RuntimeOnly() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center">
      <p className="text-sm font-medium text-slate-700">Disponible en mode Simulation</p>
      <p className="text-xs text-slate-500">
        Ce logiciel envoie des paquets : passez en mode Simulation pour l'utiliser.
      </p>
    </div>
  );
}

function ComingSoon({ kind }: { kind: AppKind }) {
  const def = getAppDef(kind);
  const Icon = def.icon;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center">
      <Icon size={36} className="text-slate-400" />
      <div className="text-sm font-medium text-slate-700">{def.label}</div>
      <p className="text-xs text-slate-500">{def.description}</p>
      <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-xs text-amber-700">
        Bientôt disponible — nécessite la couche transport (prochaine étape).
      </p>
    </div>
  );
}
