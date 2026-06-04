// Rendu visuel partagé d'un appareil (carte SVG), utilisé par le canevas de
// Conception et celui de Simulation pour une apparence cohérente et soignée.
// Les coordonnées sont en espace monde (à placer dans le <g> transformé).
// Suppose qu'un filtre <filter id="device-shadow"> existe dans les <defs> du SVG.

import type { Device } from '../domain/types';
import type { DeviceDef } from '../devices/registry';

const noSelect = { userSelect: 'none' as const, pointerEvents: 'none' as const };

export function DeviceCard({
  device,
  def,
  selected,
}: {
  device: Device;
  def: DeviceDef;
  selected: boolean;
}) {
  const Icon = def.icon;
  const cx = device.x + def.w / 2;
  const primaryIp = device.interfaces.find((i) => i.ip)?.ip;
  return (
    <>
      {selected && (
        <rect
          x={device.x - 5}
          y={device.y - 5}
          width={def.w + 10}
          height={def.h + 10}
          rx={12}
          fill="rgba(14,165,233,0.08)"
          stroke="#0ea5e9"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          pointerEvents="none"
        />
      )}
      {/* Ombre douce (rectangle décalé — évite un filtre SVG coûteux) */}
      <rect x={device.x} y={device.y + 2} width={def.w} height={def.h} rx={10} fill="#0f172a" opacity={0.1} pointerEvents="none" />
      <rect
        x={device.x}
        y={device.y}
        width={def.w}
        height={def.h}
        rx={10}
        fill="white"
        stroke={selected ? '#0284c7' : '#cbd5e1'}
        strokeWidth={selected ? 2 : 1.25}
      />
      {/* Tuile colorée derrière l'icône */}
      <rect x={cx - 18} y={device.y + 8} width={36} height={36} rx={9} fill={def.color} opacity={0.12} pointerEvents="none" />
      <Icon x={cx - 13} y={device.y + 13} width={26} height={26} color={def.color} />
      <text
        x={cx}
        y={device.y + def.h - 8}
        textAnchor="middle"
        fontSize={10}
        fontWeight={500}
        fill="#334155"
        style={noSelect}
      >
        {device.name}
      </text>
      {primaryIp && (
        <text
          x={cx}
          y={device.y + def.h + 15}
          textAnchor="middle"
          fontSize={9}
          fontFamily="monospace"
          fill="#64748b"
          style={noSelect}
        >
          {primaryIp}
        </text>
      )}
    </>
  );
}

/** Motif de grille en points (style Logix) à insérer dans les <defs>. */
export function DotGrid({ id, step, tx, ty }: { id: string; step: number; tx: number; ty: number }) {
  return (
    <pattern
      id={id}
      width={step}
      height={step}
      patternUnits="userSpaceOnUse"
      patternTransform={`translate(${tx % step} ${ty % step})`}
    >
      <circle cx={step / 2} cy={step / 2} r={1.1} fill="#cbd5e1" />
    </pattern>
  );
}
