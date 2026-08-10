---
name: html-report
description: >
  This skill should be used when the user asks to "generate an HTML report",
  "build health report", "daily report", "shareable report", or when any
  command or scheduled task needs to render TeamCity build-health data as an
  HTML file. Defines the report structure, health badge rules, and the
  self-contained HTML requirement.
version: 1.0.0
---

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
