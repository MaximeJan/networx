// Fenêtre flottante représentant l'« écran » d'un ordinateur (style OS). Déplaçable
// par sa barre de titre ; ouvrable en Conception ET en Simulation. Le bureau montre
// l'outil « Réseau » (config IP/passerelle/DNS + renommage), les logiciels installés
// et l'installateur. Les logiciels qui émettent des paquets (Terminal, Navigateur)
// ne sont actifs qu'en Simulation (quand un moteur est fourni).

import { useRef, useState } from 'react';
import { Package, X, LayoutGrid, Network } from 'lucide-react';
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

type View = 'desktop' | 'installer' | 'reseau' | AppKind;

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
  const [view, setView] = useState<View>('desktop');
  const [name, setName] = useState(device.name);
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const apps = device.apps ?? [];

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

  const primaryIp = device.interfaces.find((i) => i.ip)?.ip;
  const appLabel =
    view === 'installer' ? 'Logiciels' : view === 'reseau' ? 'Réseau' : view !== 'desktop' ? getAppDef(view).label : '';
  const AppIcon =
    view === 'installer' ? Package : view === 'reseau' ? Network : view !== 'desktop' ? getAppDef(view).icon : null;

  return (
    <div
      className="absolute flex w-[420px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/15"
      style={{ left: pos.x, top: pos.y, zIndex }}
      onPointerDown={onFocus}
    >
      {/* Barre de titre façon fenêtre */}
      <div
        className="flex cursor-move items-center gap-2 bg-gradient-to-b from-slate-700 to-slate-800 px-3 py-2 text-white"
        onPointerDown={onHeaderDown}
        onPointerMove={onHeaderMove}
        onPointerUp={onHeaderUp}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </span>
        <span className="ml-1 flex flex-1 items-center gap-1.5 truncate text-sm font-medium">
          <def.icon size={14} /> {device.name}
          {appLabel && <span className="text-slate-400">— {appLabel}</span>}
        </span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-white/20" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="h-72">
        {view === 'desktop' ? (
          <div className="flex h-full flex-col bg-gradient-to-br from-sky-500 via-indigo-600 to-violet-700">
            <div className="flex flex-1 flex-wrap content-start gap-2 p-3">
              <DesktopIcon icon={Network} label="Réseau" title="Adresse IP, passerelle, DNS, nom" onOpen={() => setView('reseau')} />
              {apps.map((a) => (
                <DesktopIcon key={a.kind} icon={getAppDef(a.kind).icon} label={getAppDef(a.kind).label} title={getAppDef(a.kind).description} onOpen={() => setView(a.kind)} />
              ))}
              <DesktopIcon icon={Package} label="Logiciels" title="Installer ou retirer des logiciels" onOpen={() => setView('installer')} />
            </div>
            <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/50 px-3 py-1.5 text-[11px] text-white backdrop-blur">
              <span className="flex items-center gap-1.5 font-medium">
                <def.icon size={13} /> {device.name}
              </span>
              <span className="flex items-center gap-1.5 font-mono">
                {primaryIp ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {primaryIp}
                  </>
                ) : (
                  <span className="text-amber-300">non configuré</span>
                )}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-2 py-1">
              <button
                type="button"
                onClick={() => setView('desktop')}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200"
              >
                <LayoutGrid size={13} /> Bureau
              </button>
              <span className="flex items-center gap-1 text-xs font-medium text-slate-700">
                {AppIcon && <AppIcon size={13} />} {appLabel}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === 'reseau' ? (
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
              ) : view === 'installer' ? (
                <AppInstaller device={device} onInstall={onInstall} onUninstall={onUninstall} />
              ) : view === 'terminal' ? (
                engine ? <Terminal device={device} engine={engine} /> : <RuntimeOnly />
              ) : view === 'web-browser' ? (
                engine ? <WebBrowserApp device={device} engine={engine} /> : <RuntimeOnly />
              ) : view === 'dns-server' ? (
                <DnsServerApp device={device} onSetRecords={onSetDnsRecords} onSetRecursive={onSetDnsRecursive} />
              ) : view === 'web-server' ? (
                <WebServerApp device={device} onSetPage={onSetWebPage} />
              ) : (
                <ComingSoon kind={view} />
              )}
            </div>
          </div>
        )}
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
  icon: typeof Package;
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
