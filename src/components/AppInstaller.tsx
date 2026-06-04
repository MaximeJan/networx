// Installateur de logiciels : liste le catalogue, avec installer/désinstaller.
// Le Terminal est un logiciel système (toujours présent).

import type { AppKind, Device } from '../domain/types';
import { APP_ORDER, getAppDef } from '../devices/apps';

interface Props {
  device: Device;
  onInstall: (kind: AppKind) => void;
  onUninstall: (kind: AppKind) => void;
}

export default function AppInstaller({ device, onInstall, onUninstall }: Props) {
  const installed = new Set((device.apps ?? []).map((a) => a.kind));

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-3">
      <div className="mb-2 text-xs text-slate-400">Installateur de logiciels</div>
      <div className="space-y-1.5">
        {APP_ORDER.map((kind) => {
          const def = getAppDef(kind);
          const Icon = def.icon;
          const isInstalled = installed.has(kind);
          return (
            <div key={kind} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
              <Icon size={22} className="shrink-0 text-slate-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {def.label}
                  {!def.available && (
                    <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-700">à venir</span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-400">{def.description}</div>
              </div>
              {def.system ? (
                <span className="shrink-0 text-xs text-slate-400">système</span>
              ) : isInstalled ? (
                <button
                  type="button"
                  onClick={() => onUninstall(kind)}
                  className="shrink-0 rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  Désinstaller
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onInstall(kind)}
                  className="shrink-0 rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-700"
                >
                  Installer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
