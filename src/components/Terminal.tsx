// Terminal d'une machine : commandes réseau + historique (↑/↓). La logique
// d'analyse est pure (lib/terminal) ; ici on gère l'affichage et le suivi
// ASYNCHRONE des requêtes (ping, DNS, DHCP, traceroute) en lisant le journal
// du moteur, repérées par un identifiant de requête.

import { useEffect, useRef, useState } from 'react';
import type { Device } from '../domain/types';
import { runCommand } from '../lib/terminal';
import { diagnoseFailure } from '../lib/diagnose';
import type { SimEngine } from '../hooks/useSimulationEngine';

interface Props {
  device: Device;
  engine: SimEngine;
}

interface Pending {
  label: string;
  kind: 'ping' | 'lookup' | 'dhcp';
  start: number;
}

interface Tracing {
  active: boolean;
  hops: Map<number, string>;
  reached?: number;
}

export default function Terminal({ device, engine }: Props) {
  const [lines, setLines] = useState<string[]>([
    `Terminal de ${device.name} — tapez « help » pour la liste des commandes.`,
  ]);
  const [input, setInput] = useState('');
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const tracingRef = useRef<Tracing | null>(null);
  const reqRef = useRef(1);
  const seenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Historique des commandes saisies (pour ↑/↓).
  const historyRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);

  const append = (ls: string[]) => setLines((prev) => [...prev, ...ls]);

  useEffect(() => {
    const log = engine.world.log;
    for (let i = seenRef.current; i < log.length; i++) {
      const e = log[i];
      if (e.deviceId !== device.id || e.seq === undefined) continue;
      // Collecte traceroute (sauts via time-exceeded ou réponse finale).
      const tr = tracingRef.current;
      if (tr?.active && e.tag === 'icmp' && e.ip) {
        if (/TTL expiré signalé par/.test(e.message)) tr.hops.set(e.seq, e.ip);
        else if (/réponse au ping/.test(e.message)) {
          tr.hops.set(e.seq, e.ip);
          tr.reached = tr.reached === undefined ? e.seq : Math.min(tr.reached, e.seq);
        }
      }
      const p = pendingRef.current.get(e.seq);
      if (!p) continue;
      if (e.tag === 'icmp' && /réponse au ping/.test(e.message)) {
        // 1 tick ≈ 1 milliseconde simulée (comme l'affichage d'un vrai ping).
        append([`Réponse de ${e.ip} : ttl=${e.ttl ?? '?'} temps=${e.tick - p.start} ms`]);
        pendingRef.current.delete(e.seq);
      } else if (e.tag === 'dns' && /a pour adresse/.test(e.message)) {
        append([`Résolution DNS : ${p.label} → ${e.ip}`]);
        if (p.kind === 'lookup') pendingRef.current.delete(e.seq);
      } else if (e.tag === 'dns' && /introuvable/.test(e.message)) {
        append([`${p.label} : nom introuvable (DNS).`]);
        pendingRef.current.delete(e.seq);
      } else if (e.tag === 'dns' && /n'offre pas de service DNS/.test(e.message)) {
        append([`Échec : le serveur interrogé (${e.ip}) n'offre pas de service DNS.`]);
        pendingRef.current.delete(e.seq);
      } else if (e.tag === 'dhcp' && /a obtenu/.test(e.message)) {
        append([`Adresse obtenue par DHCP : ${e.ip}`]);
        pendingRef.current.delete(e.seq);
      } else if (e.tag === 'drop' && /aucun serveur DNS/.test(e.message)) {
        append(['Aucun serveur DNS configuré sur cette machine.']);
        pendingRef.current.delete(e.seq);
      }
    }
    seenRef.current = log.length;
  }, [engine.world.log, device.id]);

  // Au repos : finalise les requêtes restées sans réponse + le traceroute.
  useEffect(() => {
    if (engine.busy) return;
    if (pendingRef.current.size > 0) {
      const msgs: string[] = [];
      for (const [, p] of pendingRef.current) {
        msgs.push(`Délai d'attente dépassé pour ${p.label}.`);
        // Diagnostic pédagogique : explique le « pourquoi » probable de l'échec.
        const diag = diagnoseFailure({
          world: engine.world,
          deviceId: device.id,
          kind: p.kind,
          target: p.label,
          sinceTick: p.start,
        });
        for (const line of diag) msgs.push(`  ${line}`);
      }
      pendingRef.current.clear();
      append(msgs);
    }
    const tr = tracingRef.current;
    if (tr?.active) {
      tr.active = false;
      const last = tr.reached ?? Math.max(0, ...tr.hops.keys());
      const out: string[] = [];
      for (let h = 1; h <= last; h++) out.push(`  ${h}\t${tr.hops.get(h) ?? '* (pas de réponse)'}`);
      out.push(tr.reached ? `Destination atteinte en ${tr.reached} saut(s).` : 'Destination non atteinte.');
      append(out);
    }
    // `engine.world`/`device.id` sont lus pour le diagnostic ; pendant l'animation
    // le garde `engine.busy` fait sortir tôt, donc l'effet n'agit qu'au repos.
  }, [engine.busy, engine.world, device.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input;
    setInput('');
    if (cmd.trim() !== '') {
      historyRef.current.push(cmd);
      if (historyRef.current.length > 50) historyRef.current.shift();
    }
    histIdxRef.current = -1;
    append([`> ${cmd}`]);
    const result = runCommand(cmd, { device, world: engine.world });
    switch (result.kind) {
      case 'clear':
        setLines([]);
        break;
      case 'output':
      case 'error':
        append(result.lines);
        break;
      case 'ping': {
        const reqId = reqRef.current++;
        pendingRef.current.set(reqId, { label: result.target, kind: 'ping', start: engine.world.tick });
        append([`Envoi d'une requête « ping » vers ${result.target}…`]);
        engine.ping(device.id, result.target, reqId);
        break;
      }
      case 'lookup': {
        const reqId = reqRef.current++;
        pendingRef.current.set(reqId, { label: result.name, kind: 'lookup', start: engine.world.tick });
        append([`Résolution DNS de ${result.name}…`]);
        engine.lookup(device.id, result.name, reqId);
        break;
      }
      case 'traceroute': {
        const reqId = reqRef.current++;
        tracingRef.current = { active: true, hops: new Map() };
        append([`Trace de la route vers ${result.target} (max 8 sauts)…`]);
        engine.traceroute(device.id, result.target, reqId);
        break;
      }
      case 'dhcp': {
        const reqId = reqRef.current++;
        pendingRef.current.set(reqId, { label: 'DHCP', kind: 'dhcp', start: engine.world.tick });
        append(['Demande d’une adresse IP par DHCP…']);
        engine.dhcp(device.id, reqId);
        break;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const h = historyRef.current;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (h.length === 0) return;
      histIdxRef.current = histIdxRef.current < 0 ? h.length - 1 : Math.max(0, histIdxRef.current - 1);
      setInput(h[histIdxRef.current]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdxRef.current < 0) return;
      histIdxRef.current += 1;
      if (histIdxRef.current >= h.length) {
        histIdxRef.current = -1;
        setInput('');
      } else {
        setInput(h[histIdxRef.current]);
      }
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-900 font-mono text-xs text-slate-100">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {lines.map((l, i) => (
          <div key={i} className="whitespace-pre-wrap leading-snug">
            {l}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-1 border-t border-slate-700 px-2 py-1">
        <span className="text-emerald-400">{device.name}&gt;</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="flex-1 bg-transparent outline-none"
        />
      </form>
    </div>
  );
}
