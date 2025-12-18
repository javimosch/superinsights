# Page views analytics

## What it is

Page views analytics provides time-series and top-page breakdowns for a project over a selected time range. It supports filtering by device type and URL prefix.

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/projects/:id/pageviews` becomes `/saas/projects/:id/pageviews`

## API

### User (session)

- `GET /projects/:id/pageviews`

Query parameters:

- `timeframe` (string, default `7d`)
- `deviceType` (`desktop` | `mobile` | `tablet` | `all`, default `all`)
- `urlPrefix` (string, optional)

Example:

```bash
curl -sS "${BASE_URL}/projects/${PROJECT_ID}/pageviews?timeframe=7d&deviceType=all" \
  -H "Cookie: sid=${SID_COOKIE}"
```

### Public (token)

- `GET /p/:id/:token/pageviews`

Example:

```bash
curl -sS "${BASE_URL}/p/${PROJECT_ID}/${PUBLIC_TOKEN}/pageviews?timeframe=30d" \
  -o /dev/null -w "%{http_code}\n"
```
