// Bandeau du défi en cours : contexte, étapes numérotées, objectif, vérification.

import { CheckCircle2, XCircle, Trophy, Target, X } from 'lucide-react';
import type { Challenge } from '../challenges';
import type { VerifyResult } from '../lib/challenge';

interface Props {
  challenge: Challenge;
  result: VerifyResult | null;
  onVerify: () => void;
  onClose: () => void;
}

export default function ChallengeBanner({ challenge, result, onVerify, onClose }: Props) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <Trophy size={18} className="mt-0.5 shrink-0 text-amber-500" />

        <div className="min-w-0 flex-1">
          <div className="font-semibold">{challenge.title}</div>
          <p className="mt-0.5 text-amber-800">{challenge.intro}</p>

          {/* Étapes numérotées */}
          <ol className="mt-2 space-y-1">
            {challenge.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold leading-none text-white">
                  {i + 1}
                </span>
                <span className="text-amber-800">{step}</span>
              </li>
            ))}
          </ol>

          {/* Objectif */}
          <p className="mt-2 flex items-center gap-1.5 rounded bg-amber-100/70 px-2 py-1 text-xs font-medium text-amber-800">
            <Target size={13} className="shrink-0 text-amber-600" />
            <span>
              <span className="text-amber-600">Objectif :</span> {challenge.goalText}
            </span>
          </p>

          {/* Résultat de la vérification */}
          {result && (
            <p
              className={`mt-1.5 flex items-center gap-1.5 font-medium ${
                result.ok ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {result.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
              {result.message}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onVerify}
          className="shrink-0 rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
        >
          Vérifier
        </button>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-amber-500 hover:bg-amber-100"
          aria-label="Quitter le défi"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
