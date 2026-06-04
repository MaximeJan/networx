// Application Navigateur web : barre d'adresse + affichage de la page récupérée.
// La requête (résolution DNS éventuelle + TCP + HTTP) est lancée par le moteur ;
// on suit le journal pour afficher la page (ou une erreur / un délai dépassé).

import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Device } from '../domain/types';
import { diagnoseFailure } from '../lib/diagnose';
import type { SimEngine } from '../hooks/useSimulationEngine';

interface Props {
  device: Device;
  engine: SimEngine;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function WebBrowserApp({ device, engine }: Props) {
  const [url, setUrl] = useState('http://web.local/');
  const [status, setStatus] = useState<Status>('idle');
  const [page, setPage] = useState<string | null>(null);
  const reqRef = useRef(1);
  const pendingRef = useRef<number | null>(null);
  const seenRef = useRef(0);
  // Pour le diagnostic d'échec : date de départ + URL réellement demandée.
  const startRef = useRef(0);
  const urlRef = useRef(url);

  useEffect(() => {
    const log = engine.world.log;
    for (let i = seenRef.current; i < log.length; i++) {
      const e = log[i];
      if (e.deviceId !== device.id || e.seq === undefined || e.seq !== pendingRef.current) continue;
      if (e.tag === 'http' && e.body !== undefined) {
        setPage(e.body);
        setStatus('done');
        pendingRef.current = null;
      } else if (e.tag === 'dns' && /introuvable/.test(e.message)) {
        setPage(`Nom introuvable (DNS) : ${e.message}`);
        setStatus('error');
        pendingRef.current = null;
      } else if (e.tag === 'drop' && /aucun serveur DNS/.test(e.message)) {
        setPage('Aucun serveur DNS configuré sur cette machine.');
        setStatus('error');
        pendingRef.current = null;
      }
    }
    seenRef.current = log.length;
  }, [engine.world.log, device.id]);

  // Au repos sans réponse → échec, accompagné d'un diagnostic pédagogique.
  useEffect(() => {
    if (engine.busy || pendingRef.current === null) return;
    pendingRef.current = null;
    const diag = diagnoseFailure({
      world: engine.world,
      deviceId: device.id,
      kind: 'http',
      target: urlRef.current,
      sinceTick: startRef.current,
    });
    setStatus('error');
    setPage(['Impossible de charger la page.', ...diag].join('\n'));
    // `engine.world`/`device.id` sont lus pour le diagnostic ; le garde `engine.busy`
    // n'agit qu'au repos.
  }, [engine.busy, engine.world, device.id]);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const reqId = reqRef.current++;
    pendingRef.current = reqId;
    startRef.current = engine.world.tick;
    urlRef.current = url;
    setStatus('loading');
    setPage(null);
    engine.httpGet(device.id, url, reqId);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <form onSubmit={go} className="flex items-center gap-1 border-b border-slate-200 bg-slate-100 p-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          className="flex-1 rounded-full border border-slate-300 px-3 py-1 text-xs"
          placeholder="http://exemple.local/"
        />
        <button type="submit" className="rounded-full bg-sky-600 p-1.5 text-white hover:bg-sky-700" aria-label="Aller">
          <ArrowRight size={14} />
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {status === 'idle' && <p className="text-slate-400">Saisissez une adresse puis validez.</p>}
        {status === 'loading' && <p className="text-slate-400">Chargement…</p>}
        {status === 'error' && <p className="whitespace-pre-line text-rose-600">{page}</p>}
        {status === 'done' && page !== null && (
          <div
            className="leading-relaxed [&_a]:text-sky-600 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-1"
            // Contenu local rédigé par l'utilisateur (serveur web de la simulation).
            dangerouslySetInnerHTML={{ __html: page }}
          />
        )}
      </div>
    </div>
  );
}
