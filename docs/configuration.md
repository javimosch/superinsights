# Configuration

## What it is

This document lists the main runtime configuration for SuperInsights.

## SuperInsights vs saasbackend

SuperInsights is a standalone Express app.

It depends on `saasbackend` for org/users/invites/billing-style primitives, and mounts it internally at:

- `GET/POST ... /saas/*`

Developers integrating SuperInsights typically do **not** call `saasbackend` directly and do **not** need to change this mount.

SuperInsights is **not** packaged as “middleware you mount into your own Express app”. You deploy the SuperInsights server.

## Deployment base path (reverse proxy)

If you deploy SuperInsights behind a reverse proxy that adds a base path (for example `/superinsights`), that base path applies to all routes.

Examples:

- `/projects` -> `/superinsights/projects`
- `/v1/events` -> `/superinsights/v1/events`
- `/sdk/superinsights.js` -> `/superinsights/sdk/superinsights.js`

## Configuration

### Environment variables

Required:

- `MONGODB_URI` (MongoDB connection string)
- `SESSION_SECRET` (used by `express-session`)

Recommended:

- `PUBLIC_URL` (used to build absolute links in emails, like invites)

AI Analysis (optional):

- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL` (optional; defaults to OpenRouter)

Reverse proxy:

- `TRUST_PROXY=1` (recommended when running behind a reverse proxy/ingress)

Debug:

- `DEBUG_AUTH=1` (logs auth-related redirects and requests to server console)

## Common errors / troubleshooting

- Auth cookies not sticking in production:
  - ensure `TRUST_PROXY=1` when behind a proxy
  - ensure `PUBLIC_URL` matches your HTTPS domain
- Invite links point to localhost:
  - set `PUBLIC_URL`
