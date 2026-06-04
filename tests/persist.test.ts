import { describe, it, expect } from 'vitest';
import type { Topology } from '../src/domain/types';
import { serialize, deserialize, FORMAT_VERSION } from '../src/lib/persist';
import { addLink, endpoint, normalizeTopology } from '../src/lib/topology';

function sample(): Topology {
  const base: Topology = {
    name: 'Mon réseau',
    devices: [
      {
        id: 'd1',
        kind: 'pc',
        name: 'PC1',
        x: 24,
        y: 48,
        gateway: '192.168.1.1',
        interfaces: [{ id: 'i1', name: 'eth0', mac: 'aa:bb:cc:dd:ee:01', ip: '192.168.1.10', prefix: 24 }],
      },
      {
        id: 'd2',
        kind: 'switch',
        name: 'SW1',
        x: 200,
        y: 48,
        interfaces: [
          { id: 'i2', name: 'eth0', mac: 'aa:bb:cc:dd:ee:02' },
          { id: 'i3', name: 'eth1', mac: 'aa:bb:cc:dd:ee:03' },
        ],
      },
    ],
    links: [],
  };
  return addLink(base, endpoint('d1', 'i1'), endpoint('d2', 'i2'))!;
}

describe('round-trip', () => {
  it('serialize → deserialize redonne la topologie normalisée', () => {
    const t = sample();
    const back = deserialize(serialize(t));
    expect(back).toEqual(normalizeTopology(t));
  });

  it('serialize inclut la version de format', () => {
    expect(JSON.parse(serialize(sample())).version).toBe(FORMAT_VERSION);
  });
});

describe('robustesse de deserialize', () => {
  it('renvoie null sur du JSON invalide', () => {
    expect(deserialize('pas du json')).toBeNull();
    expect(deserialize('123')).toBeNull();
    expect(deserialize('{}')).toBeNull();
  });

  it('tolère une topologie nue (sans enveloppe version)', () => {
    const back = deserialize('{"devices":[],"links":[]}');
    expect(back).toEqual({ name: 'Réseau', devices: [], links: [] });
  });

  it('conserve les annotations valides et filtre les invalides', () => {
    const raw = JSON.stringify({
      topology: {
        name: 'n',
        devices: [],
        links: [],
        annotations: [
          { id: 't1', kind: 'text', x: 10, y: 20, text: 'Salle A', color: '#ef4444', fontSize: 18 },
          { id: 'z1', kind: 'zone', x: 0, y: 0, w: 200, h: 150, color: '#0ea5e9', label: 'LAN' },
          { kind: 'zone', x: 0, y: 0, w: -5, h: 10, color: 'pasdunecouleur' }, // w corrigé, couleur défaut, id régénéré
          { kind: 'autre' }, // type inconnu → ignoré
        ],
      },
    });
    const back = deserialize(raw)!;
    expect(back.annotations).toHaveLength(3);
    expect(back.annotations![0]).toMatchObject({ kind: 'text', text: 'Salle A', color: '#ef4444', fontSize: 18 });
    expect(back.annotations![1]).toMatchObject({ kind: 'zone', label: 'LAN', w: 200 });
    expect(back.annotations![2]).toMatchObject({ kind: 'zone', w: 1, color: '#0ea5e9' }); // w<1 → 1, couleur invalide → défaut
  });

  it('round-trip serialize → deserialize préserve les annotations', () => {
    const t: Topology = {
      name: 'n',
      devices: [],
      links: [],
      annotations: [{ id: 'z1', kind: 'zone', x: 0, y: 0, w: 120, h: 80, color: '#22c55e', label: 'Zone' }],
    };
    expect(deserialize(serialize(t))).toEqual(normalizeTopology(t));
  });

  it('conserve les logiciels valides et filtre les inconnus', () => {
    const raw = JSON.stringify({
      topology: {
        name: 'n',
        devices: [
          {
            id: 'd1',
            kind: 'pc',
            name: 'PC',
            x: 0,
            y: 0,
            apps: [{ kind: 'terminal' }, { kind: 'dns-server' }, { kind: 'jeu-video' }],
            interfaces: [{ id: 'i1', name: 'eth0', mac: '02:00:00:00:00:01' }],
          },
        ],
        links: [],
      },
    });
    expect(deserialize(raw)!.devices[0].apps).toEqual([{ kind: 'terminal' }, { kind: 'dns-server' }]);
  });

  it('conserve les enregistrements DNS et la page web des apps', () => {
    const raw = JSON.stringify({
      topology: {
        name: 'n',
        devices: [
          {
            id: 'd1',
            kind: 'pc',
            name: 'SRV',
            x: 0,
            y: 0,
            apps: [
              { kind: 'dns-server', records: [{ name: 'web.local', ip: '10.0.0.5' }, { name: 'x', ip: 'bad' }] },
              { kind: 'web-server', page: '<h1>Salut</h1>' },
            ],
            interfaces: [{ id: 'i1', name: 'eth0', mac: '02:00:00:00:00:01' }],
          },
        ],
        links: [],
      },
    });
    const apps = deserialize(raw)!.devices[0].apps!;
    const dns = apps.find((a) => a.kind === 'dns-server')!;
    const web = apps.find((a) => a.kind === 'web-server')!;
    // L'ancien format { name, ip } est converti vers { type:'A', name, value } ; l'IP invalide est filtrée.
    expect(dns.records).toEqual([{ type: 'A', name: 'web.local', value: '10.0.0.5' }]);
    expect(web.page).toBe('<h1>Salut</h1>');
  });

  it('conserve les types d’enregistrement DNS (A/CNAME/NS) et le mode récursif', () => {
    const raw = JSON.stringify({
      version: 1,
      topology: {
        name: 'N',
        devices: [
          {
            id: 'd',
            kind: 'pc',
            name: 'SRV',
            x: 0,
            y: 0,
            apps: [
              {
                kind: 'dns-server',
                recursive: true,
                records: [
                  { type: 'A', name: 'web.local', value: '10.0.0.5' },
                  { type: 'CNAME', name: 'www.local', value: 'web.local' },
                  { type: 'NS', name: 'local', value: '10.0.0.53' },
                  { type: 'NS', name: 'bad', value: 'pas-une-ip' }, // valeur NS invalide → filtrée
                ],
              },
            ],
            interfaces: [{ id: 'i1', name: 'eth0', mac: '02:00:00:00:00:01' }],
          },
        ],
        links: [],
      },
    });
    const dns = deserialize(raw)!.devices[0].apps!.find((a) => a.kind === 'dns-server')!;
    expect(dns.recursive).toBe(true);
    expect(dns.records).toEqual([
      { type: 'A', name: 'web.local', value: '10.0.0.5' },
      { type: 'CNAME', name: 'www.local', value: 'web.local' },
      { type: 'NS', name: 'local', value: '10.0.0.53' },
    ]);
  });

  it('filtre les appareils de type inconnu', () => {
    const raw = JSON.stringify({
      topology: {
        name: 'n',
        devices: [{ id: 'x', kind: 'martien', name: 'X', x: 0, y: 0, interfaces: [] }],
        links: [],
      },
    });
    expect(deserialize(raw)!.devices).toHaveLength(0);
  });

  it('normalise les MAC et coerce les coordonnées invalides', () => {
    const raw = JSON.stringify({
      topology: {
        name: 'n',
        devices: [
          {
            id: 'd1',
            kind: 'pc',
            name: 'PC',
            x: 'oops',
            y: null,
            interfaces: [{ id: 'i1', name: 'eth0', mac: 'AA-BB-CC-DD-EE-FF' }],
          },
        ],
        links: [],
      },
    });
    const d = deserialize(raw)!.devices[0];
    expect(d.x).toBe(0);
    expect(d.y).toBe(0);
    expect(d.interfaces[0].mac).toBe('aa:bb:cc:dd:ee:ff');
  });

  it('recalcule les linkId (ignore ceux du JSON) et rejette une IP invalide', () => {
    const raw = JSON.stringify({
      topology: {
        name: 'n',
        devices: [
          {
            id: 'd1',
            kind: 'pc',
            name: 'PC',
            x: 0,
            y: 0,
            interfaces: [{ id: 'i1', name: 'eth0', mac: 'aa:bb:cc:dd:ee:01', linkId: 'fantome', ip: '999.1.1.1' }],
          },
        ],
        links: [],
      },
    });
    const itf = deserialize(raw)!.devices[0].interfaces[0];
    expect(itf.linkId).toBeUndefined();
    expect(itf.ip).toBeUndefined();
  });
});
