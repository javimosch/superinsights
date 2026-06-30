# si-cli — SuperInsights CLI agent skill

Use `si` CLI to answer user questions about their SuperInsights analytics data (events, pageviews, errors, stats, autocapture clicks) without opening the dashboard or querying MongoDB directly.

## When to use

Invoke this skill when the user asks:
- "How many pageviews / events / errors in the last X?"
- "What's happening in my analytics?"
- "Show me the top clicked elements"
- "Any errors recently?"
- "What events are being captured?"
- "Check my SuperInsights stats"
- Any question about analytics data, trends, or autocapture

Do NOT use this skill for:
- Modifying/deleting analytics data (read-only CLI)
- Server configuration or deployment
- Account/user management

## Setup

The `si` binary lives at `cmd/si/si` in the superinsights repo.
Build it with:

```bash
cd cmd/si && go build -o si . && cd ../..
```

Configuration is via env vars:

```bash
export SI_PROJECT_ID="<project_id>"
export SI_TOKEN="<public_link_token>"
export SI_API_URL="https://superinsights.coolify.intrane.fr"  # default
```

The project ID and public link token are obtained from the SuperInsights project settings → Public Link section. The public link must be enabled for `si` to work.

## Commands

| Command | Description | Example |
|---------|-------------|---------|
| `si stats` | Summary of pageviews, events, errors | `si stats --timeframe 7d` |
| `si events list` | List events, optionally filtered | `si events list --event \$click` |
| `si events get <name>` | Details for a specific event name | `si events get pageview` |
| `si pageviews` | Pageview analytics | `si pageviews --timeframe 30d` |
| `si errors` | Error aggregates | `si errors --timeframe 7d` |
| `si autocapture` | Autocapture ($click) info | `si autocapture --top` |
| `si projects` | Show connected project info | `si projects` |

All commands support `--json` for structured output and `--timeframe` for time range (1h, 6h, 24h, 7d, 30d, 3m, 1y).

## Output format

- Default: human-readable text with key-value pairs
- `--json`: versioned JSON envelope: `{"version":"1.0","data":{...}}`
- stderr: errors, warnings, progress
- stdout: primary data (always parseable)

## Exit codes

| Code | Meaning | Agent action |
|------|---------|-------------|
| 0 | Success | Proceed |
| 80 | Invalid argument | Fix input, don't retry |
| 85 | Missing configuration | Set SI_PROJECT_ID and SI_TOKEN |
| 92 | Not found | Check project ID and token |
| 100 | API error | Retry with backoff |
| 105 | Connection failed | Check SI_API_URL |
| 110 | Internal error | Report bug |

## Caveats & learnings

1. **Accept header required**: The CLI sends `Accept: application/json`. The server controllers return JSON only when this header is present. Without it, they render HTML. This was added specifically for the CLI.

2. **Public link must be enabled**: `si` uses the project's public link token (`/p/:id/:token/*` routes). The public link must be enabled in project settings. If the token changes, update the env var.

3. **Read-only**: All queries are GET requests to public routes. No data modification is possible. Write operations (ingestion, config changes) are not exposed.

4. **Timeframe defaults to 24h**: Always pass `--timeframe` explicitly for agent scripts to avoid confusion.

5. **Token hash uses pepper**: The `PUBLIC_LINK_PEPPER` env var prefixes the token hash. If the pepper is missing from the server env, the hash is computed as `sha256(":" + token)`. Changing the pepper invalidates all existing tokens.

6. **No data yet?** New projects have zero data. Check the timeframe: if the project was just created, expand to `--timeframe 30d` or `--timeframe 1y`.

7. **`$click` events**: Autocapture events are stored as regular events with `eventName: "$click"`. The dollar sign is literal — no special escaping needed in the URL path.

8. **Rebuild after server changes**: If the API response format changes, rebuild the CLI: `cd cmd/si && go build -o si .`

## Agent workflow

```bash
# 1. Quick overview
si stats --timeframe 7d

# 2. Check specific events
si events list --event $click --json | jq '.data.recentOccurrences | length'

# 3. Inspect autocapture
si events get $click --timeframe 7d --json | jq '.data.occurrences[:3]'

# 4. Check errors
si errors --timeframe 7d --json

# 5. Pageview trends
si pageviews --timeframe 30d --json | jq '.data.topPages[:5]'
```

## Related

- Source: `cmd/si/` in this repo
- Repo: https://github.com/javimosch/superinsights
- Skill file: `.agents/skills/si-cli/SKILL.md`
