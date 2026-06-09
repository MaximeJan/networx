// Inspecteur de paquet : clic sur un paquet en vol (SimCanvas) → ses couches OSI
// dépliées, de l'extérieur (liaison) vers l'intérieur (application), comme à la
// désencapsulation. Purement présentationnel : lit la trame capturée, sans moteur.

import { X } from 'lucide-react';
import type {
  ArpPacket,
  DhcpMessage,
  DnsMessage,
  HttpMessage,
  IcmpMessage,
  InFlightPacket,
  Ipv4Packet,
  TcpSegment,
  UdpDatagram,
} from '../domain/types';

interface Props {
  packet: InFlightPacket;
  onClose: () => void;
}

/** Une ligne champ → valeur. */
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[11px] leading-relaxed">
      <span className="shrink-0 text-slate-400">{k}</span>
      <span className="text-right font-mono text-slate-700 break-all">{v}</span>
    </div>
  );
}

/** Un bloc « couche » avec une pastille colorée et un sous-titre protocole. */
function Layer({ color, name, proto, children }: { color: string; name: string; proto: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-semibold text-slate-600">{name}</span>
        <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
          {proto}
        </span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function ArpLayer({ arp }: { arp: ArpPacket }) {
  return (
    <Layer color="#f59e0b" name="Couche réseau" proto="ARP">
      <Row k="Opération" v={arp.op === 'request' ? 'requête (qui a … ?)' : 'réponse'} />
      <Row k="Émetteur" v={`${arp.senderIp} · ${arp.senderMac}`} />
      <Row k="Cible" v={`${arp.targetIp} · ${arp.targetMac ?? '?'}`} />
    </Layer>
  );
}

function DnsLayer({ dns }: { dns: DnsMessage }) {
  return (
    <Layer color="#c026d3" name="Couche application" proto="DNS">
      <Row k="Type" v={dns.kind === 'query' ? 'requête' : 'réponse'} />
      <Row k="Nom" v={dns.name} />
      {dns.answer != null && <Row k="Réponse (A)" v={dns.answer} />}
      {dns.answer === null && <Row k="Réponse" v="(introuvable)" />}
      {dns.referral && <Row k="Délégation (NS)" v={dns.referral} />}
      {dns.cname && <Row k="Alias (CNAME)" v={dns.cname} />}
    </Layer>
  );
}

function DhcpLayer({ dhcp }: { dhcp: DhcpMessage }) {
  const label = { discover: 'Discover', offer: 'Offer', request: 'Request', ack: 'Ack' }[dhcp.kind];
  return (
    <Layer color="#65a30d" name="Couche application" proto="DHCP">
      <Row k="Message" v={label} />
      <Row k="Client (MAC)" v={dhcp.mac} />
      {dhcp.ip && <Row k="Adresse" v={`${dhcp.ip}${dhcp.prefix ? `/${dhcp.prefix}` : ''}`} />}
      {dhcp.gateway && <Row k="Passerelle" v={dhcp.gateway} />}
      {dhcp.dns && <Row k="DNS" v={dhcp.dns} />}
    </Layer>
  );
}

function HttpLayer({ http }: { http: HttpMessage }) {
  return (
    <Layer color="#0891b2" name="Couche application" proto="HTTP">
      {http.kind === 'request' ? (
        <>
          <Row k="Méthode" v={http.method} />
          <Row k="Hôte" v={http.host} />
          <Row k="Chemin" v={http.path} />
        </>
      ) : (
        <>
          <Row k="Statut" v={http.status} />
          <Row k="Corps" v={`${http.body.length} octets`} />
        </>
      )}
    </Layer>
  );
}

function isDns(p: unknown): p is DnsMessage {
  const k = (p as DnsMessage | undefined)?.kind;
  return k === 'query' || k === 'response';
}
function isDhcp(p: unknown): p is DhcpMessage {
  const k = (p as DhcpMessage | undefined)?.kind;
  return k === 'discover' || k === 'offer' || k === 'request' || k === 'ack';
}
function isHttp(p: unknown): p is HttpMessage {
  const k = (p as HttpMessage | undefined)?.kind;
  return k === 'request' || k === 'response';
}

function UdpLayer({ udp }: { udp: UdpDatagram }) {
  return (
    <Layer color="#7c3aed" name="Couche transport" proto="UDP">
      <Row k="Port source" v={udp.srcPort} />
      <Row k="Port destination" v={udp.dstPort} />
    </Layer>
  );
}

function TcpLayer({ tcp }: { tcp: TcpSegment }) {
  const flags = [tcp.flags.syn && 'SYN', tcp.flags.fin && 'FIN', tcp.flags.rst && 'RST', tcp.flags.ack && 'ACK']
    .filter(Boolean)
    .join(' ');
  return (
    <Layer color="#1d4ed8" name="Couche transport" proto="TCP">
      <Row k="Port source" v={tcp.srcPort} />
      <Row k="Port destination" v={tcp.dstPort} />
      <Row k="seq / ack" v={`${tcp.seq} / ${tcp.ack}`} />
      <Row k="Drapeaux" v={flags || '(aucun)'} />
    </Layer>
  );
}

function Ipv4Layers({ ip }: { ip: Ipv4Packet }) {
  return (
    <>
      <Layer color="#0ea5e9" name="Couche réseau" proto="IPv4">
        <Row k="Source" v={ip.srcIp} />
        <Row k="Destination" v={ip.dstIp} />
        <Row k="TTL" v={ip.ttl} />
        <Row k="Protocole" v={ip.protocol.toUpperCase()} />
      </Layer>

      {ip.protocol === 'icmp' && (() => {
        const icmp = ip.payload as IcmpMessage;
        const label = {
          'echo-request': "demande d'écho (ping)",
          'echo-reply': "réponse d'écho (pong)",
          'time-exceeded': 'TTL expiré',
          'dest-unreachable': 'destination injoignable',
        }[icmp.type];
        return (
          <Layer color="#0284c7" name="Couche réseau" proto="ICMP">
            <Row k="Type" v={label} />
            <Row k="id / seq" v={`${icmp.id} / ${icmp.seq}`} />
          </Layer>
        );
      })()}

      {ip.protocol === 'udp' && (() => {
        const udp = ip.payload as UdpDatagram;
        return (
          <>
            <UdpLayer udp={udp} />
            {isDhcp(udp.payload) && <DhcpLayer dhcp={udp.payload} />}
            {isDns(udp.payload) && <DnsLayer dns={udp.payload} />}
          </>
        );
      })()}

      {ip.protocol === 'tcp' && (() => {
        const tcp = ip.payload as TcpSegment;
        return (
          <>
            <TcpLayer tcp={tcp} />
            {isHttp(tcp.payload) && <HttpLayer http={tcp.payload} />}
          </>
        );
      })()}
    </>
  );
}

export default function PacketInspector({ packet, onClose }: Props) {
  const { frame } = packet;
  return (
    <div className="absolute left-3 top-3 z-20 flex w-64 flex-col gap-1.5 rounded-xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Paquet</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Fermer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Couche liaison (Ethernet) : toujours présente */}
      <Layer color="#475569" name="Couche liaison" proto="Ethernet">
        <Row k="MAC source" v={frame.srcMac} />
        <Row k="MAC destination" v={frame.dstMac} />
        <Row k="EtherType" v={frame.etherType === 'arp' ? 'ARP' : 'IPv4'} />
      </Layer>

      {frame.etherType === 'arp' ? (
        <ArpLayer arp={frame.payload} />
      ) : (
        <Ipv4Layers ip={frame.payload} />
      )}
    </div>
  );
}
