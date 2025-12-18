# Configuration

## What it is

This document lists the main runtime configuration for SuperInsights.

## Base URL / mount prefix

If you deploy SuperInsights behind a prefix (for example `/saas`), the prefix applies to all routes.

Examples:

- `/projects` -> `/saas/projects`
- `/v1/events` -> `/saas/v1/events`
- `/sdk/superinsights.js` -> `/saas/sdk/superinsights.js`

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
