const axios = require('axios');
const { normalizeBonareaStation } = require('./normalize');
const { retry } = require('./retry');

const DEFAULT_BONAREA_LIST_URL = 'https://www.bonarea-agrupa.com/locator/Localitzador/Get';
const DEFAULT_BONAREA_DETAIL_URL = 'https://www.bonarea-agrupa.com/locator/Localitzador/GetByID';
const DEFAULT_LANGUAGE = 'es';
const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RETRIES = 3;

const BASE_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  Origin: 'https://www.bonarea-energia.com',
  Referer: 'https://www.bonarea-energia.com/',
};

function resolveLogger(loggerOption) {
  return loggerOption && typeof loggerOption.info === 'function' ? loggerOption : console;
}

function resolveHttpClient(httpClientOption) {
  return httpClientOption && typeof httpClientOption.post === 'function' ? httpClientOption : axios;
}

function resolveUrl(urlOption, fallback) {
  const value = typeof urlOption === 'function' ? urlOption() : urlOption;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function resolveLanguage(languageOption) {
  const value = typeof languageOption === 'function' ? languageOption() : languageOption;
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_LANGUAGE;
}

async function fetchStationList(httpClient, logger, listUrl, language, timeout) {
  const body = new URLSearchParams();
  body.set('options[benzinera]', 'true');
  body.set('language', language);

  logger.info('Requesting BonArea station list', { url: listUrl });
  const response = await httpClient.post(listUrl, body, {
    headers: BASE_HEADERS,
    timeout,
  });

  if (!Array.isArray(response.data)) {
    throw new Error('Unexpected BonArea list response');
  }

  logger.info('Received BonArea station list', {
    url: listUrl,
    status: response.status,
    stationCount: response.data.length,
  });

  return response.data;
}

async function fetchStationDetail(httpClient, logger, detailUrl, id, type, language, timeout) {
  const body = new URLSearchParams();
  body.set('id', id);
  body.set('tipus', type || 'BENZINERA');
  body.set('language', language);

  logger.debug('Requesting BonArea station detail', { url: detailUrl, id, type });
  const response = await httpClient.post(detailUrl, body, {
    headers: BASE_HEADERS,
    timeout,
  });

  if (!response.data || typeof response.data !== 'object') {
    throw new Error('Unexpected BonArea detail response');
  }

  logger.debug('Received BonArea station detail', {
    url: detailUrl,
    id,
    status: response.status,
    hasData: Boolean(response.data?.id),
  });

  return response.data;
}

async function fetchStations(options = {}, hooks = {}) {
  const logger = resolveLogger(options.logger);
  const httpClient = resolveHttpClient(options.httpClient);
  const listUrl = resolveUrl(options.listUrl, DEFAULT_BONAREA_LIST_URL);
  const detailUrl = resolveUrl(options.detailUrl, DEFAULT_BONAREA_DETAIL_URL);
  const language = resolveLanguage(options.language);
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const reportProgress =
    typeof hooks.reportProgress === 'function' ? hooks.reportProgress : () => {};

  logger.info('Starting BonArea collector fetch');
  reportProgress(5, { stage: 'fetching_station_list' });
  const rawStations = await retry(
    () => fetchStationList(httpClient, logger, listUrl, language, timeout),
    { retries, minTimeoutMs: 1000, logger },
  );
  const totalStations = rawStations.length;
  reportProgress(10, { stage: 'station_list_received', stationCount: totalStations });

  if (totalStations === 0) {
    reportProgress(100, { stage: 'completed', stationCount: 0 });
    return [];
  }

  const stations = [];
  for (let index = 0; index < totalStations; index += 1) {
    const baseStation = rawStations[index];
    try {
      const detail = await retry(
        () =>
          fetchStationDetail(
            httpClient,
            logger,
            detailUrl,
            baseStation.id,
            baseStation.tipology || baseStation.type,
            language,
            timeout,
          ),
        { retries, minTimeoutMs: 800, logger },
      );
      const normalized = normalizeBonareaStation(detail);
      if (normalized) {
        stations.push(normalized);
      }
    } catch (error) {
      logger.warn('Failed to process BonArea station detail', {
        stationId: baseStation?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const progress = 10 + Math.round(((index + 1) / totalStations) * 90);
    reportProgress(progress > 100 ? 100 : progress, {
      stage: 'processing_station_details',
      processed: index + 1,
      total: totalStations,
    });
  }

  reportProgress(100, { stage: 'completed', stationCount: stations.length });
  return stations;
}

module.exports = {
  fetchStations,
  fetchStationList,
  fetchStationDetail,
  DEFAULT_BONAREA_LIST_URL,
  DEFAULT_BONAREA_DETAIL_URL,
};
