# TeamCity QA Plugin

Claude plugin for practical QA analysis of TeamCity builds. Works in Claude Code, Claude Desktop, and Claude Cowork. Uses the [teamcity-qa-mcp](../README.md) MCP server for data access — the plugin contains no credentials and makes no direct network calls.

## Requirements

A connected `teamcity-qa-mcp` MCP server (see the [main README](../README.md) for installation). The server is configured with:

- `TEAMCITY_URL` — your TeamCity server URL
- `TEAMCITY_TOKEN` — TeamCity API authentication token
- `TEAMCITY_BUILD_TYPE_ID` — the default build configuration to analyze

You can update `TEAMCITY_BUILD_TYPE_ID` and `TEAMCITY_TOKEN` at runtime using the `set_build_type_id` and `set_auth_token` MCP tools without restarting. Most commands also accept an explicit target (a build configuration, a list, or a whole project), so switching the default is often unnecessary.

## Installation

### Claude Code

This repository is itself a plugin marketplace:

```
/plugin marketplace add kate-horshchar/teamcity-qa-mcp
/plugin install teamcity-qa@teamcity-qa-mcp
```

### Claude Cowork (organization-level)

Organization admins can upload the plugin as a zip: **Organization settings → Plugins → Add plugin → Upload**. Build the zip from this folder with:

```bash
npm run pack-plugin
```

## Commands

### `/analyze-failed-build [BUILD_ID]`

Triage a failed build. Groups failures by root cause, classifies new vs recurring, flags flaky suspicion, reviews changes, and provides investigation priorities.

If no build ID is given, picks the most relevant recent failed build.

### `/recent-builds-summary [LOOKBACK_HOURS]`

Summarize recent build health. Shows pass/fail ratio, notable failures, recurring patterns, and key takeaways. Default lookback: 24 hours.

### `/generate-report [TARGET] [LOOKBACK_HOURS]`

Generate a self-contained HTML build-health report (single file, inline CSS, no external resources — opens offline). `TARGET` is optional: empty for the configured default, a build configuration ID, a comma-separated list of IDs, or `project:<projectId>` for a whole project including nested subprojects. Default lookback: 24 hours.

### `/build-comparison-report [COMPARE_MODE] [BUILD_ID_A] [BUILD_ID_B]`

Compare two builds. Supported modes: `failed_vs_previous_green`, `failed_vs_previous_failed`, `green_vs_green`, `custom`.

The `green_vs_green` mode is designed for investigating test count differences between successful builds — it automatically detects parameterized test rotation vs real changes.

### `/change-impact-review [BUILD_ID]`

Review whether recent code changes may relate to build failures.

### `/flaky-test-review [LOOKBACK_BUILDS]`

Identify likely flaky tests from recent build history. Default lookback: 10 builds.

### `/test-count-stability [LOOKBACK_BUILDS]`

Analyze test count stability across recent green builds. Identifies parameterized test rotation, real test additions/removals, and whether count instability is cosmetic or a real concern. Default lookback: 10 builds.

## Shared Skills

- **qa-analysis** — shared analysis rules used by all commands: failure grouping, new-vs-recurring classification, flaky identification, parameterized test noise detection, and report quality standards.
- **html-report** — presentation logic for HTML reports: health badge rules, report structure, and the self-contained (inline CSS, zero external requests) requirement. Used by `/generate-report` and any scheduled health-check task.
