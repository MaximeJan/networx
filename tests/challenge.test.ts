// Défis : chaque défi doit ÉCHOUER sur son setup initial, puis RÉUSSIR après la
// solution attendue de l'élève (jouée ici par les mutations pures de lib/topology,
// y compris la CONSTRUCTION d'appareils via devices/registry.createDevice — les
// contrôles désignent les machines par leur NOM, comme dans l'app).

import { describe, it, expect } from 'vitest';
import type { Topology } from '../src/domain/types';
import {
  addDevice,
  addLink,
  endpoint,
  installApp,
  removeLink,
  setDeviceDhcp,
  setDeviceFields,
  setDeviceNat,
  setDeviceRoutes,
  setDeviceRouting,
  setDnsRecords,
  setDnsRecursive,
  updateInterface,
} from '../src/lib/topology';
import { createDevice } from '../src/devices/registry';
import { deserialize } from '../src/lib/persist';
import { CHALLENGES, getChallenge } from '../src/challenges';
import { verifyChallenge } from '../src/lib/challenge';

function ch(id: string) {
  const c = getChallenge(id);
  if (!c) throw new Error(`défi inconnu : ${id}`);
  return c;
}
const failsInitially = (id: string) => expect(verifyChallenge(ch(id).setup, ch(id).goal).ok).toBe(false);
const passes = (id: string, t: Topology) => {
  const r = verifyChallenge(t, ch(id).goal);
  expect(r.results.filter((x) => !x.ok).map((x) => `${x.label} — ${x.detail}`)).toEqual([]);
  expect(r.ok).toBe(true);
};

describe('structure générale', () => {
  it('tous les défis ont un niveau, des étapes et au moins un contrôle', () => {
    for (const c of CHALLENGES) {
      expect(c.level).toBeGreaterThanOrEqual(1);
      expect(c.level).toBeLessThanOrEqual(5);
      expect(c.steps.length).toBeGreaterThan(0);
      expect(c.goal.checks.length).toBeGreaterThan(0);
    }
  });

  it('chaque défi échoue sur son setup initial', () => {
    for (const c of CHALLENGES) {
      expect(verifyChallenge(c.setup, c.goal).ok, c.id).toBe(false);
    }
  });

  it('la checklist rapporte un résultat PAR contrôle', () => {
    const c = ch('premier-reseau');
    const r = verifyChallenge(c.setup, c.goal);
    expect(r.results).toHaveLength(c.goal.checks.length);
    expect(r.results[0].detail).toMatch(/Ordinateur/i);
  });

  it('chaque setup survit à la (dé)sérialisation faite au chargement du défi', () => {
    // App.loadChallenge passe le setup par deserialize : rien ne doit s'y perdre.
    for (const c of CHALLENGES) {
      const t = deserialize(JSON.stringify({ version: 1, topology: c.setup }));
      expect(t, c.id).not.toBeNull();
      expect(t!.devices.length, c.id).toBe(c.setup.devices.length);
      expect(t!.links.length, c.id).toBe(c.setup.links.length);
      expect((t!.annotations ?? []).length, c.id).toBe((c.setup.annotations ?? []).length);
      expect(verifyChallenge(t!, c.goal).ok, c.id).toBe(false); // toujours non résolu
    }
  });

  it('un appareil manquant est expliqué par son NOM', () => {
    const c = ch('premier-reseau');
    let t = c.setup;
    t = addDevice(t, createDevice('pc', 0, 0, 'ORDI-A'));
    t = addDevice(t, createDevice('pc', 100, 0, 'ORDI-B'));
    const r = verifyChallenge(t, c.goal);
    expect(r.results[1].detail).toMatch(/Aucun appareil ne s'appelle « PC1 »/);
  });
});

describe('niveau 1 — premiers pas', () => {
  it('1 · premier-reseau : construit de zéro (2 PC câblés et adressés)', () => {
    failsInitially('premier-reseau');
    let t = ch('premier-reseau').setup;
    const pc1 = createDevice('pc', 160, 160, 'PC1');
    const pc2 = createDevice('pc', 400, 160, 'PC2');
    t = addDevice(addDevice(t, pc1), pc2);
    t = updateInterface(t, pc1.id, pc1.interfaces[0].id, { ip: '192.168.1.10', prefix: 24 });
    t = updateInterface(t, pc2.id, pc2.interfaces[0].id, { ip: '192.168.1.20', prefix: 24 });
    t = addLink(t, endpoint(pc1.id, pc1.interfaces[0].id), endpoint(pc2.id, pc2.interfaces[0].id))!;
    passes('premier-reseau', t);
  });

  it('2 · troisieme-poste : recâblage autour d’un commutateur + PC3', () => {
    failsInitially('troisieme-poste');
    let t = ch('troisieme-poste').setup;
    t = removeLink(t, 'l1');
    const sw1 = createDevice('switch', 380, 245, 'SW1');
    const pc3 = createDevice('pc', 600, 245, 'PC3');
    t = addDevice(addDevice(t, sw1), pc3);
    t = updateInterface(t, pc3.id, pc3.interfaces[0].id, { ip: '192.168.1.30', prefix: 24 });
    t = addLink(t, endpoint('pc1', 'pc1_e0'), endpoint(sw1.id, sw1.interfaces[0].id))!;
    t = addLink(t, endpoint('pc2', 'pc2_e0'), endpoint(sw1.id, sw1.interfaces[1].id))!;
    t = addLink(t, endpoint(pc3.id, pc3.interfaces[0].id), endpoint(sw1.id, sw1.interfaces[2].id))!;
    passes('troisieme-poste', t);
  });

  it('3 · poste-muet : corriger l’adresse de PC3 suffit', () => {
    failsInitially('poste-muet');
    let t = ch('poste-muet').setup;
    t = updateInterface(t, 'pc3', 'pc3_e0', { ip: '192.168.1.30', prefix: 24 });
    passes('poste-muet', t);
  });
});

describe('niveau 2 — adresses', () => {
  it('4 · masque : élargir le masque de COMPTA en /16', () => {
    failsInitially('masque');
    let t = ch('masque').setup;
    t = updateInterface(t, 'compta', 'compta_e0', { ip: '10.0.2.20', prefix: 16 });
    passes('masque', t);
  });

  it('5 · deux-salles : câbler et adresser les deux îlots', () => {
    failsInitially('deux-salles');
    let t = ch('deux-salles').setup;
    t = addLink(t, endpoint('a1', 'a1_e0'), endpoint('swa', 'swa_p0'))!;
    t = addLink(t, endpoint('a2', 'a2_e0'), endpoint('swa', 'swa_p1'))!;
    t = addLink(t, endpoint('b1', 'b1_e0'), endpoint('swb', 'swb_p0'))!;
    t = addLink(t, endpoint('b2', 'b2_e0'), endpoint('swb', 'swb_p1'))!;
    t = updateInterface(t, 'a1', 'a1_e0', { ip: '172.16.1.10', prefix: 24 });
    t = updateInterface(t, 'a2', 'a2_e0', { ip: '172.16.1.11', prefix: 24 });
    t = updateInterface(t, 'b1', 'b1_e0', { ip: '172.16.2.10', prefix: 24 });
    t = updateInterface(t, 'b2', 'b2_e0', { ip: '172.16.2.11', prefix: 24 });
    passes('deux-salles', t);
  });
});

describe('niveau 3 — routage', () => {
  it('6 · routeur : ajouter le routeur, ses adresses et les passerelles', () => {
    failsInitially('routeur');
    let t = ch('routeur').setup;
    const r = createDevice('router', 500, 225, 'R1');
    t = addDevice(t, r);
    t = addLink(t, endpoint(r.id, r.interfaces[0].id), endpoint('swa', 'swa_p2'))!;
    t = addLink(t, endpoint(r.id, r.interfaces[1].id), endpoint('swb', 'swb_p2'))!;
    t = updateInterface(t, r.id, r.interfaces[0].id, { ip: '172.16.1.1', prefix: 24 });
    t = updateInterface(t, r.id, r.interfaces[1].id, { ip: '172.16.2.1', prefix: 24 });
    t = setDeviceFields(t, 'a1', { gateway: '172.16.1.1' });
    t = setDeviceFields(t, 'a2', { gateway: '172.16.1.1' });
    t = setDeviceFields(t, 'b1', { gateway: '172.16.2.1' });
    t = setDeviceFields(t, 'b2', { gateway: '172.16.2.1' });
    passes('routeur', t);
  });

  it('7 · reponse-perdue : la passerelle manquante d’ARCHIVES', () => {
    failsInitially('reponse-perdue');
    let t = ch('reponse-perdue').setup;
    t = setDeviceFields(t, 'archives', { gateway: '192.168.2.1' });
    passes('reponse-perdue', t);
  });

  it('7 · reponse-perdue : le diagnostic initial pointe le chemin du retour', () => {
    const c = ch('reponse-perdue');
    const r = verifyChallenge(c.setup, c.goal);
    expect(r.results[0].detail).toMatch(/passerelle|retour/i);
  });

  it('8 · deux-batiments : passerelle par défaut sur chaque routeur', () => {
    failsInitially('deux-batiments');
    let t = ch('deux-batiments').setup;
    t = setDeviceFields(t, 'rf', { gateway: '10.0.0.2' });
    t = setDeviceFields(t, 'rb', { gateway: '10.0.0.1' });
    passes('deux-batiments', t);
  });

  it('9 · boucle : corriger la route erronée de R2 casse la boucle', () => {
    failsInitially('boucle');
    // La panne initiale fait bien TOURNER le paquet : TTL/boucle au diagnostic.
    const before = verifyChallenge(ch('boucle').setup, ch('boucle').goal);
    expect(before.results[0].detail).toMatch(/TTL|boucle/i);
    let t = ch('boucle').setup;
    t = setDeviceRoutes(t, 'r2', [{ destination: '192.168.3.0', prefix: 24, gateway: '10.0.23.2', interfaceId: 'r2_e1' }]);
    passes('boucle', t);
  });
});

describe('niveau 4 — services', () => {
  it('10 · classe-mobile : câbler les portables + activer le DHCP', () => {
    failsInitially('classe-mobile');
    let t = ch('classe-mobile').setup;
    t = addLink(t, endpoint('port1', 'port1_e0'), endpoint('sw1', 'sw1_p0'))!;
    t = addLink(t, endpoint('port2', 'port2_e0'), endpoint('sw1', 'sw1_p1'))!;
    t = addLink(t, endpoint('port3', 'port3_e0'), endpoint('sw1', 'sw1_p2'))!;
    t = setDeviceDhcp(t, 'r1', { poolStart: '192.168.1.100', poolSize: 20, prefix: 24, gateway: '192.168.1.1' });
    passes('classe-mobile', t);
  });

  it('11 · noms : installer le serveur DNS sur ADMIN + enregistrement A', () => {
    failsInitially('noms');
    let t = ch('noms').setup;
    t = installApp(t, 'admin', 'dns-server');
    t = setDnsRecords(t, 'admin', [{ type: 'A', name: 'intranet.local', value: '192.168.1.20' }]);
    passes('noms', t);
  });

  it('12 · intranet : construire commutation + DHCP + DNS + web', () => {
    failsInitially('intranet');
    let t = ch('intranet').setup;
    const sw1 = createDevice('switch', 400, 250, 'SW1');
    const r1 = createDevice('router', 600, 150, 'R1');
    t = addDevice(addDevice(t, sw1), r1);
    t = addLink(t, endpoint('serveur', 'serveur_e0'), endpoint(sw1.id, sw1.interfaces[0].id))!;
    t = addLink(t, endpoint('eleve1', 'eleve1_e0'), endpoint(sw1.id, sw1.interfaces[1].id))!;
    t = addLink(t, endpoint('eleve2', 'eleve2_e0'), endpoint(sw1.id, sw1.interfaces[2].id))!;
    t = addLink(t, endpoint(r1.id, r1.interfaces[0].id), endpoint(sw1.id, sw1.interfaces[3].id))!;
    t = updateInterface(t, r1.id, r1.interfaces[0].id, { ip: '10.10.0.1', prefix: 24 });
    t = setDeviceDhcp(t, r1.id, { poolStart: '10.10.0.100', poolSize: 20, prefix: 24, gateway: '10.10.0.1', dns: '10.10.0.53' });
    t = installApp(t, 'serveur', 'web-server');
    t = installApp(t, 'serveur', 'dns-server');
    t = setDnsRecords(t, 'serveur', [{ type: 'A', name: 'intranet.local', value: '10.10.0.53' }]);
    passes('intranet', t);
  });
});

describe('niveau 5 — vers l’Internet', () => {
  it('13 · nat : désigner l’interface externe active la translation', () => {
    failsInitially('nat');
    let t = ch('nat').setup;
    t = setDeviceNat(t, 'r1', { wanInterfaceId: 'r1_e1' });
    passes('nat', t);
  });

  it('14 · nat-port : la redirection de port expose SRV', () => {
    failsInitially('nat-port');
    let t = ch('nat-port').setup;
    t = setDeviceNat(t, 'r1', {
      wanInterfaceId: 'r1_e1',
      portForwards: [{ proto: 'tcp', publicPort: 80, privateIp: '192.168.1.10', privatePort: 80 }],
    });
    passes('nat-port', t);
  });

  it('15 · routage-dynamique : RIP sur les trois routeurs', () => {
    failsInitially('routage-dynamique');
    let t = ch('routage-dynamique').setup;
    for (const id of ['r1', 'r2', 'r3']) t = setDeviceRouting(t, id, 'rip');
    passes('routage-dynamique', t);
  });

  it('15 · routage-dynamique : OSPF fonctionne aussi', () => {
    let t = ch('routage-dynamique').setup;
    for (const id of ['r1', 'r2', 'r3']) t = setDeviceRouting(t, id, 'ospf');
    passes('routage-dynamique', t);
  });

  it('16 · dns-iteratif : la délégation NS débloque la résolution', () => {
    failsInitially('dns-iteratif');
    let t = ch('dns-iteratif').setup;
    t = setDnsRecords(t, 'dns1', [{ type: 'NS', name: 'local', value: '192.168.1.53' }]);
    passes('dns-iteratif', t);
  });

  it('17 · dns-recursif : activer la récursivité du résolveur', () => {
    failsInitially('dns-recursif');
    let t = ch('dns-recursif').setup;
    t = setDnsRecursive(t, 'dns1', true);
    passes('dns-recursif', t);
  });
});
