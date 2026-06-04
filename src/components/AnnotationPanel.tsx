// Panneau de droite pour éditer une annotation sélectionnée (texte ou zone).

import { Trash2 } from 'lucide-react';
import type { Annotation } from '../domain/types';
import { ANNOTATION_COLORS, TEXT_SIZE_DEFAULT } from '../lib/constants';

interface Patch {
  text?: string;
  color?: string;
  fontSize?: number;
  label?: string;
}

interface Props {
  annotation: Annotation;
  onUpdate: (patch: Patch) => void;
  onDelete: () => void;
}

const labelCls = 'block text-xs font-medium text-slate-500';
const inputBase = 'mt-0.5 w-full rounded border border-slate-300 px-2 py-1 text-sm';

export default function AnnotationPanel({ annotation: a, onUpdate, onDelete }: Props) {
  return (
    <div className="flex w-64 flex-col gap-3 rounded-xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {a.kind === 'text' ? 'Étiquette de texte' : 'Zone'}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-rose-600 hover:bg-rose-50"
          title="Supprimer (Suppr)"
        >
          <Trash2 size={14} /> Supprimer
        </button>
      </div>

      {a.kind === 'text' ? (
        <>
          <label className="block">
            <span className={labelCls}>Texte</span>
            <textarea
              value={a.text}
              rows={2}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className={`${inputBase} resize-none`}
            />
          </label>
          <div>
            <span className={labelCls}>Taille</span>
            <div className="mt-1 flex gap-1">
              {[
                { lbl: 'S', px: 13 },
                { lbl: 'M', px: TEXT_SIZE_DEFAULT },
                { lbl: 'L', px: 22 },
                { lbl: 'XL', px: 30 },
              ].map((s) => (
                <button
                  key={s.lbl}
                  type="button"
                  onClick={() => onUpdate({ fontSize: s.px })}
                  className={`flex-1 rounded border px-2 py-1 text-xs ${
                    a.fontSize === s.px ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {s.lbl}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <label className="block">
          <span className={labelCls}>Nom de la zone</span>
          <input
            type="text"
            value={a.label ?? ''}
            placeholder="ex. Réseau local"
            onChange={(e) => onUpdate({ label: e.target.value })}
            className={inputBase}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Redimensionnez la zone par la poignée en bas à droite.
          </p>
        </label>
      )}

      <div>
        <span className={labelCls}>Couleur</span>
        <div className="mt-1 flex gap-1.5">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onUpdate({ color: c })}
              className={`h-6 w-6 rounded-full ring-2 ring-offset-1 ${a.color === c ? 'ring-slate-500' : 'ring-transparent'}`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
