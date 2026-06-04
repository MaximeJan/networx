// Panneau latéral droit du défi en cours : mise en situation (présentation du
// réseau), objectif clair, puis un dépliant « Besoin d'aide ? » avec les
// indications (repliées par défaut). Bouton « Vérifier » + résultat.

import { useState } from 'react';
import { Trophy, Target, CheckCircle2, XCircle, X, ChevronRight } from 'lucide-react';
import type { Challenge } from '../challenges';
import type { VerifyResult } from '../lib/challenge';

interface Props {
  challenge: Challenge;
  result: VerifyResult | null;
  onVerify: () => void;
  onClose: () => void;
}

export default function ChallengePanel({ challenge, result, onVerify, onClose }: Props) {
  const [showHints, setShowHints] = useState(false);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {/* En-tête */}
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
        <Trophy size={16} className="shrink-0 text-amber-500" />
        <span className="flex-1 truncate text-sm font-semibold text-amber-900">{challenge.title}</span>
        <button
          type="button"
          onClick={onClose}
          title="Quitter le défi"
          className="shrink-0 rounded p-1 text-amber-500 hover:bg-amber-100"
        >
          <X size={16} />
        </button>
      </div>

      {/* Contenu défilable */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {/* Mise en situation */}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Mise en situation</div>
          <p className="leading-relaxed text-slate-600">{challenge.intro}</p>
        </div>

        {/* Objectif */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <Target size={13} /> Objectif
          </div>
          <p className="mt-1 text-amber-900">{challenge.goalText}</p>
        </div>

        {/* Dépliant d'indications */}
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setShowHints((s) => !s)}
            className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <ChevronRight size={15} className={`shrink-0 transition-transform ${showHints ? 'rotate-90' : ''}`} />
            Besoin d'aide ?
            <span className="ml-auto text-xs font-normal text-slate-400">{challenge.steps.length} indications</span>
          </button>
          {showHints && (
            <ol className="space-y-1.5 border-t border-slate-200 px-3 py-2.5">
              {challenge.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold leading-none text-white">
                    {i + 1}
                  </span>
                  <span className="text-slate-600">{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Résultat de la vérification */}
        {result && (
          <p
            className={`flex items-start gap-1.5 rounded-lg p-2 text-sm font-medium ${
              result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <span>{result.message}</span>
          </p>
        )}
      </div>

      {/* Pied : vérification */}
      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={onVerify}
          className="w-full rounded-md bg-amber-500 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          Vérifier
        </button>
      </div>
    </aside>
  );
}
