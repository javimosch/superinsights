# Installation

## What it is

This is the minimum setup to run the SuperInsights server (Express + MongoDB) and serve the browser SDK (`/sdk/superinsights.js`).

## SuperInsights vs saasbackend

SuperInsights is a standalone Express app.

This repo mounts `saasbackend` internally at `/saas` (see `app.js`). You normally do not need to change this.

## Deployment base path (reverse proxy)

If you deploy SuperInsights behind a reverse proxy that adds a base path (for example `/superinsights`), that base path applies to all routes.

Example:

- `/projects` -> `/superinsights/projects`
- `/v1/events` -> `/superinsights/v1/events`

## Configuration

Required:

- `MONGODB_URI`
- `SESSION_SECRET`

Optional:

- `PORT` (defaults to `3000`)

Recommended:

- `PUBLIC_URL` (used to build invite links)

## API

### Public (no auth)

- `GET /sdk/superinsights.js`

### User (session)

- `GET /auth/login`

## Common errors / troubleshooting

- If the server boots but login loops, verify `SESSION_SECRET` is set.
- If Mongo connection fails, verify `MONGODB_URI`.

## Local development (npm)

```bash
npm install
npm run dev
```

By default the app listens on port `3000` (or `PORT` if set).

## Production (Docker)

This repo includes a `Dockerfile` and `compose.yml`.

```bash
docker compose up -d --build
```

Make sure your `.env` (or the `env_file` used by compose) includes `MONGODB_URI` and `SESSION_SECRET`.
