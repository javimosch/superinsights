# Analytics dashboard

## What it is

The dashboard is the default “project overview” view. It aggregates a small set of metrics (page views, events, errors, and performance) over a selectable time range.

## Base URL / mount prefix

When running behind a mount prefix (for example `/saas`), all routes are prefixed.

Example:

- `/projects/:id/dashboard` becomes `/saas/projects/:id/dashboard`

## API

### User (session)

- `GET /projects/:id/dashboard`
- `GET /projects/:id/dashboard/data`

Example:

```bash
curl -sS "${BASE_URL}/projects/${PROJECT_ID}/dashboard/data" \
  -H "Cookie: sid=${SID_COOKIE}" \
  | jq
```

### Public (token)

- `GET /p/:id/:token/dashboard`
- `GET /p/:id/:token/dashboard/data`

Example:

```bash
curl -sS "${BASE_URL}/p/${PROJECT_ID}/${PUBLIC_TOKEN}/dashboard/data" | jq
```

## Common errors / troubleshooting

- If you get redirected to `/auth/login`, you are not authenticated.
- If you get redirected to `/projects`, the project could not be resolved or you do not have access.
