---
description: Generate a self-contained HTML build-health report for a config, list, or project
---

# Generate Report

Generate a self-contained HTML build-health report and save it as a single file.

Apply the shared **qa-analysis** skill for all analysis decisions and the
**html-report** skill for the report structure and technical requirements.

## Inputs

- `[TARGET]` — optional. What to report on:
  - empty — the configured default build configuration;
  - a build configuration ID (e.g. `Acme_Api_Tests`);
  - a comma-separated list of configuration IDs;
  - `project:<projectId>` — a whole project, including nested subprojects.
- `[LOOKBACK_HOURS]` — optional. Analysis window in hours. Default: 24.

## Analysis steps

1. **Resolve the target and collect the data.**
   Call `get_multi_config_failure_summary` with the target mapped to its
   parameters (`buildTypeId`, `buildTypeIds`, or `projectId` — at most one;
   none for the default) and `sinceHours` set to the lookback window.
   This one call returns the overall summary, per-configuration breakdown,
   builds in the window, failure clusters, and cross-config clusters.

2. **Handle the empty window.**
   If no builds fall within the window, produce the minimal report described
   in the html-report skill (header + gray badge + note) and stop.

3. **Classify new vs recurring.**
   For each failure cluster of a failing configuration, determine whether it
   is new or recurring (per the qa-analysis skill). Prefer cheap evidence:
   the `comparisonWithPreviousGreen` from `get_failed_build_analysis_context`
   for the single worst build, or `find_failure_across_builds` for a dominant
   exception type. Do not deep-dive every configuration — this is a health
   report, not a full triage. If evidence is insufficient, mark "unknown".

4. **Drill into the worst failures only if needed.**
   If a failing build's clusters are unclear from the summary, call
   `cluster_build_failures` or `get_build_summary` for that build only.
   Skip this for configurations that are green or already clear.

5. **Determine the health badge** using the rules in the html-report skill
   (green / amber / red), based on new-vs-recurring and latest build statuses.

6. **Render the HTML** following the html-report skill exactly:
   fill `report-template.html`, keep it self-contained (inline CSS, zero
   external requests), include the multi-config sections only when more than
   one configuration was analyzed.

7. **Save and reply.**
   Write the file (naming per the html-report skill), then reply in chat with:
   the file path, the badge, and a 2–3 sentence text summary. Do not paste
   the full HTML into the chat.

## Rules

- One `get_multi_config_failure_summary` call is the backbone; every extra
  tool call must answer a specific open question. Keep total calls low —
  this command may run on a schedule.
- Every number in the report comes from tool data. No estimates.
- The report must open correctly offline (`file://`) — no external resources.
- For scheduled use ("daily health check"), the default invocation
  (`/generate-report` with no arguments) must produce a complete report
  without any follow-up questions to the user.
