<!--
  GENERATED FILE — do not edit. Regenerate with: npm run build:prompts
-->

# Prompts for any MCP-compatible AI

Ready-to-use prompts mirroring the [Claude plugin](../plugin/README.md) commands. Use them with any MCP-compatible AI client (Cursor, VS Code Copilot, JetBrains AI, a plain Claude chat, etc.) — no plugin mechanism required.

## How to use

1. Connect the [teamcity-qa-mcp](../README.md) server to your AI client.
2. Open a prompt file below and copy its entire contents into the chat.
3. Add parameters in the same message if needed (each prompt lists its inputs).

## Available prompts

| Prompt | What it does |
|---|---|
| [Analyze Failed Build](analyze-failed-build.md) | Triage a failed build with root-cause grouping and investigation priorities |
| [Build Comparison Report](build-comparison-report.md) | Compare two builds to find regressions and resolved tests |
| [Change Impact Review](change-impact-review.md) | Review whether recent code changes relate to build failures |
| [Flaky Test Review](flaky-test-review.md) | Identify likely flaky tests from recent build history |
| [Generate Report](generate-report.md) | Generate a self-contained HTML build-health report for a config, list, or project |
| [Recent Builds Summary](recent-builds-summary.md) | Summarize recent build health for a given time window |
| [Test Count Stability](test-count-stability.md) | Analyze test count stability across recent green builds |

These files are generated from `plugin/commands/` and `plugin/skills/` — the plugin is the single source of truth. To change a prompt, edit the plugin and run `npm run build:prompts`.
