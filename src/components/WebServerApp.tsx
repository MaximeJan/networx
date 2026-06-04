// Application Serveur web : édite la page HTML servie (persistée dans le document).

import type { Device } from '../domain/types';

interface Props {
  device: Device;
  onSetPage: (page: string) => void;
}

const DEFAULT = '<h1>Bienvenue !</h1>\n<p>Cette page est servie par un serveur web Networx.</p>';

export default function WebServerApp({ device, onSetPage }: Props) {
  const page = device.apps?.find((a) => a.kind === 'web-server')?.page ?? '';
  const ip = device.interfaces.find((i) => i.ip)?.ip;

  return (
    <div className="flex h-full flex-col bg-white p-3">
      <div className="mb-1 text-xs text-slate-400">
        Serveur web — page servie {ip ? `sur http://${ip}/` : '(configurez une IP)'}
      </div>
      <textarea
        value={page}
        onChange={(e) => onSetPage(e.target.value)}
        spellCheck={false}
        placeholder={DEFAULT}
        className="min-h-0 flex-1 resize-none rounded border border-slate-300 p-2 font-mono text-xs"
      />
      <p className="mt-1 text-[11px] text-slate-400">
        Astuce : du HTML simple (&lt;h1&gt;, &lt;p&gt;, &lt;a&gt;…). Vide = page par défaut.
      </p>
    </div>
  );
}
