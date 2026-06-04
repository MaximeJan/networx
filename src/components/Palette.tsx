import { Type, SquareDashedBottom } from 'lucide-react';
import type { AnnotationTool } from '../domain/types';
import { DEVICE_ORDER, getDeviceDef } from '../devices/registry';

/** Type MIME interne pour le glisser-déposer d'un appareil sur le canevas. */
export const DEVICE_DND_TYPE = 'application/x-networx-kind';
/** Type MIME interne pour le glisser-déposer d'une annotation (texte / zone). */
export const ANNOTATION_DND_TYPE = 'application/x-networx-annotation';

const ANNOTATIONS: { tool: AnnotationTool; label: string; Icon: typeof Type }[] = [
  { tool: 'text', label: 'Zone de texte', Icon: Type },
  { tool: 'zone', label: 'Zone colorée', Icon: SquareDashedBottom },
];

const itemCls =
  'flex cursor-grab items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-sm hover:bg-slate-50 active:cursor-grabbing';

export default function Palette() {
  return (
    <div className="flex w-44 flex-col gap-1 border-r border-slate-200 bg-white p-2">
      <div className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Appareils</div>
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
            className={itemCls}
          >
            <Icon size={20} color={def.color} />
            <span>{def.label}</span>
          </div>
        );
      })}

      <div className="mt-3 px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Annotations</div>
      {ANNOTATIONS.map(({ tool, label, Icon }) => (
        <div
          key={tool}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(ANNOTATION_DND_TYPE, tool);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          className={itemCls}
        >
          <Icon size={20} className="text-slate-600" />
          <span>{label}</span>
        </div>
      ))}

      <p className="mt-1 px-1 text-xs leading-snug text-slate-400">
        Glissez un appareil ou une annotation sur le plan.
      </p>
    </div>
  );
}
