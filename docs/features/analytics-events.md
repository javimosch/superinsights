# Events analytics

## What it is

Events analytics shows custom events received from the SDK over a selected time range. It includes time-series counts, top events, and a detail page for a specific event (including recent occurrences and timing summaries for timed events).

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/projects/:id/events` becomes `/saas/projects/:id/events`

## API

### User (session)

- `GET /projects/:id/events`
- `GET /projects/:id/events/:eventName`

Query parameters (list page):

- `timeframe` (string, default `7d`)
- `eventName` (string, optional filter)

Example:

```bash
curl -sS "${BASE_URL}/projects/${PROJECT_ID}/events?timeframe=7d" \
  -H "Cookie: sid=${SID_COOKIE}" \
  -o /dev/null -w "%{http_code}\n"
```

### Public (token)

- `GET /p/:id/:token/events`
- `GET /p/:id/:token/events/:eventName`

Example:

```bash
curl -sS "${BASE_URL}/p/${PROJECT_ID}/${PUBLIC_TOKEN}/events?timeframe=7d" \
  -o /dev/null -w "%{http_code}\n"
```
