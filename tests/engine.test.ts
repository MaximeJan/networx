import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, Topology, World } from '../src/domain/types';
import { addLink, emptyTopology, addDevice, endpoint } from '../src/lib/topology';
import { createWorld, emitFrame, run, step, LINK_DELAY } from '../src/lib/engine';
import { ethernet, arpRequest } from '../src/lib/frames';
import { BROADCAST_MAC } from '../src/lib/mac';

// ── Adresses et fabriques de fixtures ──
const MA = '02:00:00:00:00:0a';
const MB = '02:00:00:00:00:0b';
const MC = '02:00:00:00:00:0c';

function itf(id: string, mac: string): NetInterface {
  return { id, name: id, mac };
}
function host(id: string, mac: string): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, interfaces: [itf(`${id}_e0`, mac)] };
}
function multiPort(id: string, kind: Device['kind'], n: number): Device {
  const interfaces = Array.from({ length: n }, (_, i) => itf(`${id}_p${i}`, `02:00:00:00:01:0${i}`));
  return { id, kind, name: id, x: 0, y: 0, interfaces };
}

/** A, B, C reliés à un commutateur central sur p0, p1, p2. */
function star(centralKind: Device['kind']): Topology {
  let t = emptyTopology();
  t = addDevice(t, host('A', MA));
  t = addDevice(t, host('B', MB));
  t = addDevice(t, host('C', MC));
  t = addDevice(t, multiPort('X', centralKind, 4));
  t = addLink(t, endpoint('A', 'A_e0'), endpoint('X', 'X_p0'))!;
  t = addLink(t, endpoint('B', 'B_e0'), endpoint('X', 'X_p1'))!;
  t = addLink(t, endpoint('C', 'C_e0'), endpoint('X', 'X_p2'))!;
  return t;
}

const frame = (src: string, dst: string) =>
  ethernet(src, dst, 'arp', arpRequest(src, '10.0.0.1', '10.0.0.2'));

const receives = (w: World, id: string) =>
  w.log.filter((l) => l.tag === 'host-receive' && l.deviceId === id).length;
const drops = (w: World, id: string) =>
  w.log.filter((l) => l.tag === 'drop' && l.deviceId === id).length;
const macTable = (w: World, id: string) => w.runtime[id].macTable;

describe('propagation sur le câble', () => {
  it('met la trame en vol puis la retire à la livraison', () => {
    const t: Topology = addLink(
      addDevice(addDevice(emptyTopology(), host('A', MA)), host('B', MB)),
      endpoint('A', 'A_e0'),
      endpoint('B', 'B_e0'),
    )!;
    const w0 = emitFrame(createWorld(t), endpoint('A', 'A_e0'), frame(MA, MB));
    expect(w0.inFlight).toHaveLength(1);
    expect(w0.inFlight[0]).toMatchObject({ departTick: 0, arriveTick: LINK_DELAY });
    const w1 = run(w0);
    expect(w1.inFlight).toHaveLength(0);
    expect(w1.tick).toBe(LINK_DELAY); // 1 saut
    expect(receives(w1, 'B')).toBe(1);
  });

  it('perd une trame émise sur une interface non câblée', () => {
    const t = addDevice(emptyTopology(), host('A', MA));
    const w = emitFrame(createWorld(t), endpoint('A', 'A_e0'), frame(MA, MB));
    expect(w.eventQueue).toHaveLength(0);
    expect(w.inFlight).toHaveLength(0);
    expect(w.log.some((l) => l.tag === 'drop')).toBe(true);
  });
});

describe('commutateur', () => {
  it('apprend la MAC source et diffuse vers un destinataire inconnu', () => {
    const w = run(emitFrame(createWorld(star('switch')), endpoint('A', 'A_e0'), frame(MA, MB)));
    // Appris : MA sur le port relié à A.
    expect(macTable(w, 'X')).toEqual([{ mac: MA, interfaceId: 'X_p0', learnedAtTick: LINK_DELAY }]);
    // Diffusion : B et C reçoivent la trame ; B l'accepte, C la filtre (NIC).
    expect(receives(w, 'B')).toBe(1);
    expect(receives(w, 'C')).toBe(0);
    expect(drops(w, 'C')).toBe(1);
    // 2 sauts (A→X→B/C).
    expect(w.tick).toBe(2 * LINK_DELAY);
  });

  it('commute en point à point une fois les deux MAC apprises (sans inonder C)', () => {
    let w = run(emitFrame(createWorld(star('switch')), endpoint('A', 'A_e0'), frame(MA, MB)));
    const before = w.log.length;
    // B répond à A : destinataire MA connu → commutation directe vers le port de A.
    w = run(emitFrame(w, endpoint('B', 'B_e0'), frame(MB, MA)));
    const fresh = w.log.slice(before);
    expect(fresh.filter((l) => l.tag === 'host-receive' && l.deviceId === 'A')).toHaveLength(1);
    expect(fresh.some((l) => l.deviceId === 'C')).toBe(false); // C n'a rien reçu
    // MA appris au 1er échange (tick 10) ; MB au retour de B (tick 30).
    expect(macTable(w, 'X')).toEqual([
      { mac: MA, interfaceId: 'X_p0', learnedAtTick: LINK_DELAY },
      { mac: MB, interfaceId: 'X_p1', learnedAtTick: 3 * LINK_DELAY },
    ]);
  });

  it('diffuse une trame de broadcast à tous (sauf l’entrant)', () => {
    const w = run(
      emitFrame(createWorld(star('switch')), endpoint('A', 'A_e0'), frame(MA, BROADCAST_MAC)),
    );
    expect(receives(w, 'B')).toBe(1);
    expect(receives(w, 'C')).toBe(1);
    expect(receives(w, 'A')).toBe(0);
  });
});

describe('step', () => {
  it('renvoie le world inchangé quand la file est vide', () => {
    const w = createWorld(emptyTopology());
    expect(step(w)).toBe(w);
  });
});
