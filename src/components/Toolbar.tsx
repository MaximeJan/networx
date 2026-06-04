import { Undo2, Redo2, Trash2, Download, FolderOpen } from 'lucide-react';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  hasSelection: boolean;
  onDelete: () => void;
  onSave: () => void;
  onOpen: () => void;
}

export default function Toolbar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  hasSelection,
  onDelete,
  onSave,
  onOpen,
}: Props) {
  const btn = 'flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm disabled:opacity-40';
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-3 py-1.5">
      <button type="button" className={`${btn} hover:bg-slate-100`} onClick={onUndo} disabled={!canUndo} title="Annuler (Ctrl+Z)">
        <Undo2 size={16} />
      </button>
      <button type="button" className={`${btn} hover:bg-slate-100`} onClick={onRedo} disabled={!canRedo} title="Rétablir (Ctrl+Y)">
        <Redo2 size={16} />
      </button>
      <button
        type="button"
        className={`${btn} text-rose-600 hover:bg-rose-50`}
        onClick={onDelete}
        disabled={!hasSelection}
        title="Supprimer la sélection (Suppr)"
      >
        <Trash2 size={16} /> Supprimer
      </button>

      <span className="mx-1 h-5 w-px bg-slate-200" />

      <button type="button" className={`${btn} hover:bg-slate-100`} onClick={onOpen} title="Ouvrir un réseau (.json)">
        <FolderOpen size={16} /> Ouvrir
      </button>
      <button type="button" className={`${btn} hover:bg-slate-100`} onClick={onSave} title="Enregistrer le réseau (.json)">
        <Download size={16} /> Enregistrer
      </button>

      <span className="ml-auto text-xs text-slate-400">
        Glissez un appareil depuis la palette · cliquez un port puis un autre pour câbler.
      </span>
    </div>
  );
}
