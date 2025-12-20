# AI Analysis

## What it is

AI Analysis generates an LLM-written report in Markdown, summarizing project data (page views, events, errors, performance) over a selected time range. It can apply custom or pre-defined analysis presets using an LLM via OpenRouter.

## Base URL / mount prefix

This repo runs SuperInsights as a standalone Express app.

- Project UI routes are mounted at `/projects/*`.
- Preset API routes are mounted at `/ai-analysis/*`.

If you mount SuperInsights behind a reverse proxy or under a prefix, that prefix applies to **all** routes.

Example: if mounted under `/superinsights`, then:

- AI Analysis page: `GET /superinsights/projects/:projectId/ai-analysis`
- Presets API: `GET /superinsights/ai-analysis/presets`

## Configuration

### OpenRouter

- `OPENROUTER_API_KEY` (required)
  - Your OpenRouter API key.
- `OPENROUTER_BASE_URL` (optional)
  - Default: `https://openrouter.ai/api/v1`
- `AI_ANALYSIS_MODEL` (optional)
  - Default: `google/gemini-2.5-flash-lite`
- `AI_ANALYSIS_TEMPERATURE` (optional)
  - Default: `0.2`
- `AI_ANALYSIS_MAX_TOKENS` (optional)
  - Default: `900`
- `AI_ANALYSIS_TIMEOUT_MS` (optional)
  - Default: `25000`

## API

### User (session-authenticated)

All endpoints below require an authenticated session (middleware: `middleware/auth.js`).

#### Run analysis

- `POST /projects/:projectId/ai-analysis/run`

Request body:

```json
{
  "mode": "preset" | "custom",
  "timeframe": "24h" | "7d" | "30d",
  "start": "2025-01-01T00:00",
  "end": "2025-01-02T00:00",
  "presetId": "builtin:traffic" | "<mongoObjectId>"
}
```

Example:

```bash
curl -X POST "${BASE_URL}/projects/${PROJECT_ID}/ai-analysis/run" \
  -H "Content-Type: application/json" \
  -b "sid=${SID_COOKIE}" \
  -d '{"mode":"preset","timeframe":"7d","presetId":"builtin:performance"}'
```

#### Run history (JSON)

- `GET /projects/:projectId/ai-analysis/runs`
- `GET /projects/:projectId/ai-analysis/runs/:runId`

### Presets (user-level)

Presets are user-level and can be `private` or `public`.

Built-in presets exist and use IDs like `builtin:traffic` (read-only).

#### List presets

- `GET /ai-analysis/presets`

Example:

```bash
curl -sS "${BASE_URL}/ai-analysis/presets" \
  -H "Cookie: sid=${SID_COOKIE}" \
  | jq
```

Response shape:

```json
{
  "success": true,
  "data": {
    "builtins": ["..."],
    "mine": ["..."],
    "public": ["..."]
  }
}
```

#### CRUD

- `POST /ai-analysis/presets`
- `GET /ai-analysis/presets/:presetId`
- `PUT /ai-analysis/presets/:presetId`
- `DELETE /ai-analysis/presets/:presetId`
- `POST /ai-analysis/presets/:presetId/publish`
- `POST /ai-analysis/presets/:presetId/unpublish`

Example (create a new preset):

```bash
curl -X POST "${BASE_URL}/ai-analysis/presets" \
  -H "Content-Type: application/json" \
  -H "Cookie: sid=${SID_COOKIE}" \
  -d '{
        "name": "My Custom Preset",
        "description": "Analyze user engagement and conversion funnels.",
        "prompt": "Summarize key user engagement metrics and identify potential conversion bottlenecks.",
        "visibility": "private"
      }' \
  | jq
```

#### AI-assisted presets

- `POST /ai-analysis/presets/ai-generate` with `{ goal, visibility }`
- `POST /ai-analysis/presets/:presetId/ai-refine` with `{ goal }`

## Common errors / troubleshooting

- **Missing or invalid OpenRouter API Key**: Ensure `OPENROUTER_API_KEY` is correctly set in your environment.
- **LLM request failures**: Check server logs for network issues, OpenRouter service outages, or rate limit errors.
- **Preset not found**: Verify that the `presetId` (for built-in or custom presets) is correct.
- **No data for analysis**: If the selected time range has no relevant project data, the analysis might be empty or incomplete.

## Usage

1. Open a project.
2. Go to **AI Analysis**.
3. (Optional) Select an **analysis preset**.
3. Choose a range:
   - Preset: `24h`, `7d`, `30d`
   - Custom: start + end datetime
4. Click **Run analysis**.

The report is returned as Markdown and rendered in the UI using `marked`.

## Data included

- Pageviews: totals, unique visitors, by day, top pages
- Events: totals, by day, top event names
- Timed events: top slow events (based on `durationMs`)
- Errors: totals, unique fingerprints, by day, top fingerprints
- Performance: totals, by day, web vitals percentiles

## Samples per pattern

The analysis payload includes representative samples per unique pattern to help the LLM reason about concrete cases:

- Errors: samples per error fingerprint
- Timed events: samples per slow event name
- Events: samples per event name
- Pages: samples per URL
- Performance: samples for worst vitals buckets (>= p95 per metric)

Hard caps are applied for performance/cost:

- max patterns per section: 10
- max samples per pattern: 5

Large fields are truncated.

## Auditing

Every AI Analysis run is stored and audit-logged.

Audit action codes:
- `AI_ANALYSIS_RUN_STARTED`
- `AI_ANALYSIS_RUN_COMPLETED`
- `AI_ANALYSIS_RUN_FAILED`

Preset action codes:

- `AI_ANALYSIS_PRESET_CREATED`
- `AI_ANALYSIS_PRESET_UPDATED`
- `AI_ANALYSIS_PRESET_DELETED`
- `AI_ANALYSIS_PRESET_PUBLISHED`
- `AI_ANALYSIS_PRESET_UNPUBLISHED`
- `AI_ANALYSIS_PRESET_AI_GENERATED`
- `AI_ANALYSIS_PRESET_AI_REFINED`
