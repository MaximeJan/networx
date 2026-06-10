// Application Navigateur web, avec un vrai chrome de navigateur : onglet (titre =
// hôte de la page), boutons Précédente / Recharger, champ d'adresse, barre de
// progression pendant le chargement et barre d'état. La requête (résolution DNS
// éventuelle + TCP + HTTP) est lancée par le moteur ; on suit le journal pour
// afficher la page (ou une erreur / un délai dépassé).

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Globe, RotateCw } from 'lucide-react';
import type { Device } from '../domain/types';
import { diagnoseFailure } from '../lib/diagnose';
import type { SimEngine } from '../hooks/useSimulationEngine';

interface Props {
  device: Device;
  engine: SimEngine;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

/** Hôte d'une URL (sans schéma ni chemin), pour le titre de l'onglet. */
function hostOf(url: string): string {
  const noScheme = url.replace(/^https?:\/\//i, '');
  const slash = noScheme.indexOf('/');
  return slash === -1 ? noScheme : noScheme.slice(0, slash);
}

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
  // Historique de navigation (bouton Précédente).
  const histRef = useRef<string[]>([]);

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

  /** Lance la navigation vers `target` (en mémorisant l'URL quittée pour Précédente). */
  function navigate(target: string, remember = true) {
    if (remember && urlRef.current !== target && status !== 'idle') {
      histRef.current.push(urlRef.current);
      if (histRef.current.length > 20) histRef.current.shift();
    }
    const reqId = reqRef.current++;
    pendingRef.current = reqId;
    startRef.current = engine.world.tick;
    urlRef.current = target;
    setUrl(target);
    setStatus('loading');
    setPage(null);
    engine.httpGet(device.id, target, reqId);
  }

  function go(e: React.FormEvent) {
    e.preventDefault();
    navigate(url);
  }
  function goBack() {
    const prev = histRef.current.pop();
    if (prev) navigate(prev, false);
  }
  function reload() {
    if (status !== 'idle') navigate(urlRef.current, false);
  }

  const tabTitle = status === 'idle' ? 'Nouvel onglet' : hostOf(urlRef.current) || 'Page';
  const statusText =
    status === 'loading'
      ? `Chargement de ${urlRef.current}…`
      : status === 'done'
        ? 'Terminé'
        : status === 'error'
          ? 'Échec du chargement'
          : 'Prêt';

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Bandeau d'onglet */}
      <div className="flex items-end gap-1 bg-slate-200 px-1.5 pt-1">
        <div className="flex max-w-[180px] items-center gap-1.5 rounded-t-lg bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
          {status === 'loading' ? (
            <RotateCw size={11} className="shrink-0 animate-spin text-sky-600" />
          ) : (
            <Globe size={11} className="shrink-0 text-slate-400" />
          )}
          <span className="truncate">{tabTitle}</span>
        </div>
      </div>

      {/* Barre d'outils : Précédente · Recharger · adresse · Aller */}
      <form onSubmit={go} className="flex items-center gap-1 border-b border-slate-200 bg-white p-1.5">
        <button
          type="button"
          onClick={goBack}
          disabled={histRef.current.length === 0}
          className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          title="Page précédente"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          onClick={reload}
          disabled={status === 'idle' || status === 'loading'}
          className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          title="Recharger la page"
        >
          <RotateCw size={14} />
        </button>
        <div className="flex flex-1 items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 focus-within:border-sky-400 focus-within:bg-white">
          <Globe size={12} className="shrink-0 text-slate-400" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            spellCheck={false}
            className="w-full bg-transparent text-xs outline-none"
            placeholder="http://exemple.local/"
          />
        </div>
        <button type="submit" className="rounded-full bg-sky-600 p-1.5 text-white hover:bg-sky-700" aria-label="Aller">
          <ArrowRight size={14} />
        </button>
      </form>

      {/* Barre de progression (indéterminée) pendant le chargement */}
      <div className="h-0.5 overflow-hidden bg-slate-100">
        {status === 'loading' && (
          <div className="h-full w-1/3 animate-[browser-progress_1s_ease-in-out_infinite] rounded-full bg-sky-500" />
        )}
      </div>
      <style>{`@keyframes browser-progress { 0% { margin-left: -33% } 100% { margin-left: 100% } }`}</style>

      {/* Contenu de la page */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {status === 'idle' && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Globe size={32} className="text-slate-300" />
            <p className="text-slate-400">Saisissez une adresse puis validez.</p>
          </div>
        )}
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

      {/* Barre d'état */}
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400">
        <span className="truncate">{statusText}</span>
        {status === 'done' && page !== null && <span className="shrink-0 font-mono">{page.length} octets</span>}
      </div>
    </div>
  );
}
