// Panneau de droite pour un câble sélectionné : extrémités + débit (utile à OSPF).

import { Trash2 } from 'lucide-react';
import type { Link, Topology } from '../domain/types';
import { DEFAULT_BW, ospfCost } from '../lib/routing';

interface Props {
  link: Link;
  topology: Topology;
  onSetBandwidth: (bandwidth: number | undefined) => void;
  onDelete: () => void;
}

const SPEEDS = [10, 100, 1000];
const nameOf = (topo: Topology, id: string) => topo.devices.find((d) => d.id === id)?.name ?? id;

export default function LinkPanel({ link, topology, onSetBandwidth, onDelete }: Props) {
  const bw = link.bandwidth ?? DEFAULT_BW;
  return (
    <div className="flex w-60 flex-col gap-2 rounded-xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Câble</span>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
          title="Supprimer (Suppr)"
        >
          <Trash2 size={14} /> Supprimer
        </button>
      </div>

      <p className="text-sm text-slate-600">
        {nameOf(topology, link.a.deviceId)} ↔ {nameOf(topology, link.b.deviceId)}
      </p>

      <div>
        <span className="block text-xs font-medium text-slate-500">Débit</span>
        <div className="mt-1 flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSetBandwidth(s === DEFAULT_BW ? undefined : s)}
              className={`flex-1 rounded border px-1 py-1 text-xs ${
                bw === s ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-300 hover:bg-slate-50'
              }`}
            >
              {s >= 1000 ? `${s / 1000} Gb/s` : `${s} Mb/s`}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Coût OSPF de ce lien : <span className="font-mono">{ospfCost(link.bandwidth)}</span>. Le débit n'influence
          que le choix de chemin OSPF.
        </p>
      </div>
    </div>
  );
}
