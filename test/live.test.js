const { test, before } = require('node:test');
const assert = require('node:assert');
const axios = require('axios');
const {
  fetchStationList,
  fetchStationDetail,
  DEFAULT_BONAREA_LIST_URL,
  DEFAULT_BONAREA_DETAIL_URL,
} = require('../src/fetch');
const { normalizeBonareaStation } = require('../src/normalize');

const silentLogger = { info: () => {}, warn: () => {}, debug: () => {} };
const TIMEOUT = 30000;
const SAMPLE_SIZE = 5;

const SPAIN_LATITUDE_RANGE = [27, 44];
const SPAIN_LONGITUDE_RANGE = [-18.5, 4.5];

let list;
let normalized;

before(async () => {
  list = await fetchStationList(axios, silentLogger, DEFAULT_BONAREA_LIST_URL, 'es', TIMEOUT);

  const sample = list.slice(0, SAMPLE_SIZE);
  normalized = [];
  for (const item of sample) {
    try {
      const detail = await fetchStationDetail(
        axios,
        silentLogger,
        DEFAULT_BONAREA_DETAIL_URL,
        item.id,
        item.tipology || item.type,
        'es',
        TIMEOUT,
      );
      const station = normalizeBonareaStation(detail);
      if (station) {
        normalized.push(station);
      }
    } catch (error) {
      silentLogger.warn(`Skipping ${item.id}: ${error.message}`);
    }
  }
});

test('real BonArea API: station list is a non-empty array of stations', () => {
  assert.ok(Array.isArray(list), 'expected an array');
  assert.ok(list.length > 0, `expected stations in the dataset, got ${list.length}`);
  assert.ok(list.every((item) => item && item.id), 'every list item should have an id');
});

test('real BonArea API: station details normalize into stations', () => {
  assert.ok(normalized.length > 0, `expected normalizable stations, got ${normalized.length}`);

  const sample = normalized[0];
  assert.equal(sample.source, 'bonarea');
  assert.equal(sample.country, 'ES');
  assert.ok(sample.sourceStationId, 'station should have a source id');
  assert.ok(sample.name, 'station should have a name');
  assert.ok(Number.isFinite(sample.location?.coordinates?.[0]));
  assert.ok(Number.isFinite(sample.location?.coordinates?.[1]));
  assert.ok(sample.lastUpdated instanceof Date);
});

test('real BonArea API: every sample station has the required shape', () => {
  for (const station of normalized) {
    assert.equal(station.source, 'bonarea', `wrong source for ${station.sourceStationId}`);
    assert.equal(station.country, 'ES', `wrong country for ${station.sourceStationId}`);
    assert.ok(station.sourceStationId, `missing source id for ${station.sourceStationId}`);
    assert.ok(station.name, `missing name for ${station.sourceStationId}`);
    assert.ok(Number.isFinite(station.location?.coordinates?.[0]));
    assert.ok(Number.isFinite(station.location?.coordinates?.[1]));
    assert.ok(station.lastUpdated instanceof Date);
  }
});

test('real BonArea API: coordinates fall within Spain', () => {
  for (const station of normalized) {
    const [lon, lat] = station.location.coordinates;
    assert.ok(
      lat >= SPAIN_LATITUDE_RANGE[0] && lat <= SPAIN_LATITUDE_RANGE[1],
      `latitude out of Spain range for ${station.sourceStationId}: ${lat}`,
    );
    assert.ok(
      lon >= SPAIN_LONGITUDE_RANGE[0] && lon <= SPAIN_LONGITUDE_RANGE[1],
      `longitude out of Spain range for ${station.sourceStationId}: ${lon}`,
    );
  }
});

test('real BonArea API: no duplicate source station ids', () => {
  const ids = normalized.map((station) => station.sourceStationId);
  assert.equal(new Set(ids).size, ids.length, 'sourceStationId must be unique');
});

test('real BonArea API: some sample stations expose positive prices', () => {
  const withPrices = normalized.filter(
    (station) => station.prices && Object.keys(station.prices).length > 0,
  );
  assert.ok(withPrices.length > 0, 'expected at least one real station with prices');

  for (const station of withPrices) {
    for (const value of Object.values(station.prices)) {
      assert.ok(
        typeof value === 'number' && value > 0,
        `expected a positive price, got ${value}`,
      );
    }
  }
});
