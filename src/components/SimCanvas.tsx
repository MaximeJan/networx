// Canevas du mode Simulation : la topologie en lecture seule + les paquets en
// vol animés le long des câbles. Clic sur un appareil → ses tables ; clic sur un
// paquet → l'inspecteur. Pan (glisser le fond) + zoom (molette).

import { useEffect, useRef } from 'react';
import type { InFlightPacket, TextAnnotation, Topology, World, ZoneAnnotation } from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import { type Pt } from '../lib/geometry';
import { GRID } from '../lib/constants';
import { useViewport } from '../hooks/useViewport';
import { DeviceCard, DotGrid } from './DeviceShape';
import { anchorOf, linkAnchors } from './cableGeometry';

interface Props {
  world: World;
  clock: number;
  selectedDeviceId: string | null;
  selectedPacketId: string | null;
  onSelectDevice: (id: string | null) => void;
  onSelectPacket: (packet: InFlightPacket | null) => void;
  onOpenMachine: (id: string) => void;
}

/** Position interpolée d'un paquet en vol à l'instant `clock`. */
function packetPos(topology: Topology, f: InFlightPacket, clock: number): Pt | null {
  const a = anchorOf(topology, f.from, f.to);
  const b = anchorOf(topology, f.to, f.from);
  if (!a || !b) return null;
  const span = f.arriveTick - f.departTick || 1;
  const p = Math.max(0, Math.min(1, (clock - f.departTick) / span));
  return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
}

function packetColor(f: InFlightPacket): string {
  if (f.frame.etherType === 'arp') return '#f59e0b'; // ARP : ambre
  if (f.frame.etherType === 'ipv4') {
    if (f.frame.payload.protocol === 'icmp') return '#0284c7'; // ICMP : bleu
    if (f.frame.payload.protocol === 'udp') return '#7c3aed'; // UDP/DNS : violet
    if (f.frame.payload.protocol === 'tcp') return '#1d4ed8'; // TCP/HTTP : indigo
  }
  return '#64748b';
}

export default function SimCanvas({
  world,
  clock,
  selectedDeviceId,
  selectedPacketId,
  onSelectDevice,
  onSelectPacket,
  onOpenMachine,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const { scale, tx, ty, zoomAt, panBy } = useViewport();
  const { topology } = world;

  const annotations = topology.annotations ?? [];
  const zones = annotations.filter((a): a is ZoneAnnotation => a.kind === 'zone');
  const texts = annotations.filter((a): a is TextAnnotation => a.kind === 'text');
  const inv = 1 / scale;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  function onBgPointerDown(e: React.PointerEvent) {
    svgRef.current?.setPointerCapture(e.pointerId);
    panRef.current = { x: e.clientX, y: e.clientY, moved: false };
  }
  function onPointerMove(e: React.PointerEvent) {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (dx || dy) {
      p.moved = true;
      panBy(dx, dy);
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    const p = panRef.current;
    panRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
    if (p && !p.moved) {
      onSelectDevice(null);
      onSelectPacket(null);
    }
  }

  return (
    <svg
      ref={svgRef}
      className="h-full w-full cursor-default bg-slate-50"
      onPointerDown={onBgPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <defs>
        <DotGrid id="sim-grid" step={GRID * scale} tx={tx} ty={ty} />
      </defs>
      <rect width="100%" height="100%" fill="url(#sim-grid)" />

      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
        {/* Zones colorées (décor, lecture seule) : DERRIÈRE tout le reste */}
        {zones.map((z) => {
          const label = z.label && z.label !== '' ? z.label : 'Zone';
          const labelW = Math.max(44, label.length * 7 + 16);
          return (
            <g key={z.id} pointerEvents="none">
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx={8} fill={z.color} fillOpacity={0.13} stroke={z.color} strokeOpacity={0.5} strokeWidth={inv} />
              <rect x={z.x} y={z.y} width={labelW} height={18} rx={5} fill={z.color} fillOpacity={0.9} />
              <text x={z.x + 7} y={z.y + 13} fontSize={11} fontWeight={600} fill="#fff">
                {label}
              </text>
            </g>
          );
        })}

        {/* Câbles : ancrés sur le bord de chaque appareil, face au pair */}
        {topology.links.map((link) => {
          const anchors = linkAnchors(topology, link);
          if (!anchors) return null;
          return (
            <line key={link.id} x1={anchors.a.x} y1={anchors.a.y} x2={anchors.b.x} y2={anchors.b.y} stroke="#94a3b8" strokeWidth={2} />
          );
        })}

        {/* Étiquettes de texte (décor, lecture seule) */}
        {texts.map((t) => (
          <text key={t.id} x={t.x} y={t.y} fontSize={t.fontSize} fontWeight={600} fill={t.color} pointerEvents="none" style={{ userSelect: 'none' }}>
            {t.text}
          </text>
        ))}

        {/* Appareils */}
        {topology.devices.map((device) => {
          const def = getDeviceDef(device.kind);
          const selected = device.id === selectedDeviceId;
          return (
            <g
              key={device.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectDevice(device.id);
                onSelectPacket(null);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onOpenMachine(device.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <DeviceCard device={device} def={def} selected={selected} />
            </g>
          );
        })}

        {/* Paquets en vol */}
        {world.inFlight.map((f) => {
          const pos = packetPos(topology, f, clock);
          if (!pos) return null;
          const selected = f.id === selectedPacketId;
          return (
            <g
              key={f.id}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectPacket(f);
                onSelectDevice(null);
              }}
              style={{ cursor: 'pointer' }}
            >
              {selected && <circle cx={pos.x} cy={pos.y} r={9} fill="none" stroke="#0284c7" strokeWidth={2} />}
              <circle cx={pos.x} cy={pos.y} r={6} fill={packetColor(f)} stroke="white" strokeWidth={1.5} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
