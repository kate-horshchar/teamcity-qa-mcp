# Claude plugin

The repository ships a Claude plugin ([`plugin/`](../plugin/)) that packages
proven QA workflows as slash commands. It works in **Claude Code**, **Claude
Desktop**, and **Claude Cowork** — plugins share one format across all three.
The plugin contains no credentials and makes no network calls of its own; it
drives the MCP server's tools.

## Installation

### Claude Code (individual)

The repository doubles as a plugin marketplace:

```
/plugin marketplace add kate-horshchar/teamcity-qa-mcp
/plugin install teamcity-qa@teamcity-qa-mcp
```

Prerequisite: the [MCP server itself](getting-started.md) is connected —
the plugin is the workflow layer on top of it.

### Claude Cowork (organization)

Organization admins upload the plugin as a zip
(**Organization settings → Plugins → Add plugin → Upload**). Build the zip
from a repo checkout:

```bash
npm run pack-plugin   # → teamcity-qa.zip
```

(GitHub-synced organization marketplaces require a private repository, so the
zip is the distribution path for this public repo.)

## Commands

| Command | Purpose |
|---|---|
| `/analyze-failed-build [BUILD_ID]` | Full triage of a failed build: clusters, new vs recurring, flaky suspicion, changes, priorities |
| `/recent-builds-summary [LOOKBACK_HOURS]` | Health check of the recent window (default 24h) |
| `/generate-report [TARGET] [LOOKBACK_HOURS]` | Self-contained HTML health report; TARGET = empty / config ID / comma-list / `project:<id>` |
| `/build-comparison-report [MODE] [A] [B]` | Compare builds: `failed_vs_previous_green`, `failed_vs_previous_failed`, `green_vs_green`, `custom` |
| `/change-impact-review [BUILD_ID]` | Correlate recent commits with failures (correlation, not blame) |
| `/flaky-test-review [LOOKBACK_BUILDS]` | Identify likely flaky vs consistently broken tests |
| `/test-count-stability [LOOKBACK_BUILDS]` | Explain test-count fluctuations across green builds (parameterized rotation vs real changes) |

Full command reference with inputs and output formats:
[`plugin/README.md`](../plugin/README.md).

## Skills — the shared logic

Two skills keep every command consistent:

- **qa-analysis** — analysis rules: failure grouping, new-vs-recurring
  classification, flaky language discipline ("likely flaky", never
  "definitely"), parameterized-test noise detection, report quality bar.
- **html-report** — presentation rules for HTML reports: health badge
  (green/amber/red) criteria, section order, and the hard requirement that
  reports are **self-contained** (inline CSS, no JavaScript, zero external
  requests — they open from `file://` and inside restrictive iframes).

## Scheduled health checks

`/generate-report` with no arguments is deliberately autonomous — it needs no
follow-up questions. That makes it directly usable in a scheduled task
("every morning run `/generate-report`"), producing a daily HTML health
report; the logic lives in the plugin, not in anyone's personal prompt.

## Using without Claude

Every command also exists as a standalone prompt in
[`prompts/`](../prompts/README.md) — same logic, any MCP-compatible client.
