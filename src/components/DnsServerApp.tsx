// Application Serveur DNS : table d'enregistrements (A / CNAME / NS) + mode de
// résolution (récursif ou itératif). Tout est persisté dans le document.

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Device, DnsRecord, DnsRecordType } from '../domain/types';
import { isValidIp } from '../lib/ip';

interface Props {
  device: Device;
  onSetRecords: (records: DnsRecord[]) => void;
  onSetRecursive: (recursive: boolean) => void;
}

const TYPE_HELP: Record<DnsRecordType, string> = {
  A: 'nom → adresse IP',
  CNAME: 'alias → nom canonique',
  NS: 'zone → IP du serveur DNS délégué',
};
const valuePlaceholder: Record<DnsRecordType, string> = {
  A: '192.168.1.20',
  CNAME: 'serveur.local',
  NS: '192.168.2.53',
};

export default function DnsServerApp({ device, onSetRecords, onSetRecursive }: Props) {
  const app = device.apps?.find((a) => a.kind === 'dns-server');
  const records = app?.records ?? [];
  const recursive = app?.recursive ?? false;

  const [type, setType] = useState<DnsRecordType>('A');
  const [name, setName] = useState('');
  const [value, setValue] = useState('');

  const valueOk = type === 'CNAME' ? value.trim() !== '' : isValidIp(value);
  const canAdd = name.trim() !== '' && valueOk && !records.some((r) => r.name === name.trim() && r.type === type);

  function add() {
    if (!canAdd) return;
    onSetRecords([...records, { type, name: name.trim(), value: value.trim() }]);
    setName('');
    setValue('');
  }

  return (
    <div className="h-full overflow-y-auto bg-white p-3">
      <div className="mb-2 text-xs text-slate-400">Serveur DNS — enregistrements et résolution</div>

      <label className="mb-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={recursive} onChange={(e) => onSetRecursive(e.target.checked)} />
        Résolution récursive
        <span className="text-xs text-slate-400">{recursive ? '(résout les délégations lui-même)' : '(renvoie une référence — itératif)'}</span>
      </label>

      {records.length === 0 ? (
        <p className="mb-2 text-xs text-slate-400">Aucun enregistrement.</p>
      ) : (
        <table className="mb-2 w-full text-left text-xs">
          <thead className="text-slate-400">
            <tr>
              <th className="font-medium">Type</th>
              <th className="font-medium">Nom</th>
              <th className="font-medium">Valeur</th>
              <th />
            </tr>
          </thead>
          <tbody className="font-mono">
            {records.map((r, i) => (
              <tr key={`${r.type}-${r.name}-${i}`}>
                <td className="pr-2 font-semibold text-slate-600">{r.type}</td>
                <td className="pr-2">{r.name}</td>
                <td>{r.value}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => onSetRecords(records.filter((x) => x !== r))}
                    className="text-rose-500 hover:text-rose-700"
                    aria-label={`Supprimer ${r.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-2">
        <div className="flex gap-1.5">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DnsRecordType)}
            className="rounded border border-slate-300 px-1.5 py-1 text-xs"
          >
            <option value="A">A</option>
            <option value="CNAME">CNAME</option>
            <option value="NS">NS</option>
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={type === 'NS' ? 'zone (ex. local)' : 'nom (ex. web.local)'}
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
          />
        </div>
        <div className="flex gap-1.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={valuePlaceholder[type]}
            spellCheck={false}
            className={`min-w-0 flex-1 rounded border px-2 py-1 font-mono text-xs ${
              value === '' || valueOk ? 'border-slate-300' : 'border-rose-400 bg-rose-50'
            }`}
          />
          <button
            type="button"
            disabled={!canAdd}
            onClick={add}
            className="rounded bg-sky-600 px-3 py-1 text-xs text-white disabled:opacity-40"
          >
            Ajouter
          </button>
        </div>
        <p className="text-[11px] text-slate-400">{type} : {TYPE_HELP[type]}</p>
      </div>
    </div>
  );
}
