# Getting started

From zero to your first AI-assisted build analysis in about five minutes.

## 1. Create a TeamCity access token

1. Log in to your TeamCity instance.
2. Open your profile → **Access Tokens** → **Create access token**.
3. Give it read-only permissions and copy the value — you will not see it again.

## 2. Find your build configuration ID

Open the build configuration in TeamCity. The ID is in the URL
(`buildTypeId=My_Project_ApiTests`) and on the configuration's settings page.
This becomes `TEAMCITY_BUILD_TYPE_ID` — the *default* target for analysis.
You can switch it at runtime later (`set_build_type_id`) or target other
configurations per call, so pick the one you look at most often.

## 3. Connect the server to your AI client

For Claude Code, one command is enough:

```bash
claude mcp add --scope user --transport stdio teamcity-qa-mcp \
  --env TEAMCITY_URL=https://your-teamcity.com \
  --env TEAMCITY_TOKEN=your-token \
  --env TEAMCITY_BUILD_TYPE_ID=Your_BuildConfig_Id \
  -- npx -y git+https://github.com/kate-horshchar/teamcity-qa-mcp.git
```

Other clients (Cursor, VS Code, JetBrains AI): register a stdio MCP server
with the same command (`npx -y git+https://github.com/kate-horshchar/teamcity-qa-mcp.git`)
and the same three environment variables.

## 4. Verify the connection

Ask your AI client:

> List the recent builds

You should see compact build cards (number, status, dates, branch). If you
cloned the repo instead, you can also verify outside the AI client:

```bash
npx tsx scripts/smoke-test.ts
```

## 5. Run your first analysis

Some useful first questions:

- *"Why did the last build fail?"* — the AI will use
  `get_failed_build_analysis_context` and cluster the failures by root cause.
- *"Is `MyTest` flaky?"* — `get_test_history` shows its pass/fail sequence.
- *"Did this timeout happen before?"* — `find_failure_across_builds` checks
  the recent history for the same pattern.
- *"How healthy is project X today?"* — `get_multi_config_failure_summary`
  aggregates all configurations of a project (see
  [multi-config analysis](multi-config.md)).

For repeatable, structured workflows use the [Claude plugin](cowork-plugin.md)
or the copy-paste [prompts](../prompts/README.md).

## Troubleshooting

- **401 Unauthorized** — the token expired or lacks permissions. Create a new
  one and update it without restarting: ask the AI to call `set_auth_token`.
- **Empty build list** — check `TEAMCITY_BUILD_TYPE_ID`: it must be the ID
  (e.g. `MyProject_ApiTests`), not the display name.
- **Log excerpt unavailable** — some TeamCity setups restrict log download;
  all other tools keep working, the AI falls back to structured data.
