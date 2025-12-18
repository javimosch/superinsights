# Deployment

## What it is

This document covers production deployment for SuperInsights using Docker.

## Deployment base path (reverse proxy)

If you deploy SuperInsights behind a reverse proxy that adds a base path (for example `/superinsights`), that base path applies to all routes.

Example:

- `/v1/events` -> `/superinsights/v1/events`

Note: this repo mounts `saasbackend` internally at `/saas` (see `app.js`). That is separate from any reverse-proxy base path.

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

If you use `compose.yml` as-is:

- it loads environment variables via `env_file: ./.env.staging`
- it expects a Docker network named `coolify-shared`

## Common errors / troubleshooting

- Container exits immediately:
  - check logs
  - verify environment variables are present
- 401 from `/v1/*`:
  - verify the request includes an API key:
    - `Authorization: Bearer <pk_...>` (browser SDK)
    - or `X-API-Key: <pk_...>`
  - verify the key matches the project’s public API key
