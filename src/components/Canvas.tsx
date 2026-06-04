// Canevas SVG du mode Conception. Présentationnel pour les MUTATIONS (il appelle
// des handlers sémantiques), mais il gère sa mécanique pointer :
//   • molette          → zoom
//   • molette PRESSÉE  → déplacement de la vue (pan)
//   • clic gauche fond  → sélection au lasso (rectangle), ou désélection si simple clic
//   • clic appareil     → sélection (Maj = ajouter/retirer) + déplacement de groupe
//   • clic port→port    → câblage
//   • dépôt depuis la palette → placement d'appareil
//   • outils « texte » / « zone » → pose d'annotations

import { useEffect, useRef, useState } from 'react';
import type {
  Annotation,
  AnnotationTool,
  Device,
  DeviceKind,
  Endpoint,
  InterfaceId,
  Selection,
  TextAnnotation,
  Topology,
  ZoneAnnotation,
} from '../domain/types';
import { getDeviceDef } from '../devices/registry';
import { devicePortPositions, findPortPosition, snap, type Pt } from '../lib/geometry';
import { GRID, PORT_R, ZONE_MIN_SIZE } from '../lib/constants';
import { useViewport } from '../hooks/useViewport';
import { DeviceCard, DotGrid } from './DeviceShape';
import { linkAnchors } from './cableGeometry';
import { DEVICE_DND_TYPE } from './Palette';

const KNOWN_KINDS = new Set<DeviceKind>(['pc', 'switch', 'router']);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  topology: Topology;
  selection: Selection;
  tool: AnnotationTool | null;
  onPlaceDevice: (kind: DeviceKind, x: number, y: number) => void;
  onSelect: (sel: Selection) => void;
  onOpenDevice: (id: string) => void;
  onMoveDevices: (positions: { id: string; x: number; y: number }[], commit: boolean) => void;
  onCreateLink: (a: Endpoint, b: Endpoint) => void;
  onAddText: (x: number, y: number) => void;
  onAddZone: (x: number, y: number, w: number, h: number) => void;
  onMoveAnnotation: (id: string, x: number, y: number, commit: boolean) => void;
  onResizeZone: (id: string, w: number, h: number, commit: boolean) => void;
  onToolDone: () => void;
}

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'marquee'; start: Pt; moved: boolean }
  | { kind: 'draw-zone'; start: Pt }
  | { kind: 'devices'; start: Pt; orig: { id: string; x: number; y: number }[]; moved: boolean }
  | { kind: 'annotation'; id: string; grabDX: number; grabDY: number; moved: boolean }
  | { kind: 'resize-zone'; id: string; x: number; y: number; moved: boolean };

function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export default function Canvas({
  topology,
  selection,
  tool,
  onPlaceDevice,
  onSelect,
  onOpenDevice,
  onMoveDevices,
  onCreateLink,
  onAddText,
  onAddZone,
  onMoveAnnotation,
  onResizeZone,
  onToolDone,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // Détection manuelle du double-clic sur un appareil (le pointer-capture du glisser
  // empêche le `dblclick` natif de se déclencher).
  const lastClickRef = useRef<{ id: string; t: number }>({ id: '', t: 0 });
  const { scale, tx, ty, zoomAt, panBy, screenToWorld } = useViewport();

  // Câblage en cours : port source + position courante du curseur (monde).
  const [pendingFrom, setPendingFrom] = useState<Endpoint | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  // Aperçus en direct (lasso / tracé de zone).
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [drawZone, setDrawZone] = useState<Rect | null>(null);

  const annotations = topology.annotations ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPendingFrom(null);
        setCursor(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Zoom molette + suppression de l'autoscroll au clic-molette (listeners natifs).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault(); // pas d'autoscroll au clic-molette
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onMouseDown);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onMouseDown);
    };
  }, [zoomAt]);

  function worldFromEvent(e: { clientX: number; clientY: number }): Pt {
    const rect = svgRef.current!.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }
  function capture(e: React.PointerEvent) {
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointeur non capturable (ex. événement synthétique) — sans gravité */
    }
  }

  function pickPort(ep: Endpoint) {
    if (!pendingFrom) {
      setPendingFrom(ep);
      return;
    }
    if (pendingFrom.deviceId !== ep.deviceId) onCreateLink(pendingFrom, ep);
    setPendingFrom(null);
    setCursor(null);
  }

  // ── Pointeur sur le FOND ──
  function onBgPointerDown(e: React.PointerEvent) {
    if (pendingFrom) {
      setPendingFrom(null);
      setCursor(null);
      return;
    }
    const p = worldFromEvent(e);
    if (e.button === 1) {
      capture(e);
      dragRef.current = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'text') {
      onAddText(snap(p.x), snap(p.y));
      return;
    }
    if (tool === 'zone') {
      capture(e);
      dragRef.current = { kind: 'draw-zone', start: p };
      setDrawZone({ x: p.x, y: p.y, w: 0, h: 0 });
      return;
    }
    capture(e);
    dragRef.current = { kind: 'marquee', start: p, moved: false };
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const kind = e.dataTransfer.getData(DEVICE_DND_TYPE) as DeviceKind;
    if (!KNOWN_KINDS.has(kind)) return;
    const p = worldFromEvent(e);
    const def = getDeviceDef(kind);
    onPlaceDevice(kind, snap(p.x - def.w / 2), snap(p.y - def.h / 2));
  }

  function onDevicePointerDown(e: React.PointerEvent, device: Device) {
    e.stopPropagation();
    if (pendingFrom || tool) return;

    // Double-clic (deux clics rapprochés sur le même appareil) → ouvrir sa fenêtre.
    const now = Date.now();
    const last = lastClickRef.current;
    if (!e.shiftKey && last.id === device.id && now - last.t < 350) {
      lastClickRef.current = { id: '', t: 0 };
      onOpenDevice(device.id);
      return;
    }
    lastClickRef.current = { id: device.id, t: now };

    const inSel = selection.kind === 'devices' && selection.ids.includes(device.id);

    if (e.shiftKey) {
      const cur = selection.kind === 'devices' ? selection.ids : [];
      const ids = inSel ? cur.filter((x) => x !== device.id) : [...cur, device.id];
      onSelect(ids.length ? { kind: 'devices', ids } : { kind: 'none' });
      return;
    }

    const ids = inSel ? selection.ids : [device.id];
    if (!inSel) onSelect({ kind: 'devices', ids });
    capture(e);
    const orig = ids
      .map((id) => topology.devices.find((d) => d.id === id))
      .filter((d): d is Device => !!d)
      .map((d) => ({ id: d.id, x: d.x, y: d.y }));
    dragRef.current = { kind: 'devices', start: worldFromEvent(e), orig, moved: false };
  }

  function onAnnotationPointerDown(e: React.PointerEvent, ann: Annotation) {
    e.stopPropagation();
    if (pendingFrom || tool) return;
    onSelect({ kind: 'annotation', id: ann.id });
    capture(e);
    const p = worldFromEvent(e);
    dragRef.current = { kind: 'annotation', id: ann.id, grabDX: p.x - ann.x, grabDY: p.y - ann.y, moved: false };
  }

  function onResizePointerDown(e: React.PointerEvent, zone: ZoneAnnotation) {
    e.stopPropagation();
    capture(e);
    dragRef.current = { kind: 'resize-zone', id: zone.id, x: zone.x, y: zone.y, moved: false };
  }

  function onPortPointerDown(e: React.PointerEvent, device: Device, interfaceId: InterfaceId) {
    e.stopPropagation();
    pickPort({ deviceId: device.id, interfaceId });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pendingFrom) setCursor(worldFromEvent(e));
    const d = dragRef.current;
    if (!d) return;
    const p = worldFromEvent(e);
    if (d.kind === 'pan') {
      panBy(e.clientX - d.lastX, e.clientY - d.lastY);
      d.lastX = e.clientX;
      d.lastY = e.clientY;
    } else if (d.kind === 'marquee') {
      d.moved = true;
      setMarquee(normRect(d.start, p));
    } else if (d.kind === 'draw-zone') {
      setDrawZone(normRect(d.start, p));
    } else if (d.kind === 'devices') {
      d.moved = true;
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      onMoveDevices(d.orig.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })), false);
    } else if (d.kind === 'annotation') {
      d.moved = true;
      onMoveAnnotation(d.id, p.x - d.grabDX, p.y - d.grabDY, false);
    } else if (d.kind === 'resize-zone') {
      d.moved = true;
      onResizeZone(d.id, Math.max(ZONE_MIN_SIZE, p.x - d.x), Math.max(ZONE_MIN_SIZE, p.y - d.y), false);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* déjà relâché */
    }
    if (!d) return;
    const p = worldFromEvent(e);

    if (d.kind === 'marquee') {
      setMarquee(null);
      if (!d.moved) {
        onSelect({ kind: 'none' });
        return;
      }
      const box = normRect(d.start, p);
      const ids = topology.devices
        .filter((dev) => {
          const def = getDeviceDef(dev.kind);
          return rectsIntersect(box, { x: dev.x, y: dev.y, w: def.w, h: def.h });
        })
        .map((dev) => dev.id);
      onSelect(ids.length ? { kind: 'devices', ids } : { kind: 'none' });
    } else if (d.kind === 'draw-zone') {
      setDrawZone(null);
      const r = normRect(d.start, p);
      if (r.w >= ZONE_MIN_SIZE && r.h >= ZONE_MIN_SIZE) {
        onAddZone(snap(r.x), snap(r.y), snap(r.w), snap(r.h));
      }
      onToolDone();
    } else if (d.kind === 'devices' && d.moved) {
      const dx = p.x - d.start.x;
      const dy = p.y - d.start.y;
      onMoveDevices(d.orig.map((o) => ({ id: o.id, x: snap(o.x + dx), y: snap(o.y + dy) })), true);
    } else if (d.kind === 'annotation' && d.moved) {
      onMoveAnnotation(d.id, snap(p.x - d.grabDX), snap(p.y - d.grabDY), true);
    } else if (d.kind === 'resize-zone' && d.moved) {
      onResizeZone(d.id, Math.max(ZONE_MIN_SIZE, snap(p.x - d.x)), Math.max(ZONE_MIN_SIZE, snap(p.y - d.y)), true);
    }
  }

  const cabling = pendingFrom !== null;
  const cursorClass = cabling || tool ? 'cursor-crosshair' : 'cursor-default';
  const inv = 1 / scale; // pour des traits d'épaisseur constante à l'écran

  const zones = annotations.filter((a): a is ZoneAnnotation => a.kind === 'zone');
  const texts = annotations.filter((a): a is TextAnnotation => a.kind === 'text');
  const isSelDevice = (id: string) => selection.kind === 'devices' && selection.ids.includes(id);
  const isSelAnno = (id: string) => selection.kind === 'annotation' && selection.id === id;

  return (
    <svg
      ref={svgRef}
      className={`h-full w-full bg-slate-50 ${cursorClass}`}
      onPointerDown={onBgPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      <defs>
        <DotGrid id="grid" step={GRID * scale} tx={tx} ty={ty} />
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
        {/* Zones colorées : DERRIÈRE tout le reste. Le remplissage ne capte pas le
            pointeur (pour ne pas bloquer le lasso ni le clic sur un appareil). */}
        {zones.map((z) => {
          const sel = isSelAnno(z.id);
          const label = z.label && z.label !== '' ? z.label : 'Zone';
          const labelW = Math.max(44, label.length * 7 + 16);
          return (
            <g key={z.id}>
              <rect
                x={z.x}
                y={z.y}
                width={z.w}
                height={z.h}
                rx={8}
                fill={z.color}
                fillOpacity={0.13}
                stroke={z.color}
                strokeOpacity={sel ? 0.95 : 0.5}
                strokeWidth={(sel ? 2 : 1) * inv}
                pointerEvents="none"
              />
              {/* Étiquette = poignée de sélection / déplacement */}
              <g className="cursor-move" onPointerDown={(e) => onAnnotationPointerDown(e, z)}>
                <rect x={z.x} y={z.y} width={labelW} height={18} rx={5} fill={z.color} fillOpacity={0.9} />
                <text x={z.x + 7} y={z.y + 13} fontSize={11} fontWeight={600} fill="#fff" pointerEvents="none">
                  {label}
                </text>
              </g>
              {/* Poignée de redimensionnement (coin bas-droit) si sélectionnée */}
              {sel && (
                <rect
                  x={z.x + z.w - 9 * inv}
                  y={z.y + z.h - 9 * inv}
                  width={10 * inv}
                  height={10 * inv}
                  rx={2 * inv}
                  fill="#fff"
                  stroke={z.color}
                  strokeWidth={1.5 * inv}
                  className="cursor-nwse-resize"
                  onPointerDown={(e) => onResizePointerDown(e, z)}
                />
              )}
            </g>
          );
        })}

        {/* Liens */}
        {topology.links.map((link) => {
          const anchors = linkAnchors(topology, link);
          if (!anchors) return null;
          const { a, b } = anchors;
          const selected = selection.kind === 'link' && selection.id === link.id;
          return (
            <g key={link.id}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={10}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect({ kind: 'link', id: link.id });
                }}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selected ? '#0284c7' : '#94a3b8'}
                strokeWidth={selected ? 3 : 2}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {/* Câble en cours de tracé */}
        {pendingFrom &&
          cursor &&
          (() => {
            const from = endpointPos(topology, pendingFrom);
            if (!from) return null;
            return (
              <line x1={from.x} y1={from.y} x2={cursor.x} y2={cursor.y} stroke="#0284c7" strokeWidth={2} strokeDasharray="4 4" pointerEvents="none" />
            );
          })()}

        {/* Étiquettes de texte */}
        {texts.map((t) => {
          const sel = isSelAnno(t.id);
          const estW = Math.max(20, t.text.length * t.fontSize * 0.6);
          return (
            <g key={t.id} className="cursor-move" onPointerDown={(e) => onAnnotationPointerDown(e, t)}>
              <rect
                x={t.x - 4}
                y={t.y - t.fontSize}
                width={estW + 8}
                height={t.fontSize + 8}
                rx={3}
                fill={sel ? '#0ea5e9' : 'transparent'}
                fillOpacity={sel ? 0.08 : 0}
                stroke={sel ? '#0ea5e9' : 'none'}
                strokeDasharray="3 3"
                strokeWidth={inv}
              />
              <text x={t.x} y={t.y} fontSize={t.fontSize} fontWeight={600} fill={t.color} pointerEvents="none" style={{ userSelect: 'none' }}>
                {t.text}
              </text>
            </g>
          );
        })}

        {/* Appareils */}
        {topology.devices.map((device) => {
          const def = getDeviceDef(device.kind);
          const ports = devicePortPositions(device, def);
          return (
            <g key={device.id} onPointerDown={(e) => onDevicePointerDown(e, device)}>
              <DeviceCard device={device} def={def} selected={isSelDevice(device.id)} />
              {ports.map((p) => {
                const itf = device.interfaces.find((i) => i.id === p.interfaceId);
                if (itf?.linkId) return null;
                const isPending = pendingFrom?.deviceId === device.id && pendingFrom.interfaceId === p.interfaceId;
                return (
                  <g key={p.interfaceId} className="cursor-pointer">
                    <circle cx={p.x} cy={p.y} r={10} fill="transparent" onPointerDown={(e) => onPortPointerDown(e, device, p.interfaceId)} />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isPending ? PORT_R + 2 : PORT_R}
                      fill={isPending ? '#0284c7' : cabling ? '#bae6fd' : '#e2e8f0'}
                      stroke={isPending ? '#0284c7' : '#94a3b8'}
                      strokeWidth={1}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Aperçu du lasso de sélection */}
        {marquee && (
          <rect
            x={marquee.x}
            y={marquee.y}
            width={marquee.w}
            height={marquee.h}
            fill="#0ea5e9"
            fillOpacity={0.08}
            stroke="#0ea5e9"
            strokeWidth={inv}
            strokeDasharray={`${4 * inv} ${3 * inv}`}
          />
        )}

        {/* Aperçu du tracé de zone */}
        {drawZone && (
          <rect
            x={drawZone.x}
            y={drawZone.y}
            width={drawZone.w}
            height={drawZone.h}
            rx={8}
            fill="#64748b"
            fillOpacity={0.12}
            stroke="#64748b"
            strokeWidth={inv}
            strokeDasharray={`${4 * inv} ${3 * inv}`}
          />
        )}
      </g>
    </svg>
  );
}

/** Position monde d'un endpoint (point de port fixe), pour le câble en cours. */
function endpointPos(topology: Topology, ep: Endpoint): Pt | null {
  const device = topology.devices.find((d) => d.id === ep.deviceId);
  if (!device) return null;
  return findPortPosition(device, getDeviceDef(device.kind), ep.interfaceId);
}
