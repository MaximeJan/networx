import { Type, SquareDashedBottom } from 'lucide-react';
import type { AnnotationTool } from '../domain/types';
import { DEVICE_ORDER, getDeviceDef } from '../devices/registry';

/** Type MIME interne pour le glisser-déposer d'un appareil sur le canevas. */
export const DEVICE_DND_TYPE = 'application/x-networx-kind';

interface Props {
  tool: AnnotationTool | null;
  onSelectTool: (tool: AnnotationTool | null) => void;
}

export default function Palette({ tool, onSelectTool }: Props) {
  return (
    <div className="flex w-44 flex-col gap-1 border-r border-slate-200 bg-white p-2">
      <div className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Appareils
      </div>
      {DEVICE_ORDER.map((kind) => {
        const def = getDeviceDef(kind);
        const Icon = def.icon;
        return (
          <div
            key={kind}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DEVICE_DND_TYPE, kind);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            className="flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-sm hover:bg-slate-50 active:cursor-grabbing"
          >
            <Icon size={20} color={def.color} />
            <span>{def.label}</span>
          </div>
        );
      })}
      <p className="mt-1 px-1 text-xs leading-snug text-slate-400">
        Glissez un appareil sur le canevas pour le placer.
      </p>

      <div className="mt-3 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Annotations
      </div>
      <ToolButton
        icon={<Type size={20} className="text-slate-600" />}
        label="Zone de texte"
        active={tool === 'text'}
        onClick={() => onSelectTool(tool === 'text' ? null : 'text')}
      />
      <ToolButton
        icon={<SquareDashedBottom size={20} className="text-slate-600" />}
        label="Zone colorée"
        active={tool === 'zone'}
        onClick={() => onSelectTool(tool === 'zone' ? null : 'zone')}
      />
      <p className="mt-1 px-1 text-xs leading-snug text-slate-400">
        {tool === 'text'
          ? 'Cliquez sur le plan pour poser une étiquette.'
          : tool === 'zone'
            ? 'Tracez un rectangle sur le plan (glisser).'
            : 'Choisissez un outil puis dessinez sur le plan.'}
      </p>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left text-sm ${
        active ? 'border-sky-400 bg-sky-50 text-sky-700' : 'border-transparent hover:bg-slate-50'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
