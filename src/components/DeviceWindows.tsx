// Couche de fenêtres d'appareils : rend la bonne fenêtre selon le type (ordinateur,
// routeur, commutateur) pour chaque appareil ouvert. Mutualisée entre la Conception
// (sans moteur → Terminal/Navigateur grisés) et la Simulation (avec moteur).

import type { AppKind, Device, DhcpConfig, DnsRecord, InterfaceId, Ip, NatConfig, Route, RoutingMode } from '../domain/types';
import type { SimEngine } from '../hooks/useSimulationEngine';
import MachineWindow from './MachineWindow';
import RouterWindow from './RouterWindow';
import SwitchWindow from './SwitchWindow';

/** Tous les handlers de configuration/logiciels, indexés par deviceId. */
export interface DeviceWindowHandlers {
  onInstallApp: (id: string, kind: AppKind) => void;
  onUninstallApp: (id: string, kind: AppKind) => void;
  onSetDnsRecords: (id: string, records: DnsRecord[]) => void;
  onSetDnsRecursive: (id: string, recursive: boolean) => void;
  onSetWebPage: (id: string, page: string) => void;
  onRename: (id: string, name: string) => void;
  onSetInterfaceIp: (id: string, ifId: InterfaceId, ip: Ip | undefined) => void;
  onSetInterfacePrefix: (id: string, ifId: InterfaceId, prefix: number | undefined) => void;
  onSetGateway: (id: string, ip: Ip | undefined) => void;
  onSetDns: (id: string, ip: Ip | undefined) => void;
  onSetRoutes: (id: string, routes: Route[]) => void;
  onSetRouting: (id: string, mode: RoutingMode) => void;
  onSetDhcp: (id: string, cfg: DhcpConfig | undefined) => void;
  onSetNat: (id: string, cfg: NatConfig | undefined) => void;
}

interface Props {
  ids: string[];
  deviceById: (id: string) => Device | null;
  engine?: SimEngine;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  handlers: DeviceWindowHandlers;
}

export default function DeviceWindows({ ids, deviceById, engine, onClose, onFocus, handlers: h }: Props) {
  return (
    <>
      {ids.map((id, i) => {
        const d = deviceById(id);
        if (!d) return null;
        const base = {
          zIndex: 10 + i,
          initialX: 40 + i * 28,
          initialY: 40 + i * 28,
          onClose: () => onClose(id),
          onFocus: () => onFocus(id),
        };
        if (d.kind === 'switch') {
          return <SwitchWindow key={id} device={d} engine={engine} {...base} onRename={(name) => h.onRename(id, name)} />;
        }
        if (d.kind === 'router') {
          return (
            <RouterWindow
              key={id}
              device={d}
              engine={engine}
              {...base}
              onRename={(name) => h.onRename(id, name)}
              onSetInterfaceIp={(ifId, ip) => h.onSetInterfaceIp(id, ifId, ip)}
              onSetInterfacePrefix={(ifId, prefix) => h.onSetInterfacePrefix(id, ifId, prefix)}
              onSetGateway={(ip) => h.onSetGateway(id, ip)}
              onSetDns={(ip) => h.onSetDns(id, ip)}
              onSetRoutes={(routes) => h.onSetRoutes(id, routes)}
              onSetRouting={(mode) => h.onSetRouting(id, mode)}
              onSetDhcp={(cfg) => h.onSetDhcp(id, cfg)}
              onSetNat={(cfg) => h.onSetNat(id, cfg)}
            />
          );
        }
        return (
          <MachineWindow
            key={id}
            device={d}
            engine={engine}
            {...base}
            onInstall={(kind) => h.onInstallApp(id, kind)}
            onUninstall={(kind) => h.onUninstallApp(id, kind)}
            onSetDnsRecords={(records) => h.onSetDnsRecords(id, records)}
            onSetDnsRecursive={(rec) => h.onSetDnsRecursive(id, rec)}
            onSetWebPage={(page) => h.onSetWebPage(id, page)}
            onRename={(name) => h.onRename(id, name)}
            onSetInterfaceIp={(ifId, ip) => h.onSetInterfaceIp(id, ifId, ip)}
            onSetInterfacePrefix={(ifId, prefix) => h.onSetInterfacePrefix(id, ifId, prefix)}
            onSetGateway={(ip) => h.onSetGateway(id, ip)}
            onSetDns={(ip) => h.onSetDns(id, ip)}
          />
        );
      })}
    </>
  );
}
