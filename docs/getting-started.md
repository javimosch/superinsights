# Getting started

## What it is

This walkthrough covers:

- running SuperInsights locally
- creating a project
- integrating the browser SDK into an external app
- verifying data appears in the analytics UI

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/sdk/superinsights.js` becomes `/saas/sdk/superinsights.js`

## Configuration

Minimum env vars:

- `MONGODB_URI`
- `SESSION_SECRET`

If you use invites:

- `PUBLIC_URL`

## API

### Public (no auth)

- `GET /sdk/superinsights.js`

### Ingestion (API key)

All ingestion endpoints require `X-API-Key`.

- `POST /v1/pageviews`
- `POST /v1/events`
- `POST /v1/errors`
- `POST /v1/performance`

## 1) Run SuperInsights locally

```bash
npm install
npm run dev
```

Open:

- `${BASE_URL}/auth/login`

## 2) Create a project and get its API key

In the UI:

- create a project
- copy the project **public API key** (used by the browser SDK as `Authorization: Bearer <pk_...>`)

## 3) Add the browser SDK to an external app

Include the SDK script:

```html
<script src="${BASE_URL}/sdk/superinsights.js"></script>
```

Initialize the SDK and send a basic event:

```html
<script>
  // The SDK sends requests to `${apiUrl}/v1/*` and authenticates via Authorization: Bearer <pk_...>.
  // If the SDK script is loaded from the SuperInsights host (recommended), `apiUrl` can be omitted.
  SuperInsights.init('${PROJECT_PUBLIC_API_KEY}', {
    apiUrl: '${BASE_URL}',
    debug: true
  });

  SuperInsights.trackEvent('hello_world', { source: 'getting-started' });
</script>
```

## 4) Verify data in the analytics UI

In SuperInsights:

- open your project
- check:
  - Dashboard
  - Events
  - Page views

## Common errors / troubleshooting

- If you see 401/403 from `/v1/*`, verify the browser SDK is configured with the project public API key.
- If the SDK loads but no requests appear, ensure your external app can reach `${BASE_URL}` (CORS is enabled for `/v1`).
