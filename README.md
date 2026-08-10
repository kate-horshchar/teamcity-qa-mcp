# teamcity-qa-mcp

Read-only MCP server for AI-assisted root-cause analysis of TeamCity build failures.

## The problem

When a CI test run goes red, finding out *why* is manual detective work: open the build, copy stack traces, scan the log, check what changed, compare with the previous build, search whether the same test failed before. For a build with dozens of failures this takes serious time — and most of it is mechanical data gathering, not thinking.

## The solution

This MCP server gives any MCP-compatible AI client structured, compact access to TeamCity data: builds, failed tests, logs, changes, history, diffs. The AI does the reasoning — classifying a failure as a **code change** (with the commit and author), **flaky behavior**, or an **infrastructure problem** — while the server does the data retrieval and normalization. The division of labor is strict: the server never guesses, the AI never scrapes.

## Features

- **Read-only by design** — no builds triggered, no tests muted, nothing written to TeamCity. Every API call is a GET.
- **Multi-config analysis** — aggregate failures across a list of build configurations or a whole project (nested subprojects included), with cross-config root-cause clusters: the same error hitting several configurations at once is a strong infrastructure signal.
- **Flexible targeting** — key tools accept a single build configuration, a list, or a project; with no target they use the configured default.
- **Root-cause clustering** — "43 failures" becomes "1 root cause: AuthException 503, affects 43 tests".
- **Compact JSON responses** optimized for LLM consumption; graceful degradation when data is unavailable.
- **Claude plugin included** ([`plugin/`](plugin/README.md)) — slash commands for triage, comparison, flaky review, and a self-contained HTML health report.
- **Prompts for any MCP client** ([`prompts/`](prompts/README.md)) — the same workflows as ready-to-paste prompts for Cursor, VS Code Copilot, JetBrains AI, and others.
- **stdio transport** — works with Claude Code, Claude Desktop, Cursor, and any other MCP-compatible client.

## Available Tools

### Build discovery
| Tool | Description |
|---|---|
| `list_recent_builds` | List recent builds; optionally filter by status and target another config, a list of configs, or a whole project |
| `get_build_by_id` | Get detailed info for a specific build (trigger, agent, revisions) |
| `get_build_tests` | Browse tests of any build (incl. green ones) with status/name/class filters and pagination |

### Failure investigation
| Tool | Description |
|---|---|
| `get_build_problems` | Get structured build-level problems |
| `get_failed_tests` | Get failed test occurrences for a build |
| `get_test_failure_details` | Get failure message, stack trace, expected/actual values for one test |
| `get_build_log_excerpt` | Get a compact log excerpt (tail + error windows), or regex-search the full log |
| `get_build_changes` | Get commits/changes associated with a build |

### History & patterns
| Tool | Description |
|---|---|
| `get_test_history` | Get recent execution history for a test — the flaky-detection backbone |
| `cluster_build_failures` | Group failed tests of a build by root cause |
| `find_failure_across_builds` | Check whether a failure pattern appeared in previous builds (firstSeen/lastSeen); supports config/list/project targets |

### Aggregated analysis contexts
| Tool | Description |
|---|---|
| `get_build_summary` | Compact summary card for a build: status, problem count, failed test count |
| `compare_builds` | Full diff of any two builds: new/fixed/persistent failures, missing/new tests, ignored changes |
| `get_failed_build_analysis_context` | One-call context for a failed build: clustered failures, changes, log excerpt, auto-comparison with previous green |
| `get_green_build_diff_context` | One-call context for comparing green builds: grouped diff, changes, neighboring-build validation |

### Multi-config analysis
| Tool | Description |
|---|---|
| `list_project_build_configs` | List all build configurations of a project, nested subprojects included |
| `get_multi_config_failure_summary` | Aggregate failure summary across a config / list / project: overall counts, cross-config root-cause clusters, per-config breakdown; 24h window by default |

### Runtime configuration
| Tool | Description |
|---|---|
| `set_build_type_id` | Switch the default build configuration at runtime (persists to found config files) |
| `set_auth_token` | Update the TeamCity token at runtime (persists to found config files) |

## Installation

### Option 1: Direct install (no source code needed)

One command — everything is configured inline:

```bash
claude mcp add --scope user --transport stdio teamcity-qa-mcp \
  --env TEAMCITY_URL=https://your-teamcity.com \
  --env TEAMCITY_TOKEN=your-token \
  --env TEAMCITY_BUILD_TYPE_ID=Your_BuildConfig_Id \
  -- npx -y git+https://github.com/kate-horshchar/teamcity-qa-mcp.git
```

No cloning, no source code, no `.env` file needed.

> **Scope options:** `--scope user` makes the server available across all projects. Use `--scope project` to share config via `.mcp.json` in the repo, or omit the flag for local (current project only).

### Option 2: Clone and run locally

```bash
git clone https://github.com/kate-horshchar/teamcity-qa-mcp.git
cd teamcity-qa-mcp
npm install
cp .env.example .env   # then fill in your values
```

Add the MCP server to Claude Code and verify the connection:

```bash
claude mcp add --transport stdio teamcity-qa-mcp -- node dist/index.js
npx tsx scripts/smoke-test.ts
```

### Claude Desktop

```bash
npx -y git+https://github.com/kate-horshchar/teamcity-qa-mcp.git setup-desktop \
  --url https://your-teamcity.com \
  --token your-token \
  --build-type Your_BuildConfig_Id
```

Then restart Claude Desktop.

### Claude plugin (optional)

This repository is also a plugin marketplace. In Claude Code:

```
/plugin marketplace add kate-horshchar/teamcity-qa-mcp
/plugin install teamcity-qa@teamcity-qa-mcp
```

See [`plugin/README.md`](plugin/README.md) for the command list and Cowork organization install; non-Claude clients can use [`prompts/`](prompts/README.md) instead.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `TEAMCITY_URL` | Yes | — | TeamCity server URL |
| `TEAMCITY_TOKEN` | Yes | — | Personal API token (Bearer) |
| `TEAMCITY_BUILD_TYPE_ID` | Yes | — | Default build configuration to analyze |
| `TEAMCITY_DEFAULT_LOOKBACK_BUILDS` | No | 20 | Number of recent builds to fetch |
| `TEAMCITY_LOG_TAIL_LINES` | No | 200 | Lines to include in log tail excerpt |
| `TEAMCITY_SIMILAR_FAILURES_LIMIT` | No | 10 | Max similar failures to return |

### How to get your TeamCity API token

1. Log in to your TeamCity instance
2. Navigate to your profile settings → **Access Tokens**
3. Create a new token with read-only permissions
4. Copy the token into your `.env` file or `--env` flag

## Documentation & examples

- [Getting started](docs/getting-started.md) — from zero to the first analysis
- [Root cause detection](docs/root-cause-detection.md) — how the AI separates code changes, flaky tests, and infrastructure
- [Multi-config analysis](docs/multi-config.md) — targets, aggregation, and cost controls
- [Claude plugin](docs/cowork-plugin.md) — installation and commands
- [Examples](examples/) — anonymized end-to-end scenarios, including a [sample HTML report](examples/sample-report.html)

## Roadmap

Open-source core plans. Unfinished items and new ideas live in [GitHub Issues](https://github.com/kate-horshchar/teamcity-qa-mcp/issues) (`enhancement`, `good first issue`) — suggestions and contributions are welcome.

| Item | Status |
|---|---|
| Publish to the npm registry (install without git) | Planned |
| Branch-aware analysis (filter builds/tests by VCS branch) | Planned |
| Config-scoped test history (optional target for `get_test_history`) | Planned |
| Configurable root-cause clustering rules | Planned |

## Versioning & releases

Semantic versioning; `package.json` is the single source of the version. Every release is a git tag with notes in [CHANGELOG.md](CHANGELOG.md) and a [GitHub Release](https://github.com/kate-horshchar/teamcity-qa-mcp/releases). Release process: [RELEASING.md](RELEASING.md).
