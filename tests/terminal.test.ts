import { describe, it, expect } from 'vitest';
import type { Device, World } from '../src/domain/types';
import { runCommand } from '../src/lib/terminal';
import { createWorld } from '../src/lib/engine';
import { emptyTopology, addDevice } from '../src/lib/topology';
import { withArp } from '../src/lib/stack/arp';

function pc(): Device {
  return {
    id: 'A',
    kind: 'pc',
    name: 'PC1',
    x: 0,
    y: 0,
    gateway: '192.168.1.1',
    interfaces: [{ id: 'e0', name: 'eth0', mac: '02:00:00:00:00:0a', ip: '192.168.1.10', prefix: 24 }],
  };
}

function ctxWith(device: Device): { device: Device; world: World } {
  const world = createWorld(addDevice(emptyTopology(), device));
  return { device, world };
}

describe('runCommand', () => {
  const ctx = ctxWith(pc());

  it('help liste les commandes', () => {
    const r = runCommand('help', ctx);
    expect(r.kind).toBe('output');
    expect(r.kind === 'output' && r.lines.join('\n')).toMatch(/ping/);
  });

  it('clear renvoie une intention clear', () => {
    expect(runCommand('clear', ctx)).toEqual({ kind: 'clear' });
  });

  it('ligne vide ne produit rien', () => {
    expect(runCommand('   ', ctx)).toEqual({ kind: 'output', lines: [] });
  });

  it('ipconfig affiche IP, masque et passerelle', () => {
    const r = runCommand('ipconfig', ctx);
    const text = r.kind === 'output' ? r.lines.join('\n') : '';
    expect(text).toMatch(/192\.168\.1\.10/);
    expect(text).toMatch(/255\.255\.255\.0/);
    expect(text).toMatch(/192\.168\.1\.1/); // passerelle
  });

  it('arp affiche le cache (vide puis rempli)', () => {
    expect(runCommand('arp', ctx)).toEqual({ kind: 'output', lines: ['Cache ARP vide.'] });
    const world = ctx.world;
    world.runtime['A'].arpCache = withArp([], '192.168.1.20', '02:00:00:00:00:0b', 5);
    const r = runCommand('arp', { device: ctx.device, world });
    const text = r.kind === 'output' ? r.lines.join('\n') : '';
    expect(text).toMatch(/192\.168\.1\.20/);
    expect(text).toMatch(/02:00:00:00:00:0b/);
  });

  it('ping renvoie l’intention avec la cible (IP ou nom)', () => {
    expect(runCommand('ping 192.168.1.20', ctx)).toEqual({ kind: 'ping', target: '192.168.1.20' });
    expect(runCommand('ping serveur.local', ctx)).toEqual({ kind: 'ping', target: 'serveur.local' });
  });

  it('ping sans argument → erreur', () => {
    expect(runCommand('ping', ctx).kind).toBe('error');
  });

  it('nslookup renvoie l’intention de résolution', () => {
    expect(runCommand('nslookup serveur.local', ctx)).toEqual({ kind: 'lookup', name: 'serveur.local' });
    expect(runCommand('nslookup', ctx).kind).toBe('error');
  });

  it('route affiche le réseau connecté et la passerelle', () => {
    const r = runCommand('route', ctx);
    const text = r.kind === 'output' ? r.lines.join('\n') : '';
    expect(text).toMatch(/192\.168\.1\.0\/24/);
    expect(text).toMatch(/192\.168\.1\.1/); // passerelle par défaut
  });

  it('traceroute exige une IP valide', () => {
    expect(runCommand('traceroute 10.0.0.1', ctx)).toEqual({ kind: 'traceroute', target: '10.0.0.1' });
    expect(runCommand('traceroute pas-une-ip', ctx).kind).toBe('error');
    expect(runCommand('traceroute', ctx).kind).toBe('error');
  });

  it('commande inconnue → erreur', () => {
    const r = runCommand('foobar', ctx);
    expect(r.kind).toBe('error');
    expect(r.kind === 'error' && r.lines[0]).toMatch(/inconnue/);
  });
});
