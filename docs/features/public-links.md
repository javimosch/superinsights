# Public project links

## What it is

Public links allow a project owner to enable a read-only, tokenized URL that exposes analytics pages without requiring authentication.

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/p/:id/:token/dashboard` becomes `/saas/p/:id/:token/dashboard`

## API

### User (session)

Project owners can manage public links from Project Settings.

- `POST /projects/:id/public-link/enable`
- `POST /projects/:id/public-link/regenerate`
- `POST /projects/:id/public-link/revoke`

Example:

```bash
curl -sS -X POST "${BASE_URL}/projects/${PROJECT_ID}/public-link/enable" \
  -H "Cookie: sid=${SID_COOKIE}" \
  -o /dev/null -w "%{http_code}\n"
```

### Public (token)

Public pages are served under `/p`.

- `GET /p/:id/:token/dashboard`
- `GET /p/:id/:token/dashboard/data`
- `GET /p/:id/:token/pageviews`
- `GET /p/:id/:token/events`
- `GET /p/:id/:token/events/:eventName`
- `GET /p/:id/:token/errors`
- `GET /p/:id/:token/errors/:fingerprint`
- `GET /p/:id/:token/performance`

## Admin UI

Admins can view enabled public links and revoke them.

- `GET /admin/public-links`
- `POST /admin/public-links/revoke`
