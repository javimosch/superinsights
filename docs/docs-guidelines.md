# Docs guidelines

This repository’s docs are a developer tool.

They should be:

- **Implementation-aligned** (never speculative)
- **Copy/paste-first** (snippets over prose)
- **Fast to scan** (clear headings, minimal fluff)
- **Stable** (avoid churn; update only when behavior changes)

## File & naming conventions

- Docs live under `docs/`.
- Feature docs live under `docs/features/`.
- Use lowercase filenames with hyphens.
- Prefer **one feature doc per feature** (avoid splitting unless necessary).

## Required writing style

- Write for someone integrating the backend in an existing app.
- Prefer concrete actions:
  - commands
  - endpoint paths
  - headers
  - env vars
  - expected response shapes
- Prefer short paragraphs and lists.
- Avoid marketing language.

## Accuracy rules (non-negotiable)

- Every endpoint listed must exist in the codebase.
- Every auth claim must match middleware in routes.
- If you’re unsure, verify by reading the relevant:
  - `src/routes/*`
  - `src/controllers/*`
  - `src/middleware.js`
- When behavior differs between modes (standalone vs middleware mode), document the rule:
  - **mount prefix applies to all routes**.

## Standard structure for `docs/features/*.md`

Use this structure unless the feature strongly requires a different one:

1. `# <Feature name>`
2. `## What it is`
   - 1–4 sentences.
   - Define the feature and who uses it.
3. `## Base URL / mount prefix`
   - Explain prefixing when mounted under `/saas` (or any prefix).
   - Provide 1 example showing prefixed paths.
4. `## Configuration` (only if applicable)
   - Environment variables
   - Global settings keys (if applicable)
   - Required vs optional
5. `## API`
   - Group by audience/auth:
     - Public (no auth)
     - User (JWT)
     - Admin (Basic Auth)
   - List routes with method + path.
   - Add 1–3 representative curl examples.
6. `## Admin UI` (if there is a server-rendered admin page)
   - Route(s) to open.
   - What it can do (short list).
7. `## Common errors / troubleshooting` (only if there are known gotchas)
   - Keep it short.

## Snippet conventions

- Use fenced code blocks with language:
  - `bash` for curl/commands
  - `js` for Node/Express examples
  - `json` for request/response bodies
- Prefer environment-agnostic placeholders:
  - `${BASE_URL}`
  - `${TOKEN}`
  - `${ADMIN_USERNAME}` / `${ADMIN_PASSWORD}`
- When showing auth:
  - JWT: `-H "Authorization: Bearer $TOKEN"`
  - Admin: `-u "${ADMIN_USERNAME}:${ADMIN_PASSWORD}"`

## Endpoint listing conventions

- Always show **method + path**.
- Prefer grouping by auth and feature area.
- Keep route lists short; link to deeper docs if needed.

## Cross-linking rules

- Avoid duplicating content across docs.
- Prefer a single canonical location for details.
- Add cross-links only as “next steps” pointers:
  - 1–2 links is usually enough.

## Keeping docs small

- If a doc becomes long, move deep implementation notes out (or delete them) and rely on:
  - `docs/features/*` as canonical feature docs
  - git history for removed legacy guides

## Review checklist (before merging)

- Routes listed exist and are mounted in `src/middleware.js`.
- Auth requirements match route middleware.
- Examples use correct prefixed paths when applicable.
- No outdated references to removed scripts/files.
- No large legacy appendices in cheatsheets or feature docs.
