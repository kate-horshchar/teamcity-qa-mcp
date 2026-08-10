<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/generate-report.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

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

---

# Shared skill: html-report

# HTML Report Skill

Presentation logic for TeamCity build-health HTML reports. This skill defines
HOW a report looks; data collection is defined by the caller (the
`/generate-report` command, a scheduled health-check task, or an ad-hoc
request). Apply the **qa-analysis** skill for all analysis decisions
(failure grouping, new vs recurring, flaky language).

## Hard technical requirements

- **Self-contained, single file.** All CSS inline in one `<style>` block.
  No JavaScript unless strictly necessary; when used, it must be inline.
- **Zero external requests.** No CDN links, no webfonts, no external
  stylesheets or scripts, no images loaded by URL, no analytics. The file
  must render fully offline from `file://` and inside a restrictive iframe
  (e.g. a TeamCity report tab that returns 403 for external resources).
- Fonts: system stack only
  (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`).
  Icons: inline SVG or Unicode symbols only.
- Use `plugin/skills/html-report/report-template.html` as the base skeleton.
  Fill the `{{...}}` placeholders and repeat the marked row/card blocks.
  Keep its class names and structure — do not redesign the layout.
- Save the result as a single `.html` file named
  `teamcity-health-report-<YYYY-MM-DD>.html` (append `-HHmm` if the file
  already exists), in the current working directory unless the user names
  a path. Tell the user the full path. Do not paste the whole HTML into chat.

## Report structure (in order)

1. **Header** — report title, the analysis window (explicit dates/times with
   timezone), target description (configuration / list / project), and
   generation timestamp.
2. **Health badge** — one overall status:
   - **GREEN** — no failed builds in the window.
   - **AMBER** — failures exist, but none are new (all recurring/known), or
     every failing configuration already recovered with a later green build.
   - **RED** — new failures present, or the latest build of any targeted
     configuration is currently failing.
   When classification data is insufficient (e.g. no baseline build to
   determine "new"), prefer the more severe badge and say why.
3. **Summary cards** — builds in window, passed, failed, regressions
   (new failures). With a multi-config target, add cards for configurations
   analyzed and configurations with failures.
4. **Per-configuration health** *(multi-config targets only)* — one table
   row per configuration: name/ID, latest build status (color-coded),
   builds in window, failed tests, one-line dominant failure. Order:
   failing configurations first.
5. **Builds table** — per build: number (linked to `webUrl`), configuration
   (multi-config only), color-coded status, start time, failed test count.
6. **Notable failures** — root-cause clusters, not raw test lists: cluster
   label (exception type or dominant error line), affected test count,
   representative test name, new/recurring/unknown. For multi-config
   targets, clusters spanning several configurations come first and are
   explicitly marked — the same cause across configs is a strong
   infrastructure signal.
7. **Recurring vs new** — short breakdown of which failures are new in this
   window and which were already known. If history is insufficient, say
   "insufficient history" — never guess.
8. **Key takeaways** — 2–4 bullets: what changed, what is broken, what
   deserves attention first. Written for a QA engineer scanning the report
   in 30 seconds.

## Color coding

Apply status colors consistently (they are predefined in the template):
green `#1a7f37` for SUCCESS, amber `#9a6700` for warnings/unstable,
red `#cf222e` for FAILURE/ERROR, gray `#57606a` for unknown/no data.
Color must never be the only signal — always pair it with a text label.

## Content honesty

- Every number must come from tool data. No invented or estimated values.
- An empty window is a valid report: state "no builds in the window" and
  render the header, a gray badge, and a short note — nothing else.
- Sections with nothing to show collapse to a single line, not filler.
- Do not name individuals as culprits; reference changes neutrally.

---

# Report template (report-template.html)

The html-report skill references this file; it is inlined here so the prompt is self-contained. Use it as the base skeleton for the generated report.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{REPORT_TITLE}}</title>
<!--
  TeamCity build-health report template.
  Self-contained by design: all CSS is inline, no JavaScript, no external
  requests of any kind. Must render offline (file://) and inside a
  restrictive iframe. Fill {{...}} placeholders; repeat blocks marked with
  "repeat:" comments; delete optional sections that do not apply.
-->
<style>
  :root {
    --green: #1a7f37; --green-bg: #dafbe1;
    --amber: #9a6700; --amber-bg: #fff8c5;
    --red: #cf222e;   --red-bg: #ffebe9;
    --gray: #57606a;  --gray-bg: #f6f8fa;
    --border: #d0d7de; --text: #1f2328; --muted: #57606a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px; color: var(--text); background: #ffffff;
    font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .report { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 28px 0 10px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
  .meta { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
  .badge {
    display: inline-block; padding: 6px 14px; border-radius: 20px;
    font-weight: 600; font-size: 14px; letter-spacing: .3px;
  }
  .badge.green { background: var(--green-bg); color: var(--green); }
  .badge.amber { background: var(--amber-bg); color: var(--amber); }
  .badge.red   { background: var(--red-bg);   color: var(--red); }
  .badge.gray  { background: var(--gray-bg);  color: var(--gray); }
  .cards { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
  .card {
    flex: 1 1 120px; min-width: 120px; padding: 12px 16px;
    border: 1px solid var(--border); border-radius: 8px; background: var(--gray-bg);
  }
  .card .num { font-size: 24px; font-weight: 700; display: block; }
  .card .label { color: var(--muted); font-size: 12px; }
  .card.bad .num { color: var(--red); }
  .card.good .num { color: var(--green); }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .4px; }
  .status { font-weight: 600; }
  .status.success { color: var(--green); }
  .status.failure { color: var(--red); }
  .status.unknown { color: var(--gray); }
  .cluster {
    border: 1px solid var(--border); border-left: 4px solid var(--red);
    border-radius: 6px; padding: 10px 14px; margin: 10px 0; background: #fff;
  }
  .cluster.cross-config { border-left-color: var(--amber); background: var(--amber-bg); }
  .cluster .head { font-weight: 600; }
  .cluster .tag {
    display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 8px;
    border-radius: 10px; margin-left: 8px; vertical-align: middle;
  }
  .tag.new { background: var(--red-bg); color: var(--red); }
  .tag.recurring { background: var(--gray-bg); color: var(--gray); }
  .tag.infra { background: var(--amber-bg); color: var(--amber); }
  .cluster .detail { color: var(--muted); font-size: 13px; margin-top: 4px; }
  code, .mono { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12.5px; }
  ul.takeaways { padding-left: 20px; }
  ul.takeaways li { margin: 6px 0; }
  .footer { margin-top: 28px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); padding-top: 10px; }
  a { color: #0969da; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="report">

  <h1>{{REPORT_TITLE}}</h1>
  <div class="meta">
    Target: {{TARGET_DESCRIPTION}} &middot; Window: {{WINDOW_FROM}} &ndash; {{WINDOW_TO}} ({{WINDOW_HOURS}}h) &middot; Generated: {{GENERATED_AT}}
  </div>

  <!-- Health badge: use class green / amber / red / gray -->
  <span class="badge {{BADGE_CLASS}}">{{BADGE_LABEL}}</span>

  <div class="cards">
    <!-- repeat: one card per metric; add class "good"/"bad" to color the number -->
    <div class="card"><span class="num">{{BUILDS_TOTAL}}</span><span class="label">Builds in window</span></div>
    <div class="card good"><span class="num">{{BUILDS_PASSED}}</span><span class="label">Passed</span></div>
    <div class="card bad"><span class="num">{{BUILDS_FAILED}}</span><span class="label">Failed</span></div>
    <div class="card bad"><span class="num">{{REGRESSIONS}}</span><span class="label">New failures</span></div>
    <!-- /repeat -->
  </div>

  <!-- OPTIONAL section: only for multi-config targets; delete otherwise -->
  <h2>Configuration health</h2>
  <table>
    <thead><tr><th>Configuration</th><th>Latest</th><th>Builds</th><th>Failed tests</th><th>Dominant failure</th></tr></thead>
    <tbody>
      <!-- repeat: one row per configuration, failing configurations first -->
      <tr>
        <td class="mono">{{CONFIG_ID}}</td>
        <td><span class="status {{CONFIG_STATUS_CLASS}}">{{CONFIG_STATUS}}</span></td>
        <td>{{CONFIG_BUILDS}}</td>
        <td>{{CONFIG_FAILED_TESTS}}</td>
        <td>{{CONFIG_DOMINANT_FAILURE}}</td>
      </tr>
      <!-- /repeat -->
    </tbody>
  </table>
  <!-- /OPTIONAL -->

  <h2>Builds</h2>
  <table>
    <thead><tr><th>Build</th><th>Configuration</th><th>Status</th><th>Started</th><th>Failed tests</th></tr></thead>
    <tbody>
      <!-- repeat: one row per build, newest first; link the number to webUrl -->
      <tr>
        <td><a href="{{BUILD_URL}}">#{{BUILD_NUMBER}}</a></td>
        <td class="mono">{{BUILD_CONFIG}}</td>
        <td><span class="status {{BUILD_STATUS_CLASS}}">{{BUILD_STATUS}}</span></td>
        <td>{{BUILD_STARTED}}</td>
        <td>{{BUILD_FAILED_TESTS}}</td>
      </tr>
      <!-- /repeat -->
    </tbody>
  </table>

  <h2>Notable failures</h2>
  <!-- repeat: one block per root-cause cluster; cross-config clusters first
       with class "cluster cross-config" and the infra tag -->
  <div class="cluster">
    <div class="head">{{CLUSTER_LABEL}} — {{CLUSTER_TEST_COUNT}} tests
      <span class="tag {{CLUSTER_TAG_CLASS}}">{{CLUSTER_TAG}}</span>
    </div>
    <div class="detail">Representative: <code>{{CLUSTER_REPRESENTATIVE_TEST}}</code></div>
    <div class="detail">{{CLUSTER_ERROR_SUMMARY}}</div>
  </div>
  <!-- /repeat -->

  <h2>Recurring vs new</h2>
  <p>{{RECURRING_VS_NEW_SUMMARY}}</p>

  <h2>Key takeaways</h2>
  <ul class="takeaways">
    <!-- repeat: 2–4 items -->
    <li>{{TAKEAWAY}}</li>
    <!-- /repeat -->
  </ul>

  <div class="footer">
    Generated by the TeamCity QA plugin &middot; data from the teamcity-qa-mcp server &middot; self-contained report, no external resources.
  </div>

</div>
</body>
</html>
```

---

# Shared skill: qa-analysis

# QA Analysis Skill

Shared analysis logic for all TeamCity QA commands. Apply these rules whenever performing QA build analysis.

## Failure grouping

- Group test failures by likely root cause, not just by test class.
- Useful grouping signals: shared exception type, shared error message substring, same test suite or package, same infrastructure symptom (timeout, connection refused, OOM).
- A single root cause can span multiple test classes. Look for the common thread.
- When groups are unclear, prefer fewer larger groups over many singleton groups.

## New vs recurring classification

- A failure is **new** if it did not appear in the immediately preceding build(s).
- A failure is **recurring** if it appeared in at least one recent prior build.
- If history data is limited or unavailable, say "insufficient history" — do not guess.
- New failures are almost always more important than recurring ones for triage.

## Flaky test identification

- A test is flaky only if it has both passed and failed within the review window.
- A test that only fails is broken, not flaky. Do not confuse the two.
- Pass/fail alternation with no code changes between builds is the strongest flaky signal.
- Use graduated language: "likely flaky", "possibly unstable", "insufficient evidence."
- Never say "definitely flaky" unless the data is overwhelming.

## Tool usage priorities

- Prefer structured data over raw logs. Use build problems, failed tests, and test history before reaching for log excerpts.
- Use logs as supporting evidence when structured data leaves gaps (e.g., build-level failure without clear test attribution).
- Use the all-in-one context tool (`get_failed_build_analysis_context`) when you need a broad picture of a single build. Use individual tools when you need specific data.
- Do not call tools speculatively. Only fetch additional data when you have a specific question the current data cannot answer.

## Certainty and language

- Do not overstate conclusions. Use proportionate confidence.
- "This failure is likely caused by..." — only when the evidence is strong.
- "This failure may be related to..." — when there is a plausible connection but no proof.
- "No clear connection found" — when the data does not support a link. This is a valid finding.
- Never blame a specific person or commit without strong evidence. Frame as areas to investigate.

## Report quality

- Lead with the most important finding.
- Keep sections proportionate to their value. A section with nothing meaningful should be one line, not a paragraph of caveats.
- Do not repeat the same information across sections.
- Use tables for structured data, prose for analysis.
- Prefer concrete test names and error messages over vague descriptions.
- If the data is limited, say so once and move on. Do not repeatedly apologize for limited data.

## Parameterized test noise

- Parameterized tests with dynamic values in their names (timestamps, UUIDs, random data) create "rotation": TeamCity sees them as different tests each run.
- Detect rotation: if compare_builds shows hundreds of missing/new tests but both builds are green with similar test counts — this is likely rotation, not real changes.
- Use `group_by_class=true` in compare_builds to see per-class deltas instead of individual test noise.
- Rotation with balanced delta (e.g., 497 missing / 497 new) is cosmetic. Unbalanced delta (470 missing / 471 new) means either data-driven parameterization changed, or a genuinely new test appeared.
- When rotation dominates the diff, explicitly call it out so the QA engineer can distinguish noise from signal.

## Triage value

- Prioritize: new failures > recurring failures > known flaky tests.
- Prioritize: build-level errors > widespread test failures > isolated test failures.
- Prioritize: clustered failures (likely one root cause) > scattered unrelated failures.
- Always end an analysis with actionable next steps when possible.
