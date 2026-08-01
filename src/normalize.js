const decimalCommaRegex = /,/g;

function normalizePrice(value) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'number' ? value.toString() : value.trim();
  if (!raw) return null;
  const normalized = raw.replace(decimalCommaRegex, '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined) {
    throw new Error('Missing coordinate value');
  }

  const raw = typeof value === 'number' ? value.toString() : String(value).trim();
  if (!raw) {
    throw new Error('Empty coordinate value');
  }

  const normalized = raw.replace(decimalCommaRegex, '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid coordinate value: ${value}`);
  }

  return parsed;
}

function slugifyFuelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '');
}

const HTML_ENTITY_MAP = {
  amp: '&',
  nbsp: ' ',
  euro: '€',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  ccedil: 'ç',
};

function decodeHtmlEntities(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }

  return value
    .replace(/&#(\d+);/g, (_, code) => {
      const charCode = Number.parseInt(code, 10);
      return Number.isFinite(charCode) ? String.fromCharCode(charCode) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const charCode = Number.parseInt(hex, 16);
      return Number.isFinite(charCode) ? String.fromCharCode(charCode) : _;
    })
    .replace(/&([a-z]+);/gi, (match, entity) => {
      const normalized = entity.toLowerCase();
      return Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, normalized)
        ? HTML_ENTITY_MAP[normalized]
        : match;
    });
}

function cleanHtmlText(value) {
  if (!value) {
    return '';
  }

  const withoutTags = String(value).replace(/<[^>]*>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);
  return decoded.replace(/\s+/g, ' ').trim();
}

function normalizeOptionalText(value) {
  const cleaned = cleanHtmlText(value);
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseBonareaPrices(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return undefined;
  }

  const prices = entries.reduce((acc, entry) => {
    if (!entry) {
      return acc;
    }

    const text = cleanHtmlText(entry);
    if (!text) {
      return acc;
    }

    const match = text.match(/^(.*?)(?:\s*[:-]\s*|\s+-\s+)([\d.,]+)/);
    if (!match) {
      return acc;
    }

    const fuelName = match[1].trim();
    const priceAmount = match[2].trim();
    if (!fuelName || !priceAmount) {
      return acc;
    }

    const slug = slugifyFuelName(fuelName);
    if (!slug || Object.prototype.hasOwnProperty.call(acc, slug)) {
      return acc;
    }

    const amount = normalizePrice(priceAmount);
    if (amount === null) {
      return acc;
    }

    acc[slug] = amount;
    return acc;
  }, {});

  return Object.keys(prices).length > 0 ? prices : undefined;
}

function normalizeBonareaStation(detail) {
  if (!detail || typeof detail !== 'object') {
    return null;
  }

  const coordinates = detail.coordenades ?? {};
  const latitude = normalizeCoordinate(coordinates.latitude);
  const longitude = normalizeCoordinate(coordinates.longitude);

  const address = detail.address ?? {};
  const street = normalizeOptionalText(address.street);
  const number = normalizeOptionalText(address.number);
  const municipality = normalizeOptionalText(address.city);
  const province = normalizeOptionalText(address.province);
  const postalCode = normalizeOptionalText(address.postalCode);

  const addressLine = [street, number].filter(Boolean).join(', ');

  const services = Array.isArray(detail.serveis)
    ? detail.serveis.map(normalizeOptionalText).filter(Boolean)
    : undefined;

  const prices = parseBonareaPrices(detail.preus);

  return {
    source: 'bonarea',
    country: 'ES',
    sourceStationId: detail.id,
    name: normalizeOptionalText(address.raoSocial) ?? `bonÀrea ${detail.id}`,
    address: addressLine || undefined,
    municipality: municipality ?? '',
    province: province ?? '',
    postalCode,
    schedule: normalizeOptionalText(detail.horari),
    services: services && services.length > 0 ? services : undefined,
    location: {
      type: 'Point',
      coordinates: [longitude, latitude],
    },
    prices,
    lastUpdated: new Date(),
  };
}

module.exports = {
  normalizePrice,
  normalizeCoordinate,
  slugifyFuelName,
  decodeHtmlEntities,
  cleanHtmlText,
  normalizeOptionalText,
  parseBonareaPrices,
  normalizeBonareaStation,
  HTML_ENTITY_MAP,
};
