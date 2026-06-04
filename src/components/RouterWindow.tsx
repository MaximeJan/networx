// Fenêtre d'administration d'un ROUTEUR (équivalent du « bureau » des ordinateurs,
// mais avec un visuel distinct : console d'appliance réseau sombre à accent orange).
// Ses « logiciels » sont les outils de configuration : Terminal, Interfaces, Routage,
// DHCP, NAT — qui réutilisent les éditeurs de RouterConfig.

import { useRef, useState } from 'react';
import { X, LayoutGrid, TerminalSquare, Network, Route as RouteIcon, Send, Shuffle, type LucideIcon } from 'lucide-react';
import type { Device, DhcpConfig, InterfaceId, Ip, NatConfig, Route, RoutingMode } from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import type { SimEngine } from '../hooks/useSimulationEngine';
import Terminal from './Terminal';
import { Field, InterfacesSection, RoutesSection, DhcpSection, NatSection } from './RouterConfig';

type Tool = 'terminal' | 'interfaces' | 'routes' | 'dhcp' | 'nat';
type View = 'console' | Tool;

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
  { tool: 'routes', label: 'Routage', icon: RouteIcon, desc: 'Table de routage statique' },
  { tool: 'dhcp', label: 'DHCP', icon: Send, desc: 'Distribuer des adresses IP' },
  { tool: 'nat', label: 'NAT', icon: Shuffle, desc: 'Translation d’adresses + redirections' },
];

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
  const [view, setView] = useState<View>('console');
  const [name, setName] = useState(device.name);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

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

  const current = TOOLS.find((t) => t.tool === view);
  const ips = device.interfaces.filter((i) => i.ip).map((i) => i.ip);

  return (
    <div
      className="absolute flex w-[440px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/20"
      style={{ left: pos.x, top: pos.y, zIndex }}
      onPointerDown={onFocus}
    >
      {/* Barre de titre — accent orange (distinct des ordinateurs) */}
      <div
        className="flex cursor-move items-center gap-2 bg-gradient-to-b from-orange-600 to-orange-800 px-3 py-2 text-white"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-300" />
          <span className="h-3 w-3 rounded-full bg-amber-200" />
          <span className="h-3 w-3 rounded-full bg-emerald-300" />
        </span>
        <span className="ml-1 flex flex-1 items-center gap-1.5 truncate text-sm font-medium">
          <def.icon size={14} /> {device.name}
          <span className="text-orange-200">— Console</span>
          {current && <span className="text-orange-200">/ {current.label}</span>}
        </span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-white/20" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="h-[380px]">
        {view === 'console' ? (
          <div className="flex h-full flex-col bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-orange-300/80">
              Routeur — outils d'administration
            </div>
            <div className="flex flex-1 flex-wrap content-start gap-2 p-3 pt-1">
              {TOOLS.map((t) => (
                <ConsoleTile key={t.tool} icon={t.icon} label={t.label} title={t.desc} onOpen={() => setView(t.tool)} />
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-white">
              <span className="flex items-center gap-1.5 font-medium">
                <def.icon size={13} /> {device.name}
              </span>
              <span className="font-mono text-orange-200">
                {ips.length ? ips.join(' · ') : 'aucune IP'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-2 py-1">
              <button
                type="button"
                onClick={() => setView('console')}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
              >
                <LayoutGrid size={13} /> Console
              </button>
              {current && (
                <span className="flex items-center gap-1 text-xs font-medium text-slate-700">
                  <current.icon size={13} /> {current.label}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === 'terminal' ? (
                engine ? (
                  <Terminal device={device} engine={engine} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-4 text-center">
                    <p className="text-sm font-medium text-slate-700">Disponible en mode Simulation</p>
                    <p className="text-xs text-slate-500">Le terminal envoie des paquets : passez en Simulation.</p>
                  </div>
                )
              ) : (
                <div className="space-y-3 p-3">
                  {view === 'interfaces' && (
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
                  {view === 'routes' && <RoutesSection device={device} onSetRoutes={onSetRoutes} onSetRouting={onSetRouting} />}
                  {view === 'dhcp' && <DhcpSection device={device} onSetDhcp={onSetDhcp} />}
                  {view === 'nat' && <NatSection device={device} onSetNat={onSetNat} />}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
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
