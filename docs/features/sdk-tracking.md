# SDK tracking (timing)

## What it is

The SuperInsights browser SDK can record **timed events** (durations in milliseconds) and send them to the ingestion API as normal events with a `durationMs` field.

This is useful for measuring:

- client-side function execution time
- async operation time (fetch calls, route transitions)
- UI workflow durations (checkout, signup)

## Base URL / mount prefix

In this repo, the SDK script is served at:

- `GET /sdk/superinsights.js`

Ingestion endpoints are mounted under:

- `/v1`

If you mount SuperInsights behind a reverse proxy or under a prefix, that prefix applies to **all** routes.

Example: if mounted under `/superinsights`, then:

- SDK script: `GET /superinsights/sdk/superinsights.js`
- Ingestion: `POST /superinsights/v1/events`

## Configuration

SDK config is passed to `SuperInsights.init(apiKey, config)`.

Relevant options:

- `debug` (boolean, optional)
  - Default: `false`
  - When enabled, logs SDK activity to the browser console.

## API

### Public (API key)

Timed events are sent through the same ingestion endpoint as normal events.

- `POST /v1/events`

Accepted headers (either works):

- `Authorization: Bearer ${API_KEY}`
- `X-API-Key: ${API_KEY}`

### Browser SDK methods

#### `SuperInsights.trackTiming(eventName, durationMs, properties?)`

Records an event with a `durationMs` value.

```js
SuperInsights.trackTiming('checkout:submit', 842, {
  step: 'payment',
  provider: 'stripe',
});
```

#### `SuperInsights.time(eventName, fn, properties?)`

Measures a synchronous function and records a timed event.

```js
SuperInsights.time('search:render', () => {
  // sync work
  renderSearchResults();
});
```

#### `SuperInsights.timeAsync(eventName, fn, properties?)`

Measures an async function (promise) and records a timed event.

```js
await SuperInsights.timeAsync('api:fetch-products', async () => {
  const resp = await fetch('/api/products');
  return resp.json();
});
```

If `fn()` returns a non-promise value, it is treated like a synchronous call and still records a duration.

## Common errors / troubleshooting

- **No events showing up**
  - Ensure `SuperInsights.init()` is called before `trackTiming/time/timeAsync`.
  - Ensure your project API key is correct.
  - Ensure the ingestion API is reachable (check browser network calls to `/v1/events`).
