# Reports feature plan questions

This file captures questions and assumptions that came up while implementing the Reports feature, so we can refine it later.

## Assumptions made (implementation choices)

- Reports are implemented as part of the SuperInsights app under `GET /projects/:id/reports` (not as SaasBackend API routes).
- Async generation is implemented with an in-process background job (`setTimeout`), not a Redis/Bull queue.
- PDF rendering uses `pdfkit` (pure Node) rather than HTML->PDF.
- Storage uses SaasBackend object storage + `Asset` model directly (private assets), with namespace `${orgId}_${projectId}` and tag `report`.
- Reports currently support:
  - PDF
  - CSV (aggregated)
  - JSON
  - HTML (interactive in-app view)
- The report content is MVP-style (summary + basic sections), not the full spec layout (no sparklines/static chart images).
- Report expiration is stored in `Report.expiresAt` (default 30 days), but there is no cleanup/purge job yet.
- Delete is soft-delete only (`deletedAt`), and does not purge the stored Asset.

## Open questions for refinement

### Async / job processing

- Should we introduce a real queue (Bull/Redis) for production reliability (retries, concurrency limits, worker separation)?
- Should we keep deduplicating “identical” reports (same project + timeframe + filters + format) to reduce load?
  - Implemented in V2 via `dedupHash`.
- Should we store job progress in a more structured way (stages + timestamps) instead of a single `progress` integer?
  - Implemented in V2 (`stages` + `currentStage`).
- Should the timeout (5 minutes) be enforced as a hard kill (worker cancellation) rather than just marking the report as failed?

### Storage & lifecycle

- Should reports be stored as private assets (current) or allow optional public sharing links?
- Should delete also purge the Asset immediately?
- Should we implement an automated cleanup process (cron) that:
  - marks expired reports as deleted
  - deletes/purges associated assets
- Should we make expiration configurable per project or via global setting?

### Security / access control

- Viewer role currently can list/view/download, but cannot generate/delete.
  - Is that the intended policy for all org roles, including platform admin users?
- Do we need a stricter check for downloads to ensure the Asset belongs to the same org/project namespace?
  - Implemented in V2 using the Asset namespace returned by `services.assets.getAssetBytesById`.
  - Open: confirm `getAssetBytesById` always returns `asset.namespace` for all backends.

### Data & filtering

- Filters currently support `clientId`, `userId`, metadata map `meta`, and now also: `deviceType`, `browser`, `os`, `utmSource`, `utmMedium`, `utmCampaign`.
  - Open: should these additional filters apply consistently across *all* data types (events/errors/performance) instead of only PageViews?
- Should the filter template include timeframe as well (spec mentions “filter + timeframe combination”)?
  - Implemented in V2 (template stores timeframe + start/end).

### Report content

- Should we implement the full PDF layout as described (header/footer, per-section charts, distributions, etc.)?
- Should AI insights be scoped to the report timeframe (currently we include the latest completed AI run, regardless of its range)?
  - Implemented in V2: AI insights are included only if the latest completed AI run overlaps the report timeframe; otherwise we show a placeholder message.
- For `dataType=all`, do we want a single combined PDF (current) or one file per type?

### API shape / UX

- The spec suggests `DELETE /projects/:id/reports/:reportId`.
  - Implementation uses `POST /projects/:id/reports/:reportId/delete` to match existing patterns.
  - Do we want to migrate to RESTful DELETE routes?
- The docs mention “timeout handling / partial report download”.
  - Should we implement timeouts and partial outputs?

### CSV + HTML specifics

- CSV “raw” mode is exposed in UI, but backend currently generates aggregated CSV only.
  - Do we want to implement raw export (streaming) now, or hide the option until it exists?
- HTML reports are currently rendered from `contextSnapshot` stored in Mongo.
  - Do we need to sanitize/strip any fields before storing or rendering this context?
  - Should HTML view be available even when the report format was not `html`?

## Follow-up tasks (if we continue)

- Add CSV exporter (aggregated + raw).
- Add HTML export (future interactive charts).
- Add scheduled cleanup job for expiration.
- Add a real job queue and worker.
- Expand filters and template functionality.
