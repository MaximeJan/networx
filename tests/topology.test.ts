import { describe, it, expect } from 'vitest';
import type { Device, NetInterface, Topology } from '../src/domain/types';
import {
  addAnnotation,
  addDevice,
  addLink,
  canConnect,
  countDevicesWithIp,
  emptyTopology,
  endpoint,
  findDevice,
  findInterface,
  firstFreeInterface,
  installApp,
  isPortBusy,
  moveDevice,
  moveDevicesTo,
  normalizeTopology,
  pasteDevices,
  removeAnnotation,
  removeDevice,
  removeDevices,
  removeLink,
  setDeviceFields,
  setDeviceRoutes,
  uninstallApp,
  updateAnnotation,
  updateInterface,
} from '../src/lib/topology';

function itf(id: string): NetInterface {
  return { id, name: id, mac: 'aa:bb:cc:dd:ee:ff' };
}
function pc(id: string, ifs: string[]): Device {
  return { id, kind: 'pc', name: id, x: 0, y: 0, interfaces: ifs.map(itf) };
}

function twoPcs(): Topology {
  return { name: 'net', devices: [pc('d1', ['i1']), pc('d2', ['i2'])], links: [] };
}

describe('addDevice / moveDevice', () => {
  it('ajoute un appareil', () => {
    const t = addDevice(emptyTopology(), pc('d1', ['i1']));
    expect(t.devices).toHaveLength(1);
  });
  it('déplace un appareil sans toucher aux autres', () => {
    const t = moveDevice(twoPcs(), 'd1', 50, 60);
    expect(t.devices[0]).toMatchObject({ x: 50, y: 60 });
    expect(t.devices[1]).toMatchObject({ x: 0, y: 0 });
  });
});

describe('câblage', () => {
  it('relie deux ports libres et marque les linkId', () => {
    const t = addLink(twoPcs(), endpoint('d1', 'i1'), endpoint('d2', 'i2'));
    expect(t).not.toBeNull();
    expect(t!.links).toHaveLength(1);
    expect(findInterface(t!, 'd1', 'i1')!.linkId).toBe(t!.links[0].id);
    expect(findInterface(t!, 'd2', 'i2')!.linkId).toBe(t!.links[0].id);
    expect(isPortBusy(t!, endpoint('d1', 'i1'))).toBe(true);
  });

  it('refuse de relier un appareil à lui-même', () => {
    const t: Topology = { name: 'n', devices: [pc('d1', ['i1', 'i2'])], links: [] };
    expect(canConnect(t, endpoint('d1', 'i1'), endpoint('d1', 'i2'))).toBe(false);
    expect(addLink(t, endpoint('d1', 'i1'), endpoint('d1', 'i2'))).toBeNull();
  });

  it('refuse un port déjà occupé', () => {
    const t = addLink(twoPcs(), endpoint('d1', 'i1'), endpoint('d2', 'i2'))!;
    const more = addDevice(t, pc('d3', ['i3']));
    expect(addLink(more, endpoint('d1', 'i1'), endpoint('d3', 'i3'))).toBeNull();
  });

  it('refuse une interface inexistante', () => {
    expect(canConnect(twoPcs(), endpoint('d1', 'i1'), endpoint('d2', 'absent'))).toBe(false);
  });

  it('firstFreeInterface renvoie la première libre puis null', () => {
    let t: Topology = { name: 'n', devices: [pc('d1', ['i1', 'i2']), pc('d2', ['i3'])], links: [] };
    expect(firstFreeInterface(t, 'd1')).toBe('i1');
    t = addLink(t, endpoint('d1', 'i1'), endpoint('d2', 'i3'))!;
    expect(firstFreeInterface(t, 'd1')).toBe('i2');
  });
});

describe('suppression', () => {
  it('supprimer un appareil retire ses liens et libère le voisin', () => {
    const t = addLink(twoPcs(), endpoint('d1', 'i1'), endpoint('d2', 'i2'))!;
    const after = removeDevice(t, 'd1');
    expect(after.devices).toHaveLength(1);
    expect(after.links).toHaveLength(0);
    expect(findInterface(after, 'd2', 'i2')!.linkId).toBeUndefined();
  });

  it('supprimer un lien libère les deux ports', () => {
    const t = addLink(twoPcs(), endpoint('d1', 'i1'), endpoint('d2', 'i2'))!;
    const after = removeLink(t, t.links[0].id);
    expect(after.links).toHaveLength(0);
    expect(findInterface(after, 'd1', 'i1')!.linkId).toBeUndefined();
    expect(findInterface(after, 'd2', 'i2')!.linkId).toBeUndefined();
  });
});

describe('config', () => {
  it('updateInterface modifie ip/prefix', () => {
    const t = updateInterface(twoPcs(), 'd1', 'i1', { ip: '10.0.0.1', prefix: 24 });
    expect(findInterface(t, 'd1', 'i1')).toMatchObject({ ip: '10.0.0.1', prefix: 24 });
  });
  it('setDeviceFields modifie nom/passerelle/dns', () => {
    const t = setDeviceFields(twoPcs(), 'd1', { name: 'Poste', gateway: '10.0.0.254' });
    expect(t.devices[0]).toMatchObject({ name: 'Poste', gateway: '10.0.0.254' });
  });
  it('countDevicesWithIp compte les interfaces', () => {
    const t = updateInterface(twoPcs(), 'd1', 'i1', { ip: '10.0.0.1' });
    expect(countDevicesWithIp(t, '10.0.0.1')).toBe(1);
    expect(countDevicesWithIp(t, '10.0.0.2')).toBe(0);
  });
});

describe('logiciels', () => {
  it('installe sans doublon puis désinstalle', () => {
    let t = installApp(twoPcs(), 'd1', 'dns-server');
    expect(findDevice(t, 'd1')!.apps).toEqual([{ kind: 'dns-server' }]);
    t = installApp(t, 'd1', 'dns-server'); // doublon ignoré
    expect(findDevice(t, 'd1')!.apps).toEqual([{ kind: 'dns-server' }]);
    t = installApp(t, 'd1', 'web-server');
    expect(findDevice(t, 'd1')!.apps).toHaveLength(2);
    t = uninstallApp(t, 'd1', 'dns-server');
    expect(findDevice(t, 'd1')!.apps).toEqual([{ kind: 'web-server' }]);
  });
});

describe('sélection multiple : déplacer / supprimer', () => {
  it('moveDevicesTo place plusieurs appareils sans toucher aux autres', () => {
    let t: Topology = { name: 'n', devices: [pc('d1', ['i1']), pc('d2', ['i2']), pc('d3', ['i3'])], links: [] };
    t = moveDevicesTo(t, [
      { id: 'd1', x: 10, y: 20 },
      { id: 'd3', x: 30, y: 40 },
    ]);
    expect(findDevice(t, 'd1')).toMatchObject({ x: 10, y: 20 });
    expect(findDevice(t, 'd3')).toMatchObject({ x: 30, y: 40 });
    expect(findDevice(t, 'd2')).toMatchObject({ x: 0, y: 0 });
  });

  it('removeDevices supprime plusieurs appareils et leurs liens', () => {
    let t = addLink(twoPcs(), endpoint('d1', 'i1'), endpoint('d2', 'i2'))!;
    t = addDevice(t, pc('d3', ['i3']));
    const after = removeDevices(t, ['d1', 'd2']);
    expect(after.devices.map((d) => d.id)).toEqual(['d3']);
    expect(after.links).toHaveLength(0);
  });
});

describe('copier / coller (pasteDevices)', () => {
  function net(): Topology {
    let t: Topology = {
      name: 'n',
      devices: [
        { id: 'd1', kind: 'pc', name: 'PC1', x: 0, y: 0, interfaces: [{ id: 'i1', name: 'eth0', mac: 'aa:bb:cc:00:00:01' }] },
        { id: 'd2', kind: 'pc', name: 'PC2', x: 100, y: 0, interfaces: [{ id: 'i2', name: 'eth0', mac: 'aa:bb:cc:00:00:02' }] },
      ],
      links: [],
    };
    t = addLink(t, endpoint('d1', 'i1'), endpoint('d2', 'i2'))!;
    return t;
  }

  it('duplique les appareils avec de nouveaux ids/MAC et décale la position', () => {
    const t = net();
    const clip = { devices: t.devices, links: t.links };
    let n = 0;
    const { topo, newIds } = pasteDevices(t, clip, 24, 24, () => (n++ % 16) / 16);
    expect(topo.devices).toHaveLength(4);
    expect(newIds).toHaveLength(2);
    // Les nouveaux ids ne réutilisent pas les anciens.
    expect(newIds.some((id) => id === 'd1' || id === 'd2')).toBe(false);
    const copy1 = findDevice(topo, newIds[0])!;
    expect(copy1).toMatchObject({ x: 24, y: 24 }); // décalé
    expect(copy1.interfaces[0].mac).not.toBe('aa:bb:cc:00:00:01'); // MAC régénérée
  });

  it('recopie le lien INTERNE au groupe copié, remappé sur les nouvelles interfaces', () => {
    const t = net();
    const clip = { devices: t.devices, links: t.links };
    const { topo, newIds } = pasteDevices(t, clip, 24, 24, () => 0.5);
    expect(topo.links).toHaveLength(2); // l'original + la copie
    const newLink = topo.links[1];
    expect(newIds).toContain(newLink.a.deviceId);
    expect(newIds).toContain(newLink.b.deviceId);
  });

  it('ne recopie PAS un lien dont une extrémité est hors du groupe', () => {
    const t = net();
    // On ne copie que d1 (sans son lien vers d2).
    const clip = { devices: [findDevice(t, 'd1')!], links: t.links };
    const { topo } = pasteDevices(t, clip, 24, 24, () => 0.5);
    expect(topo.devices).toHaveLength(3);
    expect(topo.links).toHaveLength(1); // le lien d1↔d2 d'origine seulement
  });
});

describe('routes statiques', () => {
  it('définit puis efface la table de routage', () => {
    let t = setDeviceRoutes(twoPcs(), 'd1', [
      { destination: '10.0.0.0', prefix: 8, gateway: '192.168.1.254', interfaceId: 'i1' },
    ]);
    expect(findDevice(t, 'd1')!.routes).toHaveLength(1);
    t = setDeviceRoutes(t, 'd1', []);
    expect(findDevice(t, 'd1')!.routes).toBeUndefined();
  });
});

describe('annotations', () => {
  it('ajoute, modifie et supprime une annotation', () => {
    let t = emptyTopology();
    t = addAnnotation(t, { id: 'a1', kind: 'text', x: 5, y: 5, text: 'Salut', color: '#1e293b', fontSize: 16 });
    expect(t.annotations).toHaveLength(1);
    t = updateAnnotation(t, 'a1', { text: 'Coucou', color: '#ef4444' });
    expect(t.annotations![0]).toMatchObject({ text: 'Coucou', color: '#ef4444', kind: 'text' });
    t = removeAnnotation(t, 'a1');
    expect(t.annotations).toHaveLength(0);
  });
});

describe('normalizeTopology', () => {
  it('supprime les liens pendants', () => {
    const t: Topology = {
      name: 'n',
      devices: [pc('d1', ['i1'])],
      links: [{ id: 'L', a: endpoint('d1', 'i1'), b: endpoint('dX', 'iX') }],
    };
    expect(normalizeTopology(t).links).toHaveLength(0);
  });

  it('ignore un second lien sur un port déjà câblé', () => {
    const t: Topology = {
      name: 'n',
      devices: [pc('d1', ['i1']), pc('d2', ['i2']), pc('d3', ['i3'])],
      links: [
        { id: 'L1', a: endpoint('d1', 'i1'), b: endpoint('d2', 'i2') },
        { id: 'L2', a: endpoint('d1', 'i1'), b: endpoint('d3', 'i3') },
      ],
    };
    const n = normalizeTopology(t);
    expect(n.links.map((l) => l.id)).toEqual(['L1']);
  });
});
