const { test } = require('node:test');
const assert = require('node:assert');
const { createBonareaCollector, fetchStations } = require('../src');
const { normalizeBonareaStation, parseBonareaPrices } = require('../src/normalize');
const { DEFAULT_BONAREA_LIST_URL, DEFAULT_BONAREA_DETAIL_URL } = require('../src/fetch');

const silentLogger = { info: () => {}, warn: () => {}, debug: () => {} };

const SAMPLE_LIST_PAYLOAD = [
  { id: 'G004', tipology: 'BENZINERA', type: 'BENZINERA' },
  { id: 'G005', type: 'BENZINERA' },
  { id: 'G006' },
];

const SAMPLE_DETAILS = {
  G004: {
    id: 'G004',
    address: {
      street: 'Crta. de Vic s/n',
      number: null,
      city: 'MOIA',
      province: 'BARCELONA',
      postalCode: '08180',
      raoSocial: 'E.S. bonÀrea Moià G004',
    },
    horari: 'Abierto todo el año<br/>(365 días y 24 horas)',
    coordenades: { latitude: '41.808775', longitude: '2.106831' },
    preus: ['GASOIL A : 1,598', 'GASOLINA S/P 95 : 1,435', 'ADBLUE : 0,528'],
    serveis: ['RENTADOR', 'CANVI', 'NULL'],
  },
  G005: {
    id: 'G005',
    address: {
      street: 'CTRA. DE MONTBLANC C-240,KM 69',
      city: 'VERDU',
      province: '',
      postalCode: '25330',
      raoSocial: 'E.S. bonÀrea Verdu G005',
    },
    coordenades: { latitude: 41.61225, longitude: 1.12995 },
    preus: [],
    serveis: [],
  },
  G006: {
    id: 'G006',
    address: { city: 'PALLARGUES, LES' },
    coordenades: { latitude: '41.5818', longitude: '0.7487' },
    preus: ['GASOIL A : 1,599'],
  },
};

function createFakeClient(listPayload = SAMPLE_LIST_PAYLOAD, details = SAMPLE_DETAILS) {
  const calls = [];
  const client = {
    calls,
    post: async (url, body) => {
      const bodyString = body.toString();
      calls.push({ url, body: bodyString });
      if (url.includes('GetByID')) {
        const idMatch = bodyString.match(/id=([^&]+)/);
        const id = idMatch ? decodeURIComponent(idMatch[1]) : null;
        return { status: 200, data: details[id] };
      }
      return { status: 200, data: listPayload };
    },
  };
  return client;
}

test('fetchStations returns normalized stations with prices and services', async () => {
  const client = createFakeClient();
  const stations = await fetchStations({ httpClient: client, logger: silentLogger });

  assert.equal(stations.length, 3);

  const byId = Object.fromEntries(stations.map((station) => [station.sourceStationId, station]));
  const g004 = byId['G004'];
  const g005 = byId['G005'];
  const g006 = byId['G006'];

  assert.ok(g004);
  assert.ok(g005);
  assert.ok(g006);
  assert.equal(g004.source, 'bonarea');
  assert.equal(g004.country, 'ES');
  assert.equal(g004.sourceStationId, 'G004');
  assert.equal(g004.name, 'E.S. bonÀrea Moià G004');
  assert.equal(g004.address, 'Crta. de Vic s/n');
  assert.equal(g004.municipality, 'MOIA');
  assert.equal(g004.province, 'BARCELONA');
  assert.equal(g004.postalCode, '08180');
  assert.equal(g004.schedule, 'Abierto todo el año (365 días y 24 horas)');
  assert.deepEqual(g004.services, ['RENTADOR', 'CANVI', 'NULL']);
  assert.deepEqual(g004.location, { type: 'Point', coordinates: [2.106831, 41.808775] });
  assert.deepEqual(g004.prices, { gasoila: 1.598, gasolinasp95: 1.435, adblue: 0.528 });
  assert.ok(g004.lastUpdated instanceof Date);

  assert.equal(g005.sourceStationId, 'G005');
  assert.equal(g005.municipality, 'VERDU');
  assert.equal(g005.province, '');
  assert.equal(g005.postalCode, '25330');
  assert.equal(g005.prices, undefined);
  assert.equal(g005.services, undefined);

  assert.equal(g006.sourceStationId, 'G006');
  assert.deepEqual(g006.prices, { gasoila: 1.599 });
});

test('uses the default URLs when none are provided', async () => {
  const client = createFakeClient();
  await fetchStations({ httpClient: client, logger: silentLogger });
  assert.equal(client.calls[0].url, DEFAULT_BONAREA_LIST_URL);
  assert.ok(client.calls.some((call) => call.url === DEFAULT_BONAREA_DETAIL_URL));
});

test('createBonareaCollector exposes the collector contract', async () => {
  const collector = createBonareaCollector({
    httpClient: createFakeClient(),
    logger: silentLogger,
  });

  assert.equal(collector.name, 'bonarea');
  assert.equal(collector.country, 'ES');
  assert.equal(typeof collector.fetch, 'function');

  const stations = await collector.fetch({});
  assert.equal(stations.length, 3);
});

test('reports progress through the context hook', async () => {
  const collector = createBonareaCollector({
    httpClient: createFakeClient(),
    logger: silentLogger,
  });
  const steps = [];

  const stations = await collector.fetch({
    reportProgress(percent, metadata = {}) {
      steps.push({ percent, metadata });
    },
  });

  assert.equal(stations.length, 3);
  assert.equal(steps[0].percent, 5);
  assert.equal(steps[0].metadata.stage, 'fetching_station_list');
  assert.ok(
    steps.some((step) => step.percent === 10 && step.metadata.stage === 'station_list_received'),
  );
  assert.ok(steps.some((step) => step.metadata.stage === 'processing_station_details'));
  assert.equal(steps[steps.length - 1].percent, 100);
  assert.equal(steps[steps.length - 1].metadata.stage, 'completed');
});

test('skips stations with invalid coordinates', async () => {
  const list = [{ id: 'BAD', tipology: 'BENZINERA' }];
  const details = {
    BAD: { id: 'BAD', address: { city: 'X' }, coordenades: {}, preus: [] },
  };
  const client = createFakeClient(list, details);
  const stations = await fetchStations({ httpClient: client, logger: silentLogger });
  assert.deepEqual(stations, []);
});

test('throws on unexpected list payload', async () => {
  const client = createFakeClient({ not: 'an array' });
  await assert.rejects(
    () => fetchStations({ httpClient: client, retries: 0, logger: silentLogger }),
    /Unexpected BonArea list response/,
  );
});

test('returns an empty array for an empty station list', async () => {
  const client = createFakeClient([]);
  const stations = await fetchStations({ httpClient: client, logger: silentLogger });
  assert.deepEqual(stations, []);
});

test('parseBonareaPrices parses labeled price entries', () => {
  assert.deepEqual(
    parseBonareaPrices(['GASOIL A : 1,598', 'GASOLINA S/P 95 - 1,435', 'ADBLUE: 0,528']),
    { gasoila: 1.598, gasolinasp95: 1.435, adblue: 0.528 },
  );
  assert.equal(parseBonareaPrices([]), undefined);
  assert.equal(parseBonareaPrices(['NO PRICE HERE']), undefined);
});

test('normalizeBonareaStation returns null for non-object input', () => {
  assert.equal(normalizeBonareaStation(null), null);
  assert.equal(normalizeBonareaStation('nope'), null);
});
