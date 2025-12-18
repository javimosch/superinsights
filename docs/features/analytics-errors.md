# Error tracking

## What it is

Error tracking aggregates JavaScript runtime errors captured by the SDK. It shows error volume over time and groups errors by fingerprint, with a detail view for recent occurrences.

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/projects/:id/errors` becomes `/saas/projects/:id/errors`

## API

### User (session)

- `GET /projects/:id/errors`
- `GET /projects/:id/errors/:fingerprint`

Query parameters (list page):

- `timeframe` (string, default `7d`)
- `browser` (string, optional; use `all` to clear)
- `errorType` (string, optional; use `all` to clear)

Example:

```bash
curl -sS "${BASE_URL}/projects/${PROJECT_ID}/errors?timeframe=7d" \
  -H "Cookie: sid=${SID_COOKIE}" \
  -o /dev/null -w "%{http_code}\n"
```

### Public (token)

- `GET /p/:id/:token/errors`
- `GET /p/:id/:token/errors/:fingerprint`

Example:

```bash
curl -sS "${BASE_URL}/p/${PROJECT_ID}/${PUBLIC_TOKEN}/errors?timeframe=30d" \
  -o /dev/null -w "%{http_code}\n"
```
