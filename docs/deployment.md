# Deployment

## What it is

This document covers production deployment for SuperInsights using Docker.

## Base URL / mount prefix

If you deploy behind a prefix (for example `/saas`), the prefix applies to all routes.

Example:

- `/v1/events` becomes `/saas/v1/events`

## Configuration

Production requires:

- `MONGODB_URI`
- `SESSION_SECRET`

Recommended:

- `PUBLIC_URL`
- `TRUST_PROXY=1` when behind a reverse proxy

## API

### Public (no auth)

- `GET /sdk/superinsights.js`

## Docker

The repository provides:

- `Dockerfile`
- `compose.yml`

Build and run:

```bash
docker compose up -d --build
```

## Common errors / troubleshooting

- Container exits immediately:
  - check logs
  - verify environment variables are present
- 401 from `/v1/*`:
  - verify `X-API-Key` is being sent by the SDK
  - verify the key matches the project’s public API key
