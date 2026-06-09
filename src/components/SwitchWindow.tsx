// Petite fenêtre d'un commutateur (couche 2, sans adresse IP) : renommage + état
// des ports + table MAC vivante (en Simulation). Thème distinct (accent teal).
// Ouvrable en Conception et en Simulation.

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Device } from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import { Field } from './RouterConfig';
import type { SimEngine } from '../hooks/useSimulationEngine';

interface Props {
  device: Device;
  /** Présent en Simulation : permet d'afficher la table MAC apprise. */
  engine?: SimEngine;
  zIndex: number;
  initialX: number;
  initialY: number;
  onClose: () => void;
  onFocus: () => void;
  onRename: (name: string) => void;
}

export default function SwitchWindow({ device, engine, zIndex, initialX, initialY, onClose, onFocus, onRename }: Props) {
  const def = getDeviceDef(device.kind);
  const [pos, setPos] = useState({ x: initialX, y: initialY });
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

  const used = device.interfaces.filter((i) => i.linkId).length;
  const macTable = engine?.world.runtime[device.id]?.macTable ?? [];
  const portName = (ifId: string) => device.interfaces.find((i) => i.id === ifId)?.name ?? ifId;

  return (
    <div
      className="absolute flex w-[320px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/15"
      style={{ left: pos.x, top: pos.y, zIndex }}
      onPointerDown={onFocus}
    >
      <div
        className="flex cursor-move items-center gap-2 bg-gradient-to-b from-teal-600 to-teal-800 px-3 py-2 text-white"
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
          <span className="text-teal-200">— Commutateur</span>
        </span>
        <button type="button" onClick={onClose} className="rounded p-0.5 hover:bg-white/20" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <Field label="Nom du commutateur" value={name} valid={name.trim() !== ''} onChange={(v) => { setName(v); onRename(v); }} />
        <div>
          <div className="text-xs font-medium text-slate-500">
            Ports ({used}/{device.interfaces.length} connectés)
          </div>
          <ul className="mt-1 space-y-0.5">
            {device.interfaces.map((itf) => (
              <li key={itf.id} className="flex justify-between font-mono text-xs text-slate-500">
                <span>{itf.name}</span>
                <span className={itf.linkId ? 'text-emerald-600' : 'text-slate-400'}>
                  {itf.linkId ? 'connecté' : 'libre'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            Un commutateur travaille en couche 2 (adresses MAC) : il n'a pas d'adresse IP à configurer.
          </p>
        </div>

        {/* Table MAC vivante — uniquement en Simulation (le moteur fournit le runtime). */}
        {engine && (
          <div>
            <div className="text-xs font-medium text-slate-500">
              Table MAC ({macTable.length} adresse{macTable.length > 1 ? 's' : ''} apprise{macTable.length > 1 ? 's' : ''})
            </div>
            {macTable.length === 0 ? (
              <p className="mt-1 text-[11px] text-slate-400">
                Vide pour l'instant : le commutateur apprend une adresse MAC à chaque trame reçue.
                Lancez un ping et observez la table se remplir.
              </p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {macTable.map((e) => (
                  <li key={e.mac} className="flex justify-between font-mono text-xs text-slate-600">
                    <span>{e.mac}</span>
                    <span className="text-teal-700">
                      {portName(e.interfaceId)} <span className="text-slate-400">(t={e.learnedAtTick})</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
