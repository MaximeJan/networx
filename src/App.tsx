import { useRef, useState } from 'react';
import { MousePointer2, Play, Trophy, Copy, Trash2 } from 'lucide-react';
import networxTextSvg from '../assets/networx_text.svg';
import type { Annotation, Device, DeviceKind, Endpoint, Link, Mode, Selection } from './domain/types';
import {
  addAnnotation,
  addDevice,
  addLink,
  emptyTopology,
  findDevice,
  installApp,
  moveAnnotationsTo,
  moveDevicesTo,
  pasteDevices,
  removeAnnotation,
  removeDevices,
  removeLink,
  setDeviceDhcp,
  setDeviceFields,
  setDeviceNat,
  setDeviceRoutes,
  setDeviceRouting,
  setLinkBandwidth,
  setDnsRecords,
  setDnsRecursive,
  setWebPage,
  uninstallApp,
  updateAnnotation,
  updateInterface,
} from './lib/topology';
import { createDevice, nextDeviceName } from './devices/registry';
import { uid } from './lib/id';
import { GRID, TEXT_COLOR_DEFAULT, TEXT_SIZE_DEFAULT, ZONE_COLOR_DEFAULT } from './lib/constants';
import { loadTopology } from './lib/storage';
import { serialize, deserialize } from './lib/persist';
import { downloadText, readFileText } from './lib/file';
import { CHALLENGES, getChallenge, type Challenge } from './challenges';
import { verifyGoal, type VerifyResult } from './lib/challenge';
import ChallengePanel from './components/ChallengePanel';
import { useHistory } from './hooks/useHistory';
import { useAutosave } from './hooks/useAutosave';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDeviceWindows } from './hooks/useDeviceWindows';
import Toolbar from './components/Toolbar';
import Palette from './components/Palette';
import Canvas from './components/Canvas';
import AnnotationPanel from './components/AnnotationPanel';
import LinkPanel from './components/LinkPanel';
import DeviceWindows, { type DeviceWindowHandlers } from './components/DeviceWindows';
import SimulationView from './components/SimulationView';

type Clipboard = { devices: Device[]; links: Link[]; annotations: Annotation[] };

export default function App() {
  const [mode, setMode] = useState<Mode>('design');
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const clipboardRef = useRef<Clipboard | null>(null);
  const [initial] = useState(() => loadTopology() ?? emptyTopology('Réseau'));
  const history = useHistory(initial);
  const topology = history.state;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const designWindows = useDeviceWindows();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [challengeResult, setChallengeResult] = useState<VerifyResult | null>(null);

  useAutosave(topology);
  useKeyboardShortcuts({
    onUndo: history.undo,
    onRedo: history.redo,
    onDelete: handleDelete,
    onCopy: handleCopy,
    onPaste: handlePaste,
    onEscape: () => {
      setSelection({ kind: 'none' });
    },
  });

  const selDeviceIds = selection.kind === 'items' ? selection.deviceIds : [];
  const selAnnIds = selection.kind === 'items' ? selection.annotationIds : [];
  const selectedCount = selDeviceIds.length + selAnnIds.length;
  // Un seul appareil (et rien d'autre) → indice de config ; une seule annotation → éditeur.
  const selectedDevice =
    selDeviceIds.length === 1 && selAnnIds.length === 0 ? findDevice(topology, selDeviceIds[0]) : null;
  const selectedAnnotation =
    selAnnIds.length === 1 && selDeviceIds.length === 0
      ? ((topology.annotations ?? []).find((a) => a.id === selAnnIds[0]) ?? null)
      : null;
  const selectedLink = selection.kind === 'link' ? (topology.links.find((l) => l.id === selection.id) ?? null) : null;

  // Tous les handlers de configuration/logiciels des fenêtres d'appareils (par id),
  // partagés par la Conception et la Simulation (mêmes mutations du document).
  const windowHandlers: DeviceWindowHandlers = {
    onInstallApp: (id, kind) => history.commit((t) => installApp(t, id, kind)),
    onUninstallApp: (id, kind) => history.commit((t) => uninstallApp(t, id, kind)),
    onSetDnsRecords: (id, records) => history.commit((t) => setDnsRecords(t, id, records)),
    onSetDnsRecursive: (id, rec) => history.commit((t) => setDnsRecursive(t, id, rec)),
    onSetWebPage: (id, page) => history.commit((t) => setWebPage(t, id, page)),
    onRename: (id, name) => history.commit((t) => setDeviceFields(t, id, { name })),
    onSetInterfaceIp: (id, ifId, ip) => history.commit((t) => updateInterface(t, id, ifId, { ip })),
    onSetInterfacePrefix: (id, ifId, prefix) => history.commit((t) => updateInterface(t, id, ifId, { prefix })),
    onSetGateway: (id, gateway) => history.commit((t) => setDeviceFields(t, id, { gateway })),
    onSetDns: (id, dns) => history.commit((t) => setDeviceFields(t, id, { dns })),
    onSetRoutes: (id, routes) => history.commit((t) => setDeviceRoutes(t, id, routes)),
    onSetRouting: (id, m) => history.commit((t) => setDeviceRouting(t, id, m)),
    onSetDhcp: (id, cfg) => history.commit((t) => setDeviceDhcp(t, id, cfg)),
    onSetNat: (id, cfg) => history.commit((t) => setDeviceNat(t, id, cfg)),
  };

  // ── Handlers d'édition (Conception) ──
  function handlePlace(kind: DeviceKind, x: number, y: number) {
    history.commit((t) => addDevice(t, createDevice(kind, x, y, nextDeviceName(t, kind))));
  }
  function handleMoveSelection(
    devices: { id: string; x: number; y: number }[],
    annotations: { id: string; x: number; y: number }[],
    commit: boolean,
  ) {
    (commit ? history.commit : history.set)((t) => moveAnnotationsTo(moveDevicesTo(t, devices), annotations));
  }
  function handleCreateLink(a: Endpoint, b: Endpoint) {
    history.commit((t) => addLink(t, a, b) ?? t);
  }

  function handleDelete() {
    if (selection.kind === 'items') {
      const { deviceIds, annotationIds } = selection;
      history.commit((t) => {
        let n = removeDevices(t, deviceIds);
        for (const id of annotationIds) n = removeAnnotation(n, id);
        return n;
      });
    } else if (selection.kind === 'link') {
      const id = selection.id;
      history.commit((t) => removeLink(t, id));
    } else {
      return;
    }
    setSelection({ kind: 'none' });
  }

  function handleCopy() {
    if (selection.kind !== 'items') return;
    const devSet = new Set(selection.deviceIds);
    const annSet = new Set(selection.annotationIds);
    const devices = topology.devices.filter((d) => devSet.has(d.id));
    const annotations = (topology.annotations ?? []).filter((a) => annSet.has(a.id));
    if (devices.length === 0 && annotations.length === 0) return;
    const links = topology.links.filter((l) => devSet.has(l.a.deviceId) && devSet.has(l.b.deviceId));
    clipboardRef.current = { devices, links, annotations };
  }
  function handlePaste() {
    const clip = clipboardRef.current;
    if (!clip) return;
    const { topo, newIds, newAnnotationIds } = pasteDevices(topology, clip, GRID, GRID);
    history.commit(topo);
    setSelection({ kind: 'items', deviceIds: newIds, annotationIds: newAnnotationIds });
  }

  function handleAddText(x: number, y: number) {
    const ann: Annotation = { id: uid('ann'), kind: 'text', x, y, text: 'Texte', color: TEXT_COLOR_DEFAULT, fontSize: TEXT_SIZE_DEFAULT };
    history.commit((t) => addAnnotation(t, ann));
    setSelection({ kind: 'items', deviceIds: [], annotationIds: [ann.id] });
  }
  function handleAddZone(x: number, y: number, w: number, h: number) {
    const ann: Annotation = { id: uid('ann'), kind: 'zone', x, y, w, h, color: ZONE_COLOR_DEFAULT };
    history.commit((t) => addAnnotation(t, ann));
    setSelection({ kind: 'items', deviceIds: [], annotationIds: [ann.id] });
  }
  function handleResizeZone(id: string, w: number, h: number, commit: boolean) {
    (commit ? history.commit : history.set)((t) => updateAnnotation(t, id, { w, h }));
  }

  function loadDocument(t: ReturnType<typeof deserialize>) {
    if (!t) {
      window.alert('Fichier de réseau invalide ou illisible.');
      return;
    }
    history.reset(t);
    setSelection({ kind: 'none' });
  }
  function handleSave() {
    downloadText(`${topology.name || 'reseau'}.json`, serialize(topology));
  }
  function handleOpenFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) readFileText(file).then((txt) => loadDocument(deserialize(txt)));
  }
  function loadChallenge(id: string) {
    const c = getChallenge(id);
    if (!c) return;
    history.reset(deserialize(JSON.stringify({ version: 1, topology: c.setup })) ?? c.setup);
    setSelection({ kind: 'none' });
    setMode('design');
    setChallenge(c);
    setChallengeResult(null);
  }

  return (
    <div className="flex h-full flex-col text-slate-800">
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleOpenFile} />
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <img src={networxTextSvg} alt="Networx" className="h-7" />
        <div className="ml-4 flex overflow-hidden rounded-md border border-slate-300 text-sm">
          <button
            type="button"
            onClick={() => setMode('design')}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${mode === 'design' ? 'bg-sky-600 text-white' : 'bg-white hover:bg-slate-50'}`}
          >
            <MousePointer2 size={15} /> Conception
          </button>
          <button
            type="button"
            onClick={() => setMode('simulation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 ${mode === 'simulation' ? 'bg-emerald-600 text-white' : 'bg-white hover:bg-slate-50'}`}
          >
            <Play size={15} /> Simulation
          </button>
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-sm text-slate-500">
          <Trophy size={15} className="text-amber-500" />
          <select
            value={challenge?.id ?? ''}
            onChange={(e) => (e.target.value ? loadChallenge(e.target.value) : setChallenge(null))}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Défis…</option>
            {CHALLENGES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {mode === 'design' ? (
        <>
          <Toolbar
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            onUndo={history.undo}
            onRedo={history.redo}
            hasSelection={selection.kind !== 'none'}
            onDelete={handleDelete}
            onSave={handleSave}
            onOpen={() => fileInputRef.current?.click()}
          />
          <div className="flex min-h-0 flex-1">
            <Palette />
            <main className="relative min-h-0 flex-1">
              <Canvas
                topology={topology}
                selection={selection}
                onPlaceDevice={handlePlace}
                onSelect={setSelection}
                onOpenDevice={designWindows.open}
                onMoveSelection={handleMoveSelection}
                onCreateLink={handleCreateLink}
                onAddText={handleAddText}
                onAddZone={handleAddZone}
                onResizeZone={handleResizeZone}
              />

              {/* Fenêtres d'appareils (configuration), sans moteur → Terminal/Navigateur grisés */}
              <DeviceWindows
                ids={designWindows.ids}
                deviceById={(id) => findDevice(topology, id)}
                onClose={designWindows.close}
                onFocus={designWindows.focus}
                handlers={windowHandlers}
              />

              {/* Petits éditeurs flottants pour les éléments qui ne sont pas des machines */}
              {selectedDevice && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full bg-slate-800/90 px-3 py-1 text-xs text-white shadow">
                  Double-cliquez {selectedDevice.name} pour le configurer
                </div>
              )}
              {selectedLink && (
                <div className="absolute right-3 top-3 z-30">
                  <LinkPanel
                    key={selectedLink.id}
                    link={selectedLink}
                    topology={topology}
                    onSetBandwidth={(bw) => history.commit((t) => setLinkBandwidth(t, selectedLink.id, bw))}
                    onDelete={handleDelete}
                  />
                </div>
              )}
              {selectedAnnotation && (
                <div className="absolute right-3 top-3 z-30">
                  <AnnotationPanel
                    key={selectedAnnotation.id}
                    annotation={selectedAnnotation}
                    onUpdate={(patch) => history.commit((t) => updateAnnotation(t, selectedAnnotation.id, patch))}
                    onDelete={handleDelete}
                  />
                </div>
              )}
              {selectedCount > 1 && (
                <div className="absolute right-3 top-3 z-30 flex w-60 flex-col gap-2 rounded-xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sélection</div>
                  <p className="text-sm text-slate-600">
                    {selDeviceIds.length > 0 && `${selDeviceIds.length} appareil${selDeviceIds.length > 1 ? 's' : ''}`}
                    {selDeviceIds.length > 0 && selAnnIds.length > 0 && ' + '}
                    {selAnnIds.length > 0 && `${selAnnIds.length} annotation${selAnnIds.length > 1 ? 's' : ''}`}
                    {' '}sélectionné{selectedCount > 1 ? 's' : ''}.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCopy} className="flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-sm hover:bg-slate-50">
                      <Copy size={15} /> Copier
                    </button>
                    <button type="button" onClick={handleDelete} className="flex items-center gap-1.5 rounded border border-rose-200 px-2.5 py-1.5 text-sm text-rose-600 hover:bg-rose-50">
                      <Trash2 size={15} /> Supprimer
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">Ctrl+C / Ctrl+V pour dupliquer, Maj+clic pour ajuster.</p>
                </div>
              )}
            </main>
          </div>
        </>
          ) : (
            <SimulationView topology={topology} windowHandlers={windowHandlers} />
          )}
        </div>
        {challenge && (
          <ChallengePanel
            key={challenge.id}
            challenge={challenge}
            result={challengeResult}
            onVerify={() => setChallengeResult(verifyGoal(topology, challenge.goal))}
            onClose={() => {
              setChallenge(null);
              setChallengeResult(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
