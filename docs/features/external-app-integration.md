# External app integration

## What it is

SuperInsights exposes an ingestion API for collecting analytics data (page views, custom events, client-side errors, and performance metrics) and ships a small browser SDK that batches and sends that data.

This doc explains how to integrate SuperInsights into an existing external app.

## Base URL / mount prefix

This repo runs SuperInsights as a standalone Express app.

- Admin/UI routes are mounted at `/` (e.g. `/projects`, `/admin`).
- Ingestion routes are mounted at `/v1`.

If you mount this app behind a reverse proxy or under a prefix, that prefix applies to all routes.

Example: if you mount SuperInsights under `/superinsights`, then:

- The SDK script becomes `GET /superinsights/sdk/superinsights.js`
- Ingestion endpoints become `POST /superinsights/v1/events`

## Configuration

### Browser SDK

SDK config is passed to `SuperInsights.init(apiKey, config)`:

- `apiUrl` (string, optional)
  - Base URL where the ingestion API is hosted.
  - Default: current site origin.
- `batchSize` (number, optional)
  - Default: `20` (max accepted by server-side validators: `100`).
- `flushInterval` (number, optional)
  - Default: `5000`.
- `debug` (boolean, optional)
  - Default: `false`.

## API

### Public (API key)

All ingestion endpoints require a project API key.

Accepted headers (middleware: `middleware/apiKeyAuth.js`):

- `Authorization: Bearer ${API_KEY}`
- `X-API-Key: ${API_KEY}`

The key may be either:

- A **public key** starting with `pk_`
- A **secret key** starting with `sk_`

Ingestion CORS headers are set for all `/v1/*` requests (see `app.js`).

#### POST `/v1/pageviews`

Required fields per item (controller: `controllers/ingestionController.js`):

- `url` (string)

Request body can be either:

- Bulk: `{ "items": [ ... ] }`
- Single item object: `{ ... }`
- Raw array: `[ ... ]`

Example:

```bash
curl -X POST "${BASE_URL}/v1/pageviews" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "items": [
      {
        "url": "https://example.com/pricing",
        "title": "Pricing",
        "referrer": "https://example.com/",
        "sessionId": "sess_123",
        "clientId": "client_123",
        "utmSource": "google",
        "utmMedium": "cpc",
        "utmCampaign": "launch",
        "deviceType": "desktop",
        "browser": "Chrome",
        "os": "macOS",
        "timestamp": "2025-01-01T00:00:00.000Z"
      }
    ]
  }'
```

Response:

```json
{ "success": true, "count": 1 }
```

#### POST `/v1/events`

Required fields per item:

- `eventName` (string)

Example:

```bash
curl -X POST "${BASE_URL}/v1/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "items": [
      {
        "eventName": "signup_completed",
        "properties": { "plan": "pro", "method": "google" },
        "sessionId": "sess_123",
        "clientId": "client_123",
        "timestamp": "2025-01-01T00:00:00.000Z"
      }
    ]
  }'
```

Response:

```json
{ "success": true, "count": 1 }
```

#### POST `/v1/errors`

Required fields per item:

- `message` (string)

Example:

```bash
curl -X POST "${BASE_URL}/v1/errors" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "items": [
      {
        "errorType": "window_error",
        "message": "TypeError: Cannot read properties of undefined",
        "stackTrace": "Error: ...\n  at ...",
        "sourceFile": "https://example.com/app.js",
        "lineNumber": 12,
        "columnNumber": 34,
        "browser": "Chrome",
        "browserVersion": "120",
        "os": "macOS",
        "osVersion": "14.0",
        "deviceType": "desktop",
        "context": { "url": "https://example.com/" },
        "timestamp": "2025-01-01T00:00:00.000Z"
      }
    ]
  }'
```

Response:

```json
{ "success": true, "count": 1 }
```

#### POST `/v1/performance`

Each item must contain **at least one** of:

- `lcp` (number)
- `cls` (number)
- `fid` (number)
- `ttfb` (number)

Example:

```bash
curl -X POST "${BASE_URL}/v1/performance" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d '{
    "items": [
      {
        "metricType": "web_vitals_aggregate",
        "url": "https://example.com/",
        "connectionType": "4g",
        "lcp": 1234.56,
        "cls": 0.01,
        "fid": 12.3,
        "ttfb": 78.9,
        "deviceType": "desktop",
        "browser": "Chrome",
        "timestamp": "2025-01-01T00:00:00.000Z"
      }
    ]
  }'
```

Response:

```json
{ "success": true, "count": 1 }
```

### User (session)

Project creation and key management are currently exposed via the server-rendered UI under `/projects/*` (see `routes/projects.js`).

There is no JSON API in this repo for creating projects or minting keys.

## Admin UI

### Create a project and get API keys

- Open `GET /projects`
- Create a project via `GET /projects/new`
- After creation, open the project settings page:
  - `GET /projects/:id/settings`

The settings view displays:

- `publicApiKey` (`pk_...`) for browser SDK usage
- `secretApiKey` (`sk_...`) for server-to-server usage

### SDK asset

The browser SDK is served as a static asset:

- `GET /sdk/superinsights.js`

When embedding the SDK from a different origin, use the `apiUrl` option to point to SuperInsights.

Example:

```html
<script src="${BASE_URL}/sdk/superinsights.js"></script>
<script>
  SuperInsights.init('pk_...', {
    apiUrl: '${BASE_URL}',
    batchSize: 20,
    flushInterval: 5000,
    debug: false,
  });

  SuperInsights.setUser('user_123', { email: 'user@example.com' });
  SuperInsights.trackEvent('signup_completed', { plan: 'pro' });
</script>
```

## Common errors / troubleshooting

- **401 `API key required`**
  - No `Authorization: Bearer ...` and no `X-API-Key` header.
- **401 `Invalid API key`**
  - The key does not match any active project (`deletedAt: null`).
- **400 `Validation failed`**
  - Payload is not an array/bulk format, the `items` array is empty, or a required field is missing.
  - Bulk size limit is `100` items per request.
