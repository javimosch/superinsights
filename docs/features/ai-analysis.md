# AI Analysis

AI Analysis generates an LLM-written report (Markdown) for a project over a selected time range by aggregating SuperInsights data (page views, events, timed events, errors, and performance web vitals) and sending it to an LLM via OpenRouter.

## Access

- Authenticated users only.
- AI Analysis is not available via public links.

## Configuration

Set the following environment variables:

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

## Presets

Presets change the analysis focus by appending additional instructions to the LLM prompt.

- Presets are **user-level**.
- Presets can be:
  - `private`: only the owner can see/use/edit
  - `public`: visible to all authenticated users (read/use), but only the owner can edit/delete
- Built-in presets exist (read-only) and are returned alongside user presets.

When you run analysis with a preset, the run stores:

- `presetId`
- `presetSnapshot`

This makes runs reproducible even if the preset changes later.

### Preset API (authenticated)

Mounted under `/ai-analysis`:

- `GET /ai-analysis/presets`
- `POST /ai-analysis/presets`
- `GET /ai-analysis/presets/:presetId`
- `PUT /ai-analysis/presets/:presetId`
- `DELETE /ai-analysis/presets/:presetId`
- `POST /ai-analysis/presets/:presetId/publish`
- `POST /ai-analysis/presets/:presetId/unpublish`

### AI-assisted presets

The UI includes an **AI preset assistant** that can create or refine presets.

- Create: `POST /ai-analysis/presets/ai-generate` with `{ goal, visibility }`
- Refine: `POST /ai-analysis/presets/:presetId/ai-refine` with `{ goal }`

The LLM returns strict JSON defining the preset.

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
