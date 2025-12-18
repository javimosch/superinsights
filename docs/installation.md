# Installation

## What it is

This is the minimum setup to run the SuperInsights server (Express + MongoDB) and serve the browser SDK (`/sdk/superinsights.js`).

## Base URL / mount prefix

When SuperInsights is mounted behind a prefix (for example `/saas`), all routes are prefixed.

Example:

- `/projects` becomes `/saas/projects`
- `/v1/events` becomes `/saas/v1/events`

## Configuration

Required:

- `MONGODB_URI`
- `SESSION_SECRET`

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

By default the app listens on port `3000`.

## Production (Docker)

This repo includes a `Dockerfile` and `compose.yml`.

```bash
docker compose up -d --build
```

Make sure your `.env` (or the `env_file` used by compose) includes `MONGODB_URI` and `SESSION_SECRET`.
