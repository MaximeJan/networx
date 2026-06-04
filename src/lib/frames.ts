// Constructeurs de PDU — fonctions PURES qui assemblent trames et paquets.
// Pratique pour les tests et la pile OSI.

import type {
  ArpPacket,
  EthernetFrame,
  IcmpMessage,
  Ip,
  IpProtocol,
  Ipv4Packet,
  Mac,
  TcpSegment,
  UdpDatagram,
} from '../domain/types';

/** TTL initial par défaut d'un paquet IP. */
export const DEFAULT_TTL = 64;

// Surcharges : le type du payload se déduit de `etherType`.
export function ethernet(srcMac: Mac, dstMac: Mac, etherType: 'arp', payload: ArpPacket): EthernetFrame;
export function ethernet(srcMac: Mac, dstMac: Mac, etherType: 'ipv4', payload: Ipv4Packet): EthernetFrame;
export function ethernet(
  srcMac: Mac,
  dstMac: Mac,
  etherType: 'arp' | 'ipv4',
  payload: ArpPacket | Ipv4Packet,
): EthernetFrame {
  return { srcMac, dstMac, etherType, payload } as EthernetFrame;
}

/** Requête ARP « qui a targetIp ? » (MAC cible inconnue). */
export function arpRequest(senderMac: Mac, senderIp: Ip, targetIp: Ip): ArpPacket {
  return { op: 'request', senderMac, senderIp, targetMac: null, targetIp };
}

/** Réponse ARP « targetIp est à targetMac ». */
export function arpReply(senderMac: Mac, senderIp: Ip, targetMac: Mac, targetIp: Ip): ArpPacket {
  return { op: 'reply', senderMac, senderIp, targetMac, targetIp };
}

/** Paquet IPv4. */
export function ipv4(
  srcIp: Ip,
  dstIp: Ip,
  protocol: IpProtocol,
  payload: Ipv4Packet['payload'],
  ttl: number = DEFAULT_TTL,
): Ipv4Packet {
  return { srcIp, dstIp, ttl, protocol, payload };
}

/** Datagramme UDP. */
export function udp(srcPort: number, dstPort: number, payload: UdpDatagram['payload']): UdpDatagram {
  return { srcPort, dstPort, payload };
}

/** Segment TCP. */
export function tcp(
  srcPort: number,
  dstPort: number,
  seq: number,
  ack: number,
  flags: TcpSegment['flags'],
  payload?: TcpSegment['payload'],
): TcpSegment {
  return { srcPort, dstPort, seq, ack, flags, payload };
}

/** Message ICMP echo (request ou reply). */
export function icmpEcho(
  type: 'echo-request' | 'echo-reply',
  id: number,
  seq: number,
  data?: string,
): IcmpMessage {
  return { type, id, seq, data };
}
