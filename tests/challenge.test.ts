import { describe, it, expect } from 'vitest';
import { CHALLENGES, getChallenge } from '../src/challenges';
import { verifyGoal } from '../src/lib/challenge';
import {
  addLink,
  endpoint,
  setDeviceDhcp,
  setDeviceFields,
  setDeviceRoutes,
  setDeviceRouting,
  setDnsRecords,
  setDnsRecursive,
  updateInterface,
} from '../src/lib/topology';

describe('défis — non triviaux au départ', () => {
  it('chaque défi échoue tant qu’on n’a rien fait', () => {
    for (const c of CHALLENGES) {
      const res = verifyGoal(c.setup, c.goal);
      expect(res.ok, `le défi « ${c.id} » ne devrait pas être déjà résolu`).toBe(false);
    }
  });
});

describe('défis — réussite après la bonne action', () => {
  it('cable : relier PC2 au switch', () => {
    const c = getChallenge('cable')!;
    const fixed = addLink(c.setup, endpoint('pc2', 'pc2_e0'), endpoint('sw1', 'sw1_p1'))!;
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('ip : corriger l’adresse de PC2', () => {
    const c = getChallenge('ip')!;
    const fixed = updateInterface(c.setup, 'pc2', 'pc2_e0', { ip: '192.168.1.20', prefix: 24 });
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('mask : élargir le masque de PC2 à /16', () => {
    const c = getChallenge('mask')!;
    const fixed = updateInterface(c.setup, 'pc2', 'pc2_e0', { prefix: 16 });
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('gateway : renseigner les passerelles', () => {
    const c = getChallenge('gateway')!;
    let fixed = setDeviceFields(c.setup, 'pc1', { gateway: '192.168.1.1' });
    fixed = setDeviceFields(fixed, 'pc2', { gateway: '192.168.2.1' });
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('two-routers : passerelles par défaut sur R1 et R2', () => {
    const c = getChallenge('two-routers')!;
    let fixed = setDeviceFields(c.setup, 'r1', { gateway: '10.0.0.2' });
    fixed = setDeviceFields(fixed, 'r2', { gateway: '10.0.0.1' });
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('dhcp : activer le serveur DHCP sur le routeur', () => {
    const c = getChallenge('dhcp')!;
    const fixed = setDeviceDhcp(c.setup, 'r1', {
      poolStart: '192.168.1.100',
      poolSize: 20,
      prefix: 24,
      gateway: '192.168.1.1',
    });
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('dhcp-options : ajouter le DNS distribué', () => {
    const c = getChallenge('dhcp-options')!;
    const fixed = setDeviceDhcp(c.setup, 'r1', {
      poolStart: '192.168.1.100',
      poolSize: 20,
      prefix: 24,
      gateway: '192.168.1.1',
      dns: '192.168.1.53',
    });
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('dns-web : ajouter l’enregistrement DNS', () => {
    const c = getChallenge('dns-web')!;
    const fixed = setDnsRecords(c.setup, 'dns1', [{ type: 'A', name: 'site.local', value: '192.168.1.20' }]);
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('dns-cname : ajouter l’alias www', () => {
    const c = getChallenge('dns-cname')!;
    const fixed = setDnsRecords(c.setup, 'dns1', [
      { type: 'A', name: 'site.local', value: '192.168.1.20' },
      { type: 'CNAME', name: 'www.site.local', value: 'site.local' },
    ]);
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('dns-iteratif : ajouter la délégation NS sur DNS1', () => {
    const c = getChallenge('dns-iteratif')!;
    const fixed = setDnsRecords(c.setup, 'dns1', [{ type: 'NS', name: 'local', value: '192.168.1.53' }]);
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('dns-recursif : activer la résolution récursive sur DNS1', () => {
    const c = getChallenge('dns-recursif')!;
    const fixed = setDnsRecursive(c.setup, 'dns1', true);
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('route-statique : ajouter la route vers 192.168.3.0/24 sur R1', () => {
    const c = getChallenge('route-statique')!;
    const fixed = setDeviceRoutes(c.setup, 'r1', [
      { destination: '192.168.3.0', prefix: 24, gateway: '10.0.13.2', interfaceId: 'r1_e2' },
    ]);
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('routage-dynamique : activer RIP sur tous les routeurs', () => {
    const c = getChallenge('routage-dynamique')!;
    let fixed = c.setup;
    for (const id of ['r1', 'r2', 'r3']) fixed = setDeviceRouting(fixed, id, 'rip');
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });

  it('routage-dynamique : OSPF fonctionne aussi', () => {
    const c = getChallenge('routage-dynamique')!;
    let fixed = c.setup;
    for (const id of ['r1', 'r2', 'r3']) fixed = setDeviceRouting(fixed, id, 'ospf');
    expect(verifyGoal(fixed, c.goal).ok).toBe(true);
  });
});
