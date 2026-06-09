// Moteur temporel : mappe le temps réel (requestAnimationFrame) vers les ticks
// virtuels du moteur à événements discrets. Play/pause/pas-à-pas/vitesse.
//
// Clé de performance (cf. Logix) : on N'ARME le rAF que s'il y a du travail
// (file d'événements non vide). Quand tout est livré, la boucle s'arrête d'elle-
// même ; un ping (qui injecte des événements) la relance via `restart`.
//
// L'horloge continue `clock` (float) sert à INTERPOLER la position des paquets en
// vol entre leur départ et leur arrivée ; le moteur, lui, traite les événements
// dès que leur date (atTick) est atteinte par l'horloge.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Topology, World } from '../domain/types';
import {
  createWorld,
  step,
  startPing,
  startDnsLookup,
  startHttpGet,
  startDhcp,
  startTraceroute,
  autoConfigureDhcp,
  reapplyDhcpLeases,
  applyDynamicRoutes,
} from '../lib/engine';

/** Crée un world et lance la demande DHCP automatique des hôtes sans IP. */
function freshWorld(topology: Topology): World {
  return autoConfigureDhcp(createWorld(topology));
}

/** Ticks virtuels par seconde à vitesse 1. */
const BASE_TPS = 12;

function nextEventTick(w: World): number {
  let m = Infinity;
  for (const e of w.eventQueue) if (e.atTick < m) m = e.atTick;
  return m;
}

export interface SimEngine {
  world: World;
  clock: number;
  playing: boolean;
  speed: number;
  busy: boolean;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  stepOnce: () => void;
  reset: () => void;
  /** Ping vers une IP ou un nom (résolu par DNS). `reqId` relie la réponse. */
  ping: (deviceId: string, target: string, reqId: number) => void;
  /** Résolution DNS d'un nom. `reqId` relie la réponse. */
  lookup: (deviceId: string, name: string, reqId: number) => void;
  /** Requête HTTP GET (URL par IP ou nom). `reqId` relie la réponse. */
  httpGet: (deviceId: string, url: string, reqId: number) => void;
  /** Demande une adresse IP par DHCP. `reqId` relie la réponse. */
  dhcp: (deviceId: string, reqId: number) => void;
  /** Trace la route vers une IP (echo-requests à TTL croissant). */
  traceroute: (deviceId: string, target: string, reqId: number) => void;
}

export function useSimulationEngine(topology: Topology): SimEngine {
  const worldRef = useRef<World>(freshWorld(topology));
  const clockRef = useRef(0);
  const speedRef = useRef(1);

  const [, force] = useState(0);
  const render = useCallback(() => force((f) => (f + 1) % 1_000_000), []);
  const [playing, setPlayingState] = useState(true);
  const [speed, setSpeedState] = useState(1);
  const [restart, setRestart] = useState(0);

  const setSpeed = useCallback((s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  }, []);
  const setPlaying = useCallback((p: boolean) => setPlayingState(p), []);

  /** Traite tous les événements dont la date est atteinte par l'horloge. */
  const pump = useCallback(() => {
    let w = worldRef.current;
    let guard = 0;
    while (w.eventQueue.length > 0 && nextEventTick(w) <= clockRef.current && guard < 5000) {
      w = step(w);
      guard++;
    }
    worldRef.current = w;
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (worldRef.current.eventQueue.length === 0) return; // rien à animer
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      clockRef.current += dt * BASE_TPS * speedRef.current;
      // Temps mort : aucun paquet en vol mais un événement daté attend (ex.
      // expiration ARP) → rien à animer d'ici là, on saute à sa date.
      const w = worldRef.current;
      if (w.inFlight.length === 0 && w.eventQueue.length > 0) {
        clockRef.current = Math.max(clockRef.current, nextEventTick(w));
      }
      pump();
      render();
      if (worldRef.current.eventQueue.length === 0) return; // plus rien en vol → on s'arrête
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, restart, pump, render]);

  const stepOnce = useCallback(() => {
    const w = worldRef.current;
    if (w.eventQueue.length === 0) return;
    const next = step(w);
    worldRef.current = next;
    clockRef.current = next.tick;
    render();
  }, [render]);

  const reset = useCallback(() => {
    worldRef.current = freshWorld(topology);
    clockRef.current = 0;
    render();
    // La config DHCP automatique de `freshWorld` réinjecte des paquets : on ré-arme
    // la boucle rAF (sinon, si elle s'était arrêtée, ces paquets resteraient figés).
    setRestart((r) => r + 1);
  }, [topology, render]);

  // Synchronise la config du document (apps installées, enregistrements DNS,
  // serveur DNS…) dans le world en cours, sans interrompre la simulation. On
  // réapplique ensuite les baux DHCP pour ne pas perdre les IP dynamiques.
  useEffect(() => {
    // Recalcule aussi les routes RIP/OSPF (la topologie/les débits ont pu changer),
    // sans re-journaliser (le journal des routes apprises est émis à la création/réinit).
    worldRef.current = applyDynamicRoutes(reapplyDhcpLeases({ ...worldRef.current, topology }), { silent: true });
    render();
  }, [topology, render]);

  const ping = useCallback(
    (deviceId: string, target: string, reqId: number) => {
      clockRef.current = Math.max(clockRef.current, worldRef.current.tick);
      worldRef.current = startPing(worldRef.current, deviceId, target, reqId, reqId);
      render();
      setRestart((r) => r + 1); // relance la boucle si elle dormait
    },
    [render],
  );

  const lookup = useCallback(
    (deviceId: string, name: string, reqId: number) => {
      clockRef.current = Math.max(clockRef.current, worldRef.current.tick);
      worldRef.current = startDnsLookup(worldRef.current, deviceId, name, reqId);
      render();
      setRestart((r) => r + 1);
    },
    [render],
  );

  const httpGet = useCallback(
    (deviceId: string, url: string, reqId: number) => {
      clockRef.current = Math.max(clockRef.current, worldRef.current.tick);
      worldRef.current = startHttpGet(worldRef.current, deviceId, url, reqId);
      render();
      setRestart((r) => r + 1);
    },
    [render],
  );

  const dhcp = useCallback(
    (deviceId: string, reqId: number) => {
      clockRef.current = Math.max(clockRef.current, worldRef.current.tick);
      worldRef.current = startDhcp(worldRef.current, deviceId, reqId);
      render();
      setRestart((r) => r + 1);
    },
    [render],
  );

  const traceroute = useCallback(
    (deviceId: string, target: string, reqId: number) => {
      clockRef.current = Math.max(clockRef.current, worldRef.current.tick);
      worldRef.current = startTraceroute(worldRef.current, deviceId, target, reqId);
      render();
      setRestart((r) => r + 1);
    },
    [render],
  );

  return {
    world: worldRef.current,
    clock: clockRef.current,
    playing,
    speed,
    busy: worldRef.current.eventQueue.length > 0,
    setPlaying,
    setSpeed,
    stepOnce,
    reset,
    ping,
    lookup,
    httpGet,
    dhcp,
    traceroute,
  };
}
