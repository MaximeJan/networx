// Contrôles de vue en surimpression (coin bas-droit des canevas) : zoom −/+,
// pourcentage (clic → 100 %), et « cadrer la vue » sur le contenu. Donne un
// accès visible au zoom/pan, sinon réservés à la molette (gestes peu connus).

import { Maximize, Minus, Plus } from 'lucide-react';

interface Props {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onReset: () => void;
}

const btn =
  'flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700';

export default function ViewportControls({ scale, onZoomIn, onZoomOut, onFit, onReset }: Props) {
  return (
    <div className="absolute bottom-3 right-3 z-20 flex items-center overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-black/10">
      <button type="button" className={btn} onClick={onZoomOut} title="Zoom arrière (molette)">
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="h-7 min-w-12 px-1 font-mono text-[11px] text-slate-500 hover:bg-slate-100"
        onClick={onReset}
        title="Revenir à 100 %"
      >
        {Math.round(scale * 100)} %
      </button>
      <button type="button" className={btn} onClick={onZoomIn} title="Zoom avant (molette)">
        <Plus size={14} />
      </button>
      <span className="h-4 w-px bg-slate-200" />
      <button type="button" className={btn} onClick={onFit} title="Cadrer la vue sur le réseau">
        <Maximize size={14} />
      </button>
    </div>
  );
}
