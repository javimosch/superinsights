## SaasBackend Cheatsheet (LLM-friendly)

This file is a compact, current snapshot of how to integrate and use `saasbackend`.

Only the sections above the "Legacy appendix" are intended to be used by LLMs.

## Install

```bash
npm i saasbackend
```

## Mounting / base URL

If you mount SaasBackend under a prefix (recommended), every route is prefixed.

Example: mount under `/saas` → `/saas/api/...`, `/saas/admin/...`, `/saas/public/...`.

## Minimal middleware integration (recommended)

```js
require('dotenv').config();
const express = require('express');
const { middleware } = require('saasbackend');

const app = express();

app.use('/saas', middleware({
  mongodbUri: process.env.MONGODB_URI,
  corsOrigin: process.env.CORS_ORIGIN || '*',
}));

app.listen(3000);
```

## Standalone mode (dev, via Docker Compose)

```bash
docker compose -f compose.standalone.yml up --build
```

Verify:

```bash
curl http://localhost:3000/saas/health
```

## Required env (minimum)

```env
MONGODB_URI=mongodb://localhost:27017/saasbackend
JWT_ACCESS_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

Common additions:

```env
CORS_ORIGIN=http://localhost:3000
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_URL=http://localhost:3000
BILLING_RETURN_URL_RELATIVE=/dashboard
RESEND_API_KEY=...
SAASBACKEND_ENCRYPTION_KEY=... # if you use encrypted global settings
```

## Auth headers

- **JWT**: `Authorization: Bearer <token>`
- **Admin**: basic auth (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)

## Key routes (grouped)

All routes below are shown **without** the mount prefix.

If you mount SaasBackend under `/saas`, then `GET /admin/test` becomes `GET /saas/admin/test`, and `POST /api/auth/login` becomes `POST /saas/api/auth/login`.

Health:

- `GET /health`

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh-token`
- `GET /api/auth/me` (JWT)

Billing / subscriptions (JWT):

- `POST /api/billing/create-checkout-session`
- `POST /api/billing/create-portal-session`
- `POST /api/billing/reconcile-subscription`

Stripe webhooks (public):

- `POST /api/stripe/webhook`
- `POST /api/stripe-webhook` (legacy)

Admin UI pages (basic auth):

- `GET /admin/test`
- `GET /admin/users`
- `GET /admin/global-settings`
- `GET /admin/stripe-pricing`
- `GET /admin/feature-flags`
- `GET /admin/assets`
- `GET /admin/json-configs`
- `GET /admin/i18n`
- `GET /admin/errors`
- `GET /admin/audit`

Error tracking:

- Browser SDK (embed): `GET /api/error-tracking/browser-sdk`
  - Embed snippet: `<script src="/api/error-tracking/browser-sdk"></script>`
- Submit frontend errors (public): `POST /api/log/error`
- Admin APIs (basic auth):
  - `GET /api/admin/errors`
  - `GET /api/admin/errors/:id`
  - `PUT /api/admin/errors/:id/status`
  - `DELETE /api/admin/errors/:id`

Audit log:

- Automatically recorded on key routes via middleware (success/failure + request context)
- Admin APIs (basic auth):
  - `GET /api/admin/audit`
  - `GET /api/admin/audit/stats`
  - `GET /api/admin/audit/actions`
  - `GET /api/admin/audit/:id`

Feature flags:

- `GET /api/feature-flags` (JWT)
- `GET /api/feature-flags/public` (public)
- `GET/POST/PUT/DELETE /api/admin/feature-flags` (basic auth)

Global settings:

- `GET /api/settings/public`
- `GET/POST/PUT/DELETE /api/admin/settings/*` (basic auth)

Assets:

- `GET /public/assets/*` (public)
- `POST /api/assets/upload` (JWT, multipart)
- `GET /api/assets` (JWT)
- `GET /api/admin/assets/info` (basic auth)
- Upload namespaces: `GET/POST/PUT/DELETE /api/admin/upload-namespaces/*` (basic auth)
- Upload namespaces summary: `GET /api/admin/upload-namespaces/summary` (basic auth)

JSON configs:

- `GET /api/json-configs/:slug` (public)
- `GET/POST/PUT/DELETE /api/admin/json-configs/*` (basic auth)

## Canonical docs

Prefer `docs/features/*` for detailed guides and copy/paste examples:

- `docs/features/getting-started.md`
- `docs/features/core-configuration.md`
- `docs/features/admin-api-usage.md`
- `docs/features/billing-and-subscriptions.md`
- `docs/features/file-storage.md`
- `docs/features/error-tracking.md`
- `docs/features/audit-log.md`

---

## Legacy appendix (deprecated)

This legacy long-form integration guide was removed to keep this file small.

If you need the old detailed examples:

- Prefer `docs/features/*` for the current docs.
- Use git history to recover the older content.
