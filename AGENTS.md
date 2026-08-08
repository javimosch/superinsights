# SuperInsights Agent Resources

## Skills

- [si-cli](.agents/skills/si-cli/SKILL.md) — Use `si` CLI to query analytics data (events, pageviews, errors, autocapture) without the dashboard.

## Stack

- Node.js / Express
- MongoDB
- EJS + Tailwind + DaisyUI (dashboard UI)
- Go (`cmd/si/`) — CLI for agent-first analytics queries

## Notes

- **`javimosch/si-cli` is ARCHIVED (read-only) — do not use it, do not link to it.** It was a
  standalone repo for the `si` CLI, later folded into this repo as `cmd/si/` (the canonical
  source going forward). The archived repo's last release (`v0.1.0`) predates a server-side
  JSON fix and silently fails against the current API (wrong base path, missing `Accept`
  header, wrong response-wrapper assumption) — `si stats` there reports fake all-null success
  instead of erroring. Always build/release from `cmd/si/` here; the working release is
  `si-v0.1.1` (`gh release view si-v0.1.1 --repo javimosch/superinsights`).

- Autocaptured `$click` events store `properties` from the browser SDK
  (`public/sdk/superinsights.js`) with this shape:
  `tag`, `id`, `className`, `text`, `href` (for `<a>` elements), `data` (object of all
  `data-*` attributes), `selector`, and `rect` (`{x, y, w, h}`). When rendering in the
  dashboard, surface `tag` as a badge, `text` and `href` as the human-readable payload,
  and `data` attributes such as `data.id` alongside `selector`.
