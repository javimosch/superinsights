# Superinsights

Superinsights is a Node.js web application for analytics, event ingestion, and error tracking.

## Requirements

- Node.js (recommended for local dev)
- Docker + Docker Compose (recommended for running the full stack consistently)

## Run locally (Node)

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (see `.env.staging` for an example baseline).

3. Start the app:

```bash
npm start
```

The server listens on port `3000` by default.

## Run locally (Docker Compose)

```bash
docker compose -f compose.yml up --build
```

## Deploy

- `compose.coolify.yml` is provided for Coolify deployments.
- The container entrypoint runs:

```bash
node index.js
```

## Documentation

- Feature docs live under `docs/features/`.

## License

MIT License. See `LICENCE` in the project root.
