# @gasolinaradar/bonarea-collector

<!-- EN -->

A Node.js collector for the **BonÀrea fuel station locator** (Spain). It requests the public station list, fetches every station's detail, and returns a **normalized, ready-to-use** array of fuel stations with prices, services, schedule and coordinates.

<!-- ES -->

Collector de Node.js para el **localizador de estaciones de servicio de BonÀrea** (España). Solicita el listado público de estaciones, obtiene el detalle de cada una y devuelve un array de estaciones **normalizado y listo para usar** con precios, servicios, horarios y coordenadas.

---

## Features / Características

**EN:**

- Official BonÀrea public locator (Spain).
- Downloads the station list and each station's detail.
- Normalizes names, addresses, coordinates, schedule and services.
- Parses labeled price entries (`GASOIL A : 1,598` → `gasoila: 1.598`) with HTML entity decoding.
- Built-in retry with exponential backoff for list and detail requests.
- Injectable logger, HTTP client, and URLs.
- Progress reporting hook for long runs.
- Zero configuration: works with sensible defaults. The library resolves the list and detail URLs itself.

**ES:**

- Localizador público oficial de BonÀrea (España).
- Descarga el listado de estaciones y el detalle de cada estación.
- Normaliza nombres, direcciones, coordenadas, horarios y servicios.
- Parsea las entradas de precio etiquetadas (`GASOIL A : 1,598` → `gasoila: 1.598`) con decodificación de entidades HTML.
- Reintentos con backoff exponencial integrados para las peticiones de listado y detalle.
- Logger, cliente HTTP y URLs inyectables.
- Hook de reporte de progreso para ejecuciones largas.
- Cero configuración: funciona con valores por defecto sensatos. La librería resuelve por sí misma las URLs de listado y detalle.

---

## Installation / Instalación

```bash
npm install @gasolinaradar/bonarea-collector
```

---

## Quick start / Inicio rápido

```js
const { fetchStations } = require('@gasolinaradar/bonarea-collector');

async function main() {
  const stations = await fetchStations();
  console.log(`Fetched ${stations.length} fuel stations`);
  console.log(stations[0]);
}

main();
```

---

## API

### `fetchStations(options?) → Promise<Station[]>`

Downloads the station list, fetches every station's detail and returns the normalized stations in one step.

```js
const { fetchStations } = require('@gasolinaradar/bonarea-collector');

const stations = await fetchStations({
  logger: console,
  timeout: 15000,
  retries: 3,
});
```

### `createBonareaCollector(options?) → Collector`

Returns an object matching the common **collector contract** used by ingestion pipelines:

```js
{ name: 'bonarea', country: 'ES', fetch(context) }
```

```js
const { createBonareaCollector } = require('@gasolinaradar/bonarea-collector');

const bonareaCollector = createBonareaCollector({
  logger,
});

const stations = await bonareaCollector.fetch({
  reportProgress(percent, metadata = {}) {
    console.log(`${percent}%`, metadata);
  },
});
```

---

## Options / Opciones

| Option       | Type                     | Default | Description                                                              |
| ------------ | ------------------------ | ------- | ------------------------------------------------------------------------ |
| `listUrl`    | `string \| () => string` | BonÀrea list URL | Station list URL. As a function, it is evaluated on every fetch. Defaults to the official `Localitzador/Get` endpoint. |
| `detailUrl`  | `string \| () => string` | BonÀrea detail URL | Station detail URL. As a function, it is evaluated on every fetch. Defaults to the official `Localitzador/GetByID` endpoint. |
| `language`   | `string`                 | `es`    | Locator language parameter.                                              |
| `timeout`    | `number`                 | `15000` | HTTP timeout in milliseconds.                                            |
| `retries`    | `number`                 | `3`     | Retry attempts for each request before failing.                          |
| `logger`     | `{ info, warn, debug }`  | `console` | Injectable logger.                                                    |
| `httpClient` | `{ post(url, body, opts) }` | `axios` | Injectable HTTP client (useful for tests or custom TLS settings).      |

| Opción       | Tipo                      | Por defecto | Descripción                                                                |
| ------------ | ------------------------- | ----------- | -------------------------------------------------------------------------- |
| `listUrl`    | `string \| () => string`  | URL listado BonÀrea | URL del listado de estaciones. Como función, se evalúa en cada fetch. Por defecto el endpoint oficial `Localitzador/Get`. |
| `detailUrl`  | `string \| () => string`  | URL detalle BonÀrea | URL del detalle de estación. Como función, se evalúa en cada fetch. Por defecto el endpoint oficial `Localitzador/GetByID`. |
| `language`   | `string`                  | `es`        | Parámetro de idioma del localizador.                                       |
| `timeout`    | `number`                  | `15000`     | Timeout HTTP en milisegundos.                                              |
| `retries`    | `number`                  | `3`         | Intentos de reintento de cada petición antes de fallar.                    |
| `logger`     | `{ info, warn, debug }`   | `console`   | Logger inyectable.                                                         |
| `httpClient` | `{ post(url, body, opts) }` | `axios`   | Cliente HTTP inyectable (útil en tests o para configuración TLS personalizada). |

> **Note:** When `httpClient` is injected, the collector does not build any HTTP client itself. Pass an axios instance with your own TLS settings (e.g. `rejectUnauthorized`) if you need custom certificate validation.

> **Nota:** Cuando se inyecta `httpClient`, el collector no construye ningún cliente HTTP propio. Pasa una instancia de axios con tu propia configuración TLS (p. ej. `rejectUnauthorized`) si necesitas validación de certificados personalizada.

---

## Output schema / Esquema de salida

Each normalized station looks like this / Cada estación normalizada tiene esta forma:

```js
{
  source: 'bonarea',
  country: 'ES',
  sourceStationId: 'G004',
  name: 'E.S. bonÀrea Moià G004',
  address: 'Crta. de Vic s/n',
  municipality: 'MOIA',
  province: 'BARCELONA',
  postalCode: '08180',
  schedule: 'Abierto todo el año (365 días y 24 horas)',
  services: ['RENTADOR', 'CANVI', 'NULL'],
  location: {
    type: 'Point',
    coordinates: [2.106831, 41.808775], // [longitude, latitude]
  },
  prices: {
    gasoila: 1.598,
    gasolinasp95: 1.435,
    adblue: 0.528,
  },
  lastUpdated: Date,
}
```

Notes / Notas:

- Prices are keyed by slugified label (`GASOLINA S/P 95` → `gasolinasp95`) and are `number`. When a station provides no prices, `prices` is `undefined`.
- Coordinates are `[longitude, latitude]` (GeoJSON order). Stations that cannot be resolved with coordinates are skipped (logged as warnings).
- `services` and `schedule` are kept as returned by the source (cleaned of HTML); they are `undefined` when empty.

---

## Progress reporting / Reporte de progreso

The collector accepts an optional `context.reportProgress(percent, metadata)` callback:

```js
const stations = await bonareaCollector.fetch({
  reportProgress(percent, metadata) {
    // percent: 5  -> requesting the station list
    // percent: 10 -> list received, processing station details
    // percent: 10-100 -> processing each station detail
    // percent: 100 -> completed
    console.log(percent, metadata.stage);
  },
});
```

---

## Data source / Fuente de datos

**EN:** The data is the public station locator of **BonÀrea Agrupa** (Spain), published at:

**ES:** Los datos provienen del localizador público de estaciones de **BonÀrea Agrupa** (España), publicado en:

- `https://www.bonarea-agrupa.com/locator/Localitzador/Get`
- `https://www.bonarea-agrupa.com/locator/Localitzador/GetByID`

This project is **not affiliated with** BonÀrea. The data belongs to BonÀrea and is provided "as is". See the legal documents below.

Este proyecto **no está afiliado** a BonÀrea. Los datos pertenecen a BonÀrea y se proporcionan "tal cual". Consulta los documentos legales a continuación.

---

## Legal / Legal

**EN:**

- [LEGAL.md](./LEGAL.md) — Legal notice and disclaimer (bilingual).
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — Data attribution and third-party licenses.
- [LICENSE](./LICENSE) — MIT License (applies to this software, **not** to the underlying BonÀrea data).

**ES:**

- [LEGAL.md](./LEGAL.md) — Aviso legal y descargo de responsabilidad (bilingüe).
- [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) — Atribución de datos y licencias de terceros.
- [LICENSE](./LICENSE) — Licencia MIT (aplica a este software, **no** a los datos subyacentes de BonÀrea).

---

## Tests

```bash
npm test        # unit tests (mocked HTTP)
npm run test:live  # live tests hitting the real API (network required)
```

---

## License / Licencia

**EN:** MIT. See [LICENSE](./LICENSE). The BonÀrea data is **not** covered by this license.

**ES:** MIT. Consulta [LICENSE](./LICENSE). Los datos de BonÀrea **no** están cubiertos por esta licencia.
