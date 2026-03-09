# teamcity-qa-mcp

Read-only MCP server for CI/CD build failure analysis, designed for QA Automation workflows.

Provides structured access to TeamCity build data — builds, failures, test results, logs, and changes. The MCP handles data retrieval and normalization; the AI client (Claude, Cursor, etc.) handles reasoning and analysis.

## Features

- 13 tools for build inspection and failure investigation
- Read-only — no builds triggered, no settings changed
- Compact JSON responses optimized for LLM consumption
- Graceful degradation when data is unavailable
- Works with any MCP-compatible client (Claude Code, Cursor, VS Code Copilot, JetBrains AI, etc.)

## Available Tools

| Tool | Description |
|---|---|
| `list_recent_builds` | List recent builds, optionally filter by status (SUCCESS, FAILURE, ERROR) |
| `get_build_by_id` | Get detailed info for a specific build |
| `get_build_problems` | Get structured build problems |
| `get_failed_tests` | Get failed test occurrences for a build |
| `get_test_failure_details` | Get failure message, stack trace, expected/actual values |
| `get_build_log_excerpt` | Get a compact, relevant excerpt from the build log |
| `get_build_changes` | Get commits/changes associated with a build |
| `get_test_history` | Get recent execution history for a test |
| `cluster_build_failures` | Group failed tests by root cause — e.g. "35 tests failed due to AuthException 503" |
| `find_failure_across_builds` | Check if a failure pattern appeared in previous builds (with firstSeen/lastSeen) |
| `get_build_summary` | Get a compact summary card for a build |
| `compare_builds` | Full diff of any two builds: test counts, new/fixed failures, missing/new tests, ignored changes |
| `get_failed_build_analysis_context` | Compact analysis context: clustered failures, changes, log, auto-comparison with previous green |

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
```

Create your `.env` file from the template:

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```properties
TEAMCITY_URL=https://your-teamcity.com
TEAMCITY_TOKEN=your-bearer-token
TEAMCITY_BUILD_TYPE_ID=Your_BuildConfig_Id
```

Add the MCP server to Claude Code:

```bash
claude mcp add --transport stdio teamcity-qa-mcp -- node dist/index.js
```

Verify the connection:

```bash
npx tsx scripts/smoke-test.ts
```

### Claude Desktop

Run the setup script to automatically add the MCP server to Claude Desktop config:

```bash
npx -y git+https://github.com/kate-horshchar/teamcity-qa-mcp.git setup-desktop \
  --url https://your-teamcity.com \
  --token your-token \
  --build-type Your_BuildConfig_Id
```

Then restart Claude Desktop.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `TEAMCITY_URL` | Yes | — | TeamCity server URL |
| `TEAMCITY_TOKEN` | Yes | — | Personal API token (Bearer) |
| `TEAMCITY_BUILD_TYPE_ID` | Yes | — | Build configuration ID to monitor |
| `TEAMCITY_DEFAULT_LOOKBACK_BUILDS` | No | 20 | Number of recent builds to fetch |
| `TEAMCITY_LOG_TAIL_LINES` | No | 200 | Lines to include in log tail excerpt |
| `TEAMCITY_SIMILAR_FAILURES_LIMIT` | No | 10 | Max similar failures to return |

## How to get your TeamCity API token

1. Log in to your TeamCity instance
2. Navigate to your profile settings
3. Find the **Access Tokens** section
4. Create a new token with read-only permissions
5. Copy the token into your `.env` file or `--env` flag

## Version

**v1.0.0** — single build configuration, 13 tools for build analysis and failure investigation.
