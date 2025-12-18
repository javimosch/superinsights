# Performance metrics

## What it is

Performance metrics aggregates Web Vitals-style measurements captured by the SDK (LCP/CLS/FID/TTFB percentiles) over a selected time range. It supports filtering by device type and browser.

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/projects/:id/performance` becomes `/saas/projects/:id/performance`

## API

### User (session)

- `GET /projects/:id/performance`

Query parameters:

- `timeframe` (string, default `7d`)
- `deviceType` (`desktop` | `mobile` | `tablet` | `all`, default `all`)
- `browser` (string, optional; use `all` to clear)

Example:

```bash
curl -sS "${BASE_URL}/projects/${PROJECT_ID}/performance?timeframe=7d" \
  -H "Cookie: sid=${SID_COOKIE}" \
  -o /dev/null -w "%{http_code}\n"
```

### Public (token)

- `GET /p/:id/:token/performance`

Example:

```bash
curl -sS "${BASE_URL}/p/${PROJECT_ID}/${PUBLIC_TOKEN}/performance?timeframe=7d" \
  -o /dev/null -w "%{http_code}\n"
```
