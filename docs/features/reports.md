# Reports

## What it is

Reports is a project-level analytics feature that generates a report for a selected time range and dataset (pageviews, events, errors, performance, or all).

Reports are generated asynchronously and stored as SaasBackend Assets, so they can be re-downloaded later.

Supported output formats:

- PDF
- CSV
- JSON
- HTML (interactive in-browser view)

## Base URL / mount prefix

This feature is part of the SuperInsights app (not the SaasBackend mount).

- Reports UI is under:
  - `GET /projects/:id/reports`

SaasBackend is mounted under `/saas` in this app. That mount prefix applies only to SaasBackend routes, for example:

- SaasBackend health is `GET /saas/health`

## Configuration

### Required

- `MONGODB_URI`

### Optional

- `UPLOAD_DIR` (only when SaasBackend object storage backend is filesystem)

Notes:

- Reports are stored using SaasBackend object storage (`fs` by default, `s3` if configured in SaasBackend global settings).

## API

All routes below are authenticated via the SuperInsights session (`ensureAuthenticated`) and require project access (`ensureProjectAccess`).

### Project (session-auth)

- `GET /projects/:id/reports`
  - Render reports list page

- `GET /projects/:id/reports/new`
  - Render report generation form
  - **Auth**: project role `owner|admin`

- `POST /projects/:id/reports/generate`
  - Start async generation
  - **Auth**: project role `owner|admin`

- `GET /projects/:id/reports/:reportId`
  - Render report detail page (includes polling)

- `GET /projects/:id/reports/:reportId/status`
  - Poll status for async generation

- `GET /projects/:id/reports/:reportId/download`
  - Download the generated file (PDF/CSV/JSON/HTML)

- `GET /projects/:id/reports/:reportId/view`
  - Render the completed report in an interactive HTML view (Chart.js)

- `POST /projects/:id/reports/:reportId/delete`
  - Soft-delete report
  - **Auth**: project role `owner|admin`

### Filter templates (session-auth)

- `GET /projects/:id/filter-templates`
  - List templates as JSON

- `POST /projects/:id/filter-templates`
  - Create template
  - **Auth**: project role `owner|admin`

- `POST /projects/:id/filter-templates/:templateId/delete`
  - Delete template
  - **Auth**: project role `owner|admin`

### curl examples

Note: These routes rely on cookie-based session auth. The examples below assume you already have an authenticated session cookie.

#### Generate a PDF report

```bash
curl -X POST "${BASE_URL}/projects/${PROJECT_ID}/reports/generate" \
  -H "Content-Type: application/json" \
  -b "sid=${SID_COOKIE_VALUE}" \
  -d '{
    "name": "Weekly report",
    "dataType": "pageviews",
    "timeframe": "7d",
    "format": "pdf",
    "includeAiInsights": false,
    "clientId": "optional-client-id",
    "userId": "optional-user-id",
    "deviceType": "optional: desktop|mobile|tablet",
    "browser": "optional",
    "os": "optional",
    "utmSource": "optional",
    "utmMedium": "optional",
    "utmCampaign": "optional",
    "meta": { "module": "checkout" }
  }'
```

#### Generate a CSV report

```bash
curl -X POST "${BASE_URL}/projects/${PROJECT_ID}/reports/generate" \
  -H "Content-Type: application/json" \
  -b "sid=${SID_COOKIE_VALUE}" \
  -d '{
    "name": "Weekly report (csv)",
    "dataType": "pageviews",
    "timeframe": "7d",
    "format": "csv",
    "csvMode": "aggregated"
  }'
```

#### Poll status

```bash
curl "${BASE_URL}/projects/${PROJECT_ID}/reports/${REPORT_ID}/status" \
  -b "sid=${SID_COOKIE_VALUE}"
```

The status payload includes structured stages and a coarse ETA:

- `currentStage`: `queued|aggregating|rendering|uploading`
- `stages`: array with `startedAt/completedAt`
- `elapsedSeconds`
- `estimatedSecondsRemaining`

#### Download

```bash
curl -L "${BASE_URL}/projects/${PROJECT_ID}/reports/${REPORT_ID}/download" \
  -b "sid=${SID_COOKIE_VALUE}" \
  -o report.pdf
```

## Admin UI

Reports are exposed in the project analytics UI:

- `GET /projects/:id/reports`

From there you can:

- Generate a new report
- View report status
- Download completed reports
- View completed reports in HTML
- Delete reports (owner/admin)

## Common errors / troubleshooting

- `429 RATE_LIMIT`
  - The server enforces ~1 report generation per 10 seconds per user per project.

- `429 RATE_LIMIT` on download
  - Downloads are rate-limited to 10 per minute per user per project.

- Download shows “Report is not ready for download”
  - The report is still `pending` or `generating`. Keep polling `/status` or refresh the detail page.

- Download returns `410`
  - The report has expired (default 30 days). Regenerate it.

- PDF generation fails after deploy
  - Ensure `pdfkit` is installed (`npm install`) and the server can write to the configured storage backend.
