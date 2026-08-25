# Getting started

From zero to one complete build analysis in about ten minutes.

## 1. Create a TeamCity access token

1. Log in to your TeamCity instance.
2. Open your profile → **Access Tokens** → **Create access token**.
3. Copy the value — you will not see it again.

TeamCity tokens inherit the permissions of the account that creates them; there
is no read-only switch on the token itself. If you want to be certain this
server can only read, create the token from an account whose role on the target
projects is view-only — the built-in *Project viewer* role covers everything
used here.

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
  -- npx -y teamcity-qa-mcp
```

Other clients (Cursor, VS Code, JetBrains AI): register a stdio MCP server
with the same command (`npx -y teamcity-qa-mcp`) and the same three
environment variables.

## 4. Verify the connection

Ask your AI client:

> List the recent builds

**This worked if** you get back a short list of build cards — build number,
status, start and finish dates, branch. If the cards are there, the token, the
URL, and the configuration ID are all correct.

**If it did not work**, see [Troubleshooting](#troubleshooting) before
continuing.

## 5. Run one full analysis

This is the part worth judging. Ask:

> Find the most recent failed build and tell me why it failed

If you installed the [Claude plugin](../plugin/README.md), the same workflow
runs as `/analyze-failed-build` — a fixed prompt instead of a free-form one.

**A good result contains all of these:**

- Failures **grouped by root cause**, not listed one by one — twenty tests
  failing on the same exception is one problem, not twenty.
- Each group marked **new or recurring** — was it already failing in the
  previous build?
- **Flaky suspicion** stated as a likelihood, never as a verdict.
- The **commits in this build**, and whether any of them touch the area the
  failing tests exercise.
- A short **what to check first** list, ordered.

Compare what you got with the worked example in
[`examples/analyze-failed-build.md`](../examples/analyze-failed-build.md),
which runs the same workflow on fictional data.

**No failed builds right now?** Ask for an older one instead:
*"List the last 20 builds including failures"*, then point the analysis at a
specific build ID.

## 6. Tell me how it went

Three questions:

1. Did the setup work using only this page, without guessing anything?
2. Did the analysis group the failures the way you would have grouped them?
3. What did it miss that you would have checked yourself?

[Open an issue](https://github.com/kate-horshchar/teamcity-qa-mcp/issues/new/choose)
with whatever you have — a half-answer is fine, including where you gave up.

## Where to go next

- [Root cause detection](root-cause-detection.md) — how code changes, flaky
  tests, and infrastructure problems are told apart
- [Multi-config analysis](multi-config.md) — one project instead of one
  configuration
- [Claude plugin](../plugin/README.md) — the same workflows as repeatable slash
  commands, plus HTML health reports
- [Prompts](../prompts/README.md) — the same workflows for non-Claude clients

## Troubleshooting

- **The server never starts / shows as failed to connect** — almost always a
  missing environment variable. All three of `TEAMCITY_URL`, `TEAMCITY_TOKEN`
  and `TEAMCITY_BUILD_TYPE_ID` are required. The error goes to the MCP server
  log, not to the chat: in Claude Code, check with `claude mcp list`.
- **401 Unauthorized** — the token expired or lacks permissions. Create a new
  one and update it without restarting: ask the AI to call `set_auth_token`.
- **Empty build list** — check `TEAMCITY_BUILD_TYPE_ID`: it must be the ID
  (e.g. `MyProject_ApiTests`), not the display name.
- **Log excerpt unavailable** — some TeamCity setups restrict log download;
  all other tools keep working, the AI falls back to structured data.
