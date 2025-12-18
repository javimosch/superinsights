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

##### Manual stopwatch (when you already have start/end timestamps)

Use `performance.now()` for high-resolution durations.

```js
const t0 = performance.now();

// ... do work
await fetch('/api/checkout/submit', { method: 'POST' });

const durationMs = Math.round(performance.now() - t0);
SuperInsights.trackTiming('checkout:submit', durationMs, {
  transport: 'fetch',
});
```

##### Start/stop timer helper (reusable)

This is useful when you want to start timing in one place and stop in another.

```js
function startTimer(eventName, properties) {
  const startedAt = performance.now();
  return {
    stop(extraProperties) {
      const durationMs = Math.round(performance.now() - startedAt);
      SuperInsights.trackTiming(eventName, durationMs, {
        ...(properties || {}),
        ...(extraProperties || {}),
      });
      return durationMs;
    },
  };
}

const t = startTimer('modal:time-open', { modal: 'pricing' });

// ... later
t.stop({ closeReason: 'cta_click' });
```

#### `SuperInsights.time(eventName, fn, properties?)`

Measures a synchronous function and records a timed event.

```js
SuperInsights.time('search:render', () => {
  // sync work
  renderSearchResults();
});
```

##### Measuring multiple steps (emit multiple durations)

```js
SuperInsights.time('search:parse-query', () => {
  parseQuery(location.search);
});

SuperInsights.time('search:render-results', () => {
  renderSearchResults();
}, {
  view: 'search',
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

##### `try/finally` pattern (record duration even on errors)

If you want to attach `ok`/`status` properties and still record a duration when the request fails:

```js
let ok = false;
let status = null;

await SuperInsights.timeAsync('api:checkout', async () => {
  try {
    const resp = await fetch('/api/checkout', { method: 'POST' });
    ok = resp.ok;
    status = resp.status;
    return await resp.json();
  } finally {
    // Properties can be provided up-front, or you can track an additional event here.
    // If you want these values on the timed event itself, prefer passing static properties
    // to timeAsync() and include dynamic fields via a separate trackEvent/trackTiming.
    SuperInsights.trackEvent('api:checkout:result', { ok, status });
  }
}, {
  service: 'checkout',
});
```

##### Measure a long UI flow (persist start across route changes)

This is useful for multi-step onboarding/checkout where the "start" and "finish" happen on different pages.

```js
// Step 1 (when flow starts)
sessionStorage.setItem('flow:onboarding:startedAt', String(Date.now()));

// Step N (when flow finishes)
const startedAt = Number(sessionStorage.getItem('flow:onboarding:startedAt'));
if (Number.isFinite(startedAt) && startedAt > 0) {
  const durationMs = Date.now() - startedAt;
  SuperInsights.trackTiming('flow:onboarding:completed', durationMs, {
    version: 'v1',
  });
  sessionStorage.removeItem('flow:onboarding:startedAt');
}
```

If `fn()` returns a non-promise value, it is treated like a synchronous call and still records a duration.

## Common errors / troubleshooting

- **No events showing up**
  - Ensure `SuperInsights.init()` is called before `trackTiming/time/timeAsync`.
  - Ensure your project API key is correct.
  - Ensure the ingestion API is reachable (check browser network calls to `/v1/events`).
