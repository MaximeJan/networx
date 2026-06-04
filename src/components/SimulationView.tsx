// Orchestrateur du mode Simulation : branche le moteur temporel et compose les
// contrôles (play/pause/pas-à-pas/vitesse), le canevas animé, les fenêtres
// d'appareils et le journal en bas de page.

import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';
import type { Topology } from '../domain/types';
import { findDevice } from '../lib/topology';
import { useSimulationEngine } from '../hooks/useSimulationEngine';
import { useDeviceWindows } from '../hooks/useDeviceWindows';
import SimCanvas from './SimCanvas';
import EventLog from './EventLog';
import DeviceWindows, { type DeviceWindowHandlers } from './DeviceWindows';

const SPEEDS = [0.5, 1, 2, 4];

interface Props {
  topology: Topology;
  windowHandlers: DeviceWindowHandlers;
}

export default function SimulationView({ topology, windowHandlers }: Props) {
  const engine = useSimulationEngine(topology);
  const windows = useDeviceWindows();

  const ctrlBtn = 'flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm hover:bg-slate-100';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Barre de contrôles */}
      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5">
        <button type="button" className={ctrlBtn} onClick={() => engine.setPlaying(!engine.playing)}>
          {engine.playing ? <Pause size={16} /> : <Play size={16} />}
          {engine.playing ? 'Pause' : 'Lecture'}
        </button>
        <button
          type="button"
          className={`${ctrlBtn} disabled:opacity-40`}
          onClick={engine.stepOnce}
          disabled={!engine.busy}
          title="Traiter le prochain événement"
        >
          <SkipForward size={16} /> Pas
        </button>
        <button type="button" className={ctrlBtn} onClick={engine.reset} title="Réinitialiser la simulation">
          <RotateCcw size={16} /> Réinit.
        </button>

        <span className="mx-1 h-5 w-px bg-slate-200" />
        <span className="text-xs text-slate-400">Vitesse</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => engine.setSpeed(s)}
            className={`rounded px-2 py-1 text-xs ${engine.speed === s ? 'bg-sky-100 text-sky-700' : 'hover:bg-slate-100'}`}
          >
            {s}×
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-slate-200" />
        <span className="font-mono text-xs text-slate-500">t = {Math.floor(engine.clock)}</span>
        {engine.busy && <span className="ml-2 text-xs text-emerald-600">● en cours</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Canevas principal */}
        <div className="relative min-h-0 flex-1">
          <SimCanvas
            world={engine.world}
            clock={engine.clock}
            selectedDeviceId={null}
            selectedPacketId={null}
            onSelectDevice={() => {}}
            onSelectPacket={() => {}}
            onOpenMachine={windows.open}
          />
          <DeviceWindows
            ids={windows.ids}
            deviceById={(id) => findDevice(engine.world.topology, id)}
            engine={engine}
            onClose={windows.close}
            onFocus={windows.focus}
            handlers={windowHandlers}
          />
        </div>

        {/* Journal à droite, pleine hauteur, bouton plein écran conservé */}
        <aside className="flex w-80 min-h-0 flex-col border-l border-slate-200 bg-white">
          <EventLog log={engine.world.log} topology={topology} />
        </aside>
      </div>
    </div>
  );
}
