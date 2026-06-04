// Éditeurs de configuration réseau réutilisables (panneau de Conception ET fenêtre
// d'administration du routeur en Simulation). Chaque section est PRÉSENTATIONNELLE :
// elle gère son état de saisie local et délègue les mutations via des callbacks.

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Device, DhcpConfig, InterfaceId, Ip, NatConfig, PortForward, Route, RoutingMode } from '../domain/types';
import { isValidIp, isValidPrefix, maskToPrefix, networkAddress, prefixToMask, sameSubnet } from '../lib/ip';

const labelCls = 'block text-xs font-medium text-slate-500';
const inputBase = 'mt-0.5 w-full rounded border px-2 py-1 text-sm font-mono';

/** Champ texte validé : bordure rose tant que la valeur saisie est invalide. */
export function Field({
  label,
  value,
  placeholder,
  valid,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  valid: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} ${valid ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`}
      />
    </label>
  );
}

/** Adresses des interfaces + passerelle par défaut + serveur DNS de l'appareil. */
export function InterfacesSection({
  device,
  onSetInterfaceIp,
  onSetInterfacePrefix,
  onSetGateway,
  onSetDns,
}: {
  device: Device;
  onSetInterfaceIp: (ifId: InterfaceId, ip: Ip | undefined) => void;
  onSetInterfacePrefix: (ifId: InterfaceId, prefix: number | undefined) => void;
  onSetGateway: (ip: Ip | undefined) => void;
  onSetDns: (ip: Ip | undefined) => void;
}) {
  const [gateway, setGateway] = useState(device.gateway ?? '');
  const [dns, setDns] = useState(device.dns ?? '');
  const [ips, setIps] = useState<Record<string, string>>(() =>
    Object.fromEntries(device.interfaces.map((i) => [i.id, i.ip ?? ''])),
  );
  const [masks, setMasks] = useState<Record<string, string>>(() =>
    Object.fromEntries(device.interfaces.map((i) => [i.id, i.prefix === undefined ? '' : prefixToMask(i.prefix)])),
  );
  const ipValid = (v: string) => v === '' || isValidIp(v);

  function changeGateway(v: string) {
    setGateway(v);
    if (ipValid(v)) onSetGateway(v === '' ? undefined : v);
  }
  function changeDns(v: string) {
    setDns(v);
    if (ipValid(v)) onSetDns(v === '' ? undefined : v);
  }
  function changeIp(id: InterfaceId, v: string) {
    setIps((m) => ({ ...m, [id]: v }));
    if (ipValid(v)) onSetInterfaceIp(id, v === '' ? undefined : v);
  }
  function changeMask(id: InterfaceId, v: string) {
    setMasks((m) => ({ ...m, [id]: v }));
    if (v === '') onSetInterfacePrefix(id, undefined);
    else {
      const p = maskToPrefix(v);
      if (p !== null) onSetInterfacePrefix(id, p);
    }
  }

  return (
    <div className="space-y-2">
      {device.interfaces.map((itf) => (
        <div key={itf.id} className="rounded-md border border-slate-200 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium">{itf.name}</span>
            <span className={`text-xs ${itf.linkId ? 'text-emerald-600' : 'text-slate-400'}`}>
              {itf.linkId ? 'connectée' : 'libre'}
            </span>
          </div>
          <div className="mb-1.5 font-mono text-xs text-slate-400">{itf.mac}</div>
          <div className="space-y-1.5">
            <Field label="Adresse IP" value={ips[itf.id] ?? ''} placeholder="192.168.1.10" valid={ipValid(ips[itf.id] ?? '')} onChange={(v) => changeIp(itf.id, v)} />
            <Field
              label="Masque de sous-réseau"
              value={masks[itf.id] ?? ''}
              placeholder="255.255.255.0"
              valid={(masks[itf.id] ?? '') === '' || maskToPrefix(masks[itf.id] ?? '') !== null}
              onChange={(v) => changeMask(itf.id, v)}
            />
          </div>
        </div>
      ))}
      <Field label="Passerelle par défaut" value={gateway} placeholder="192.168.1.1" valid={ipValid(gateway)} onChange={changeGateway} />
      <Field label="Serveur DNS" value={dns} placeholder="192.168.1.1" valid={ipValid(dns)} onChange={changeDns} />
    </div>
  );
}

/** Table de routage : choix du protocole + routes statiques (destination/préfixe → passerelle). */
export function RoutesSection({
  device,
  onSetRoutes,
  onSetRouting,
}: {
  device: Device;
  onSetRoutes: (routes: Route[]) => void;
  onSetRouting?: (mode: RoutingMode) => void;
}) {
  const routes = device.routes ?? [];
  const routing = device.routing ?? 'static';
  const [dest, setDest] = useState('');
  const [prefix, setPrefix] = useState('24');
  const [gateway, setGateway] = useState('');

  const pfx = Number(prefix);
  const ifName = (id: InterfaceId) => device.interfaces.find((i) => i.id === id)?.name ?? id;
  const egress = isValidIp(gateway)
    ? device.interfaces.find((i) => i.ip && i.prefix !== undefined && sameSubnet(gateway, i.ip, i.prefix))
    : undefined;
  const dup = routes.some((r) => r.destination === dest && r.prefix === pfx);
  const canAdd = isValidIp(dest) && isValidPrefix(pfx) && isValidIp(gateway) && !!egress && !dup;

  function add() {
    if (!canAdd || !egress) return;
    const route: Route = { destination: networkAddress(dest, pfx), prefix: pfx, gateway, interfaceId: egress.id };
    onSetRoutes([...routes, route]);
    setDest('');
    setGateway('');
  }
  function remove(i: number) {
    onSetRoutes(routes.filter((_, idx) => idx !== i));
  }

  return (
    <div className="rounded-md border border-slate-200 p-2">
      {onSetRouting && (
        <label className="mb-2 block">
          <span className={labelCls}>Protocole de routage</span>
          <select
            value={routing}
            onChange={(e) => onSetRouting(e.target.value as RoutingMode)}
            className={`${inputBase} border-slate-300`}
          >
            <option value="static">Statique (routes manuelles)</option>
            <option value="rip">RIP — métrique : nombre de sauts</option>
            <option value="ospf">OSPF — métrique : bande passante</option>
          </select>
        </label>
      )}
      {routing !== 'static' && (
        <p className="mb-2 rounded bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">
          Routes apprises automatiquement par {routing.toUpperCase()}. Tapez « route » dans le terminal pour les voir.
        </p>
      )}
      <div className={`${labelCls} mb-1`}>Routes statiques</div>
      {routes.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Aucune route statique. Le routeur ne connaît que ses réseaux directs et sa passerelle par défaut.
        </p>
      )}
      {routes.map((r, i) => (
        <div key={i} className="flex items-center gap-1 py-0.5 font-mono text-[11px] text-slate-600">
          <span className="flex-1">
            {r.destination}/{r.prefix} → {r.gateway ?? 'direct'} <span className="text-slate-400">({ifName(r.interfaceId)})</span>
          </span>
          <button type="button" onClick={() => remove(i)} className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Supprimer la route">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div className="mt-1 space-y-1">
        <div className="flex gap-1">
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Réseau (192.168.3.0)" className={`${inputBase} mt-0 flex-1 ${dest === '' || isValidIp(dest) ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`} />
          <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="/24" className={`${inputBase} mt-0 w-14 ${isValidPrefix(pfx) ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`} />
        </div>
        <input value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="Passerelle (10.0.13.2)" className={`${inputBase} mt-0 ${gateway === '' || (isValidIp(gateway) && !!egress) ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`} />
        {isValidIp(gateway) && !egress && (
          <p className="text-[11px] text-rose-600">Passerelle injoignable : aucune interface sur ce sous-réseau.</p>
        )}
        <button type="button" disabled={!canAdd} onClick={add} className="w-full rounded bg-sky-600 px-2 py-1 text-xs text-white disabled:opacity-40">
          Ajouter la route
        </button>
      </div>
    </div>
  );
}

/** Serveur DHCP activable sur un routeur. */
export function DhcpSection({ device, onSetDhcp }: { device: Device; onSetDhcp: (cfg: DhcpConfig | undefined) => void }) {
  const [enabled, setEnabled] = useState(device.dhcp !== undefined);
  const [poolStart, setPoolStart] = useState(device.dhcp?.poolStart ?? '');
  const [poolSize, setPoolSize] = useState(String(device.dhcp?.poolSize ?? 20));
  const [prefix, setPrefix] = useState(String(device.dhcp?.prefix ?? 24));
  const [gateway, setGateway] = useState(device.dhcp?.gateway ?? '');
  const [dns, setDns] = useState(device.dhcp?.dns ?? '');

  const size = Number(poolSize);
  const pfx = Number(prefix);
  const valid =
    isValidIp(poolStart) &&
    Number.isInteger(size) &&
    size > 0 &&
    isValidPrefix(pfx) &&
    (gateway === '' || isValidIp(gateway)) &&
    (dns === '' || isValidIp(dns));

  function toggle(on: boolean) {
    setEnabled(on);
    if (!on) onSetDhcp(undefined);
  }
  function apply() {
    if (!valid) return;
    const cfg: DhcpConfig = { poolStart, poolSize: size, prefix: pfx };
    if (gateway) cfg.gateway = gateway;
    if (dns) cfg.dns = dns;
    onSetDhcp(cfg);
  }

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        Serveur DHCP
      </label>
      {enabled && (
        <div className="mt-1.5 space-y-1.5">
          <Field label="Début de plage" value={poolStart} placeholder="192.168.1.100" valid={poolStart === '' || isValidIp(poolStart)} onChange={setPoolStart} />
          <div className="flex gap-1.5">
            <Field label="Nombre d'adr." value={poolSize} valid={Number.isInteger(size) && size > 0} onChange={setPoolSize} />
            <Field label="Préfixe" value={prefix} valid={isValidPrefix(pfx)} onChange={setPrefix} />
          </div>
          <Field label="Passerelle distribuée" value={gateway} placeholder="192.168.1.1" valid={gateway === '' || isValidIp(gateway)} onChange={setGateway} />
          <Field label="DNS distribué" value={dns} placeholder="192.168.1.1" valid={dns === '' || isValidIp(dns)} onChange={setDns} />
          <button type="button" disabled={!valid} onClick={apply} className="w-full rounded bg-sky-600 px-3 py-1 text-sm text-white disabled:opacity-40">
            Appliquer la plage
          </button>
          {device.dhcp && (
            <p className="text-[11px] text-emerald-600">
              Actif : {device.dhcp.poolStart} (+{device.dhcp.poolSize}) /{device.dhcp.prefix}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** NAT configurable : interface externe (WAN) + redirections de port. */
export function NatSection({ device, onSetNat }: { device: Device; onSetNat: (cfg: NatConfig | undefined) => void }) {
  const nat = device.nat;
  const enabled = nat !== undefined;
  const wanItf = device.interfaces.find((i) => i.id === nat?.wanInterfaceId);
  const forwards = nat?.portForwards ?? [];

  const [proto, setProto] = useState<'tcp' | 'udp'>('tcp');
  const [pubPort, setPubPort] = useState('');
  const [privIp, setPrivIp] = useState('');
  const [privPort, setPrivPort] = useState('');

  const portOk = (s: string) => /^\d+$/.test(s) && Number(s) >= 0 && Number(s) <= 65535;
  const canAdd =
    portOk(pubPort) &&
    portOk(privPort) &&
    isValidIp(privIp) &&
    !forwards.some((f) => f.proto === proto && f.publicPort === Number(pubPort));

  function setWan(id: string) {
    onSetNat({ ...nat, wanInterfaceId: id === '' ? undefined : id });
  }
  function addForward() {
    if (!canAdd) return;
    const rule: PortForward = { proto, publicPort: Number(pubPort), privateIp: privIp, privatePort: Number(privPort) };
    onSetNat({ ...nat, portForwards: [...forwards, rule] });
    setPubPort('');
    setPrivIp('');
    setPrivPort('');
  }
  function removeForward(i: number) {
    const next = forwards.filter((_, idx) => idx !== i);
    onSetNat({ ...nat, portForwards: next.length > 0 ? next : undefined });
  }

  return (
    <div className="rounded-md border border-slate-200 p-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={enabled} onChange={(e) => onSetNat(e.target.checked ? {} : undefined)} />
        NAT (translation d'adresse)
      </label>

      {!enabled && (
        <p className="mt-1 text-[11px] text-slate-400">
          Permet aux hôtes d'un réseau privé d'accéder à un réseau externe via une seule IP publique.
        </p>
      )}

      {enabled && (
        <div className="mt-2 space-y-2">
          <label className="block">
            <span className={labelCls}>Interface externe (WAN)</span>
            <select value={nat?.wanInterfaceId ?? ''} onChange={(e) => setWan(e.target.value)} className={`${inputBase} ${wanItf ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}>
              <option value="">— Choisir l'interface publique —</option>
              {device.interfaces.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} {i.ip ? `(${i.ip})` : '(sans IP)'}
                </option>
              ))}
            </select>
          </label>

          {!wanItf ? (
            <p className="text-[11px] text-amber-600">
              Désignez l'interface reliée au réseau externe. Les autres deviennent internes (LAN).
            </p>
          ) : (
            <>
              <p className="text-[11px] text-slate-500">
                Interne (LAN) :{' '}
                <span className="font-mono text-slate-600">
                  {device.interfaces.filter((i) => i.id !== nat?.wanInterfaceId).map((i) => i.name).join(', ') || '—'}
                </span>
              </p>

              <div className="rounded border border-slate-200 p-1.5">
                <div className={`${labelCls} mb-1`}>Redirections de port (serveur hébergé)</div>
                {forwards.length === 0 && (
                  <p className="text-[11px] text-slate-400">Aucune. Le trafic entrant non sollicité est bloqué.</p>
                )}
                {forwards.map((f, i) => (
                  <div key={i} className="flex items-center gap-1 py-0.5 font-mono text-[11px] text-slate-600">
                    <span className="flex-1">
                      {f.proto.toUpperCase()} {wanItf.ip ?? '?'}:{f.publicPort} → {f.privateIp}:{f.privatePort}
                    </span>
                    <button type="button" onClick={() => removeForward(i)} className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Supprimer la règle">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <select value={proto} onChange={(e) => setProto(e.target.value as 'tcp' | 'udp')} className={`${inputBase} mt-0`}>
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                  </select>
                  <input value={pubPort} onChange={(e) => setPubPort(e.target.value)} placeholder="Port public (80)" className={`${inputBase} mt-0 ${pubPort === '' || portOk(pubPort) ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`} />
                  <input value={privIp} onChange={(e) => setPrivIp(e.target.value)} placeholder="IP interne" className={`${inputBase} mt-0 ${privIp === '' || isValidIp(privIp) ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`} />
                  <input value={privPort} onChange={(e) => setPrivPort(e.target.value)} placeholder="Port interne (80)" className={`${inputBase} mt-0 ${privPort === '' || portOk(privPort) ? 'border-slate-300' : 'border-rose-400 bg-rose-50'}`} />
                </div>
                <button type="button" disabled={!canAdd} onClick={addForward} className="mt-1 w-full rounded bg-sky-600 px-2 py-1 text-xs text-white disabled:opacity-40">
                  Ajouter la redirection
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
