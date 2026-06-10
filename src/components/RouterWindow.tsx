// Fenêtre d'administration d'un ROUTEUR — console d'appliance réseau sombre à
// accent orange, distincte du bureau bleu des ordinateurs mais avec la même
// mécanique : MULTITÂCHE (les outils ouverts restent montés → le Terminal garde
// son historique), barre des tâches persistante (Console · outils ouverts · LED
// des services DHCP/NAT/Routage + horloge), barre de titre par outil (réduire /
// fermer) et écran redimensionnable. L'accueil est un TABLEAU DE BORD : état des
// ports (câblé/IP) et des services, puis les outils d'administration.

import { useEffect, useRef, useState } from 'react';
import {
  X,
  Minus,
  LayoutGrid,
  TerminalSquare,
  Network,
  Route as RouteIcon,
  Send,
  Shuffle,
  type LucideIcon,
} from 'lucide-react';
import type { Device, DhcpConfig, InterfaceId, Ip, NatConfig, Route, RoutingMode } from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import type { SimEngine } from '../hooks/useSimulationEngine';
import Terminal from './Terminal';
import { Field, InterfacesSection, RoutesSection, DhcpSection, NatSection } from './RouterConfig';

type Tool = 'terminal' | 'interfaces' | 'routes' | 'dhcp' | 'nat';

interface Props {
  device: Device;
  /** Moteur de simulation : absent en Conception (Terminal désactivé). */
  engine?: SimEngine;
  zIndex: number;
  initialX: number;
  initialY: number;
  onClose: () => void;
  onFocus: () => void;
  onRename: (name: string) => void;
  onSetInterfaceIp: (ifId: InterfaceId, ip: Ip | undefined) => void;
  onSetInterfacePrefix: (ifId: InterfaceId, prefix: number | undefined) => void;
  onSetGateway: (ip: Ip | undefined) => void;
  onSetDns: (ip: Ip | undefined) => void;
  onSetRoutes: (routes: Route[]) => void;
  onSetRouting: (mode: RoutingMode) => void;
  onSetDhcp: (cfg: DhcpConfig | undefined) => void;
  onSetNat: (cfg: NatConfig | undefined) => void;
}

const TOOLS: { tool: Tool; label: string; icon: LucideIcon; desc: string }[] = [
  { tool: 'terminal', label: 'Terminal', icon: TerminalSquare, desc: 'ping, route, traceroute, ipconfig…' },
  { tool: 'interfaces', label: 'Interfaces', icon: Network, desc: 'Adresses IP et masques des ports' },
  { tool: 'routes', label: 'Routage', icon: RouteIcon, desc: 'Table de routage statique + protocole' },
  { tool: 'dhcp', label: 'DHCP', icon: Send, desc: 'Distribuer des adresses IP' },
  { tool: 'nat', label: 'NAT', icon: Shuffle, desc: 'Translation d’adresses + redirections' },
];

const toolMeta = (t: Tool) => TOOLS.find((x) => x.tool === t)!;

const SIZE_MIN = { w: 420, h: 280 };
const SIZE_MAX = { w: 760, h: 560 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function RouterWindow({
  device,
  engine,
  zIndex,
  initialX,
  initialY,
  onClose,
  onFocus,
  onRename,
  onSetInterfaceIp,
  onSetInterfacePrefix,
  onSetGateway,
  onSetDns,
  onSetRoutes,
  onSetRouting,
  onSetDhcp,
  onSetNat,
}: Props) {
  const def = getDeviceDef(device.kind);
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [size, setSize] = useState({ w: 500, h: 380 });
  // Outils ouverts (montés, dans l'ordre d'ouverture) + outil au premier plan.
  // `active === null` → tableau de bord (les outils ouverts restent dans la barre).
  const [open, setOpen] = useState<Tool[]>([]);
  const [active, setActive] = useState<Tool | null>(null);
  const [name, setName] = useState(device.name);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; ow: number; oh: number } | null>(null);

  // Horloge de la barre des tâches (heure réelle, rafraîchie chaque demi-minute).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  function openTool(t: Tool) {
    setOpen((o) => (o.includes(t) ? o : [...o, t]));
    setActive(t);
  }
  function closeTool(t: Tool) {
    setOpen((o) => o.filter((x) => x !== t));
    setActive((a) => (a === t ? null : a));
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

  // État des services (pour les LED du tableau de bord et de la barre des tâches).
  const dhcpOn = !!device.dhcp;
  // NAT : configuré ET armé (interface WAN désignée) → vert ; activé sans WAN → ambre.
  const natState: 'on' | 'armed' | 'off' = device.nat?.wanInterfaceId ? 'on' : device.nat ? 'armed' : 'off';
  const routingMode = device.routing ?? 'static';
  const routingLabel = routingMode === 'static' ? 'Statique' : routingMode.toUpperCase();

  /** Contenu d'un outil (le composant reste monté quand l'outil passe en fond). */
  function toolContent(t: Tool) {
    if (t === 'terminal') {
      return engine ? (
        <Terminal device={device} engine={engine} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center">
          <p className="text-sm font-medium text-slate-700">Disponible en mode Simulation</p>
          <p className="text-xs text-slate-500">Le terminal envoie des paquets : passez en Simulation.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3 p-3">
        {t === 'interfaces' && (
          <>
            <Field label="Nom du routeur" value={name} valid={name.trim() !== ''} onChange={(v) => { setName(v); onRename(v); }} />
            <InterfacesSection
              device={device}
              onSetInterfaceIp={onSetInterfaceIp}
              onSetInterfacePrefix={onSetInterfacePrefix}
              onSetGateway={onSetGateway}
              onSetDns={onSetDns}
            />
          </>
        )}
        {t === 'routes' && <RoutesSection device={device} onSetRoutes={onSetRoutes} onSetRouting={onSetRouting} />}
        {t === 'dhcp' && <DhcpSection device={device} onSetDhcp={onSetDhcp} />}
        {t === 'nat' && <NatSection device={device} onSetNat={onSetNat} />}
      </div>
    );
  }

  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/20"
      style={{ left: pos.x, top: pos.y, zIndex, width: size.w }}
      onPointerDown={onFocus}
    >
      {/* Barre de titre — accent orange (distinct des ordinateurs) ; le feu rouge ferme. */}
      <div
        className="flex cursor-move items-center gap-2 bg-gradient-to-b from-orange-600 to-orange-800 px-3 py-2 text-white"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
      >
        <span className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-3 w-3 rounded-full bg-rose-300 hover:bg-rose-200"
            title="Fermer"
            aria-label="Fermer"
          />
          <span className="h-3 w-3 rounded-full bg-amber-200" />
          <span className="h-3 w-3 rounded-full bg-emerald-300" />
        </span>
        <span className="ml-1 flex flex-1 items-center gap-1.5 truncate text-sm font-medium">
          <def.icon size={14} /> {device.name}
          <span className="text-orange-200">— {active ? toolMeta(active).label : 'Console'}</span>
        </span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-white/20" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      {/* L'écran : tableau de bord toujours présent, outils ouverts par-dessus (montés). */}
      <div className="relative" style={{ height: size.h }}>
        {/* Tableau de bord (accueil) : état du système + outils */}
        <div className="absolute inset-0 flex flex-col overflow-y-auto bg-gradient-to-br from-slate-800 to-slate-900">
          <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-orange-300/80">
            État du système
          </div>
          <div className="mx-3 rounded-lg bg-black/25 px-3 py-2 ring-1 ring-white/10">
            <ul className="space-y-1">
              {device.interfaces.map((itf) => {
                const state = itf.linkId && itf.ip ? 'ok' : itf.linkId ? 'warn' : 'off';
                return (
                  <li key={itf.id} className="flex items-center gap-2 font-mono text-[11px] text-slate-200">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        state === 'ok' ? 'bg-emerald-400' : state === 'warn' ? 'bg-amber-400' : 'bg-slate-600'
                      }`}
                    />
                    <span className="w-12">{itf.name}</span>
                    <span className={itf.ip ? 'text-slate-100' : 'text-slate-500'}>
                      {itf.ip ? `${itf.ip}/${itf.prefix ?? '?'}` : itf.linkId ? 'câblé, sans IP' : 'non câblé'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 text-[10px]">
              <Led on={dhcpOn} label="DHCP" />
              <Led on={natState === 'on'} warn={natState === 'armed'} label="NAT" />
              <span className={`rounded px-1.5 py-0.5 font-medium ${routingMode === 'static' ? 'bg-white/10 text-slate-300' : 'bg-orange-500/25 text-orange-200'}`}>
                Routage : {routingLabel}
              </span>
            </div>
          </div>

          <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-orange-300/80">
            Outils d'administration
          </div>
          <div className="flex flex-1 flex-wrap content-start gap-2 p-3 pt-1">
            {TOOLS.map((t) => (
              <ConsoleTile key={t.tool} icon={t.icon} label={t.label} title={t.desc} onOpen={() => openTool(t.tool)} />
            ))}
          </div>
        </div>

        {/* Outils ouverts : chacun garde son état ; seul l'actif est visible. */}
        {open.map((t) => {
          const meta = toolMeta(t);
          const Icon = meta.icon;
          return (
            <div key={t} className={t === active ? 'absolute inset-0 flex flex-col bg-white' : 'hidden'}>
              <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-orange-200 bg-orange-50 px-2">
                <Icon size={13} className="text-orange-600" />
                <span className="flex-1 truncate text-xs font-medium text-slate-700">{meta.label}</span>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded p-0.5 text-slate-400 hover:bg-orange-100 hover:text-slate-600"
                  title="Réduire (revenir à la console)"
                >
                  <Minus size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => closeTool(t)}
                  className="rounded p-0.5 text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                  title="Fermer l'outil"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{toolContent(t)}</div>
            </div>
          );
        })}
      </div>

      {/* Barre des tâches persistante : Console · outils ouverts · LED services + horloge. */}
      <div className="flex h-9 items-center gap-1 border-t border-orange-900/40 bg-slate-950 px-1.5 text-white">
        <button
          type="button"
          onClick={() => setActive(null)}
          className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] ${active === null ? 'bg-orange-500/30' : 'hover:bg-white/10'}`}
          title="Afficher la console"
        >
          <LayoutGrid size={13} /> Console
        </button>
        <span className="mx-0.5 h-4 w-px bg-white/15" />
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {open.map((t) => {
            const meta = toolMeta(t);
            const Icon = meta.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setActive(t)}
                className={`flex min-w-0 items-center gap-1 rounded px-2 py-1 text-[11px] ${t === active ? 'bg-orange-500/30' : 'bg-white/5 hover:bg-white/10'}`}
                title={meta.label}
              >
                <Icon size={13} className="shrink-0" />
                <span className="truncate">{meta.label}</span>
              </button>
            );
          })}
        </div>
        {/* LED des services : cliquer ouvre l'outil correspondant. */}
        <button
          type="button"
          onClick={() => openTool('dhcp')}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] hover:bg-white/10"
          title={dhcpOn ? 'Serveur DHCP actif — cliquez pour configurer' : 'DHCP désactivé — cliquez pour configurer'}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dhcpOn ? 'bg-emerald-400' : 'bg-slate-600'}`} /> DHCP
        </button>
        <button
          type="button"
          onClick={() => openTool('nat')}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] hover:bg-white/10"
          title={
            natState === 'on'
              ? 'NAT actif (interface WAN désignée) — cliquez pour configurer'
              : natState === 'armed'
                ? 'NAT activé mais SANS interface WAN → inactif — cliquez pour la désigner'
                : 'NAT désactivé — cliquez pour configurer'
          }
        >
          <span className={`h-1.5 w-1.5 rounded-full ${natState === 'on' ? 'bg-emerald-400' : natState === 'armed' ? 'bg-amber-400' : 'bg-slate-600'}`} /> NAT
        </button>
        <button
          type="button"
          onClick={() => openTool('routes')}
          className={`rounded px-1.5 py-1 text-[10px] hover:bg-white/10 ${routingMode === 'static' ? 'text-slate-400' : 'text-orange-300'}`}
          title={`Routage : ${routingLabel} — cliquez pour configurer`}
        >
          {routingLabel}
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

/** Petite LED de service (verte = actif, ambre = configuré mais inactif). */
function Led({ on, warn = false, label }: { on: boolean; warn?: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-slate-300">
      <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-400' : warn ? 'bg-amber-400' : 'bg-slate-600'}`} />
      {label}
    </span>
  );
}

function ConsoleTile({ icon: Icon, label, title, onOpen }: { icon: LucideIcon; label: string; title: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onDoubleClick={onOpen}
      title={title}
      className="group flex w-[84px] flex-col items-center gap-1.5 rounded-lg p-2 focus:outline-none"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/30 transition group-hover:-translate-y-0.5 group-hover:bg-orange-500/25">
        <Icon size={24} />
      </span>
      <span className="rounded bg-black/30 px-1.5 py-0.5 text-center text-[11px] font-medium text-orange-50">{label}</span>
    </button>
  );
}
