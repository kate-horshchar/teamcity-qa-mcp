<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/analyze-failed-build.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

# Analyze Failed Build

Perform a practical QA triage of a failed TeamCity build.

Apply the shared **qa-analysis** skill throughout this analysis.

## Input

- `[BUILD_ID]` — optional. A specific build ID to analyze.

## Resolving the target build

- If `[BUILD_ID]` is provided, use that build.
- If not provided:
  1. Call `list_recent_builds` to find recent builds.
  2. Pick the most relevant recent failed build (prefer the latest failure, but skip builds that are still running).
  3. If no failed builds exist in the recent window, say so and stop.

## Analysis steps

1. **Start with the all-in-one context tool.**
   Call `get_failed_build_analysis_context` for the target build. This returns build info, problems, failed tests, log tail, changes, and limited test history in one call.

2. **Assess whether you need to drill deeper.**
   Only make additional calls if the all-in-one context is insufficient:
   - If failure clusters are unclear, call `cluster_build_failures`.
   - If a specific test failure needs more detail (e.g., full stack trace), call `get_test_failure_details` for that test.
   - If you need to determine whether a failure is new or recurring and the included history is not enough, call `get_test_history` for the specific test.
   - If the log excerpt is too short to understand a build-level problem, call `get_build_log_excerpt` with a targeted `pattern` (e.g., the exception class name or error keyword from the failure cluster) to search the full log, instead of relying only on the tail excerpt.
   Do not call tools speculatively. Only drill down when the initial context leaves a clear gap.

3. **Classify each failure group.**
   - Group failures by likely root cause (shared exception, shared test class/suite, shared infrastructure symptom).
   - For each group, note: how many tests, representative test name, exception type or error summary.

4. **Determine new vs recurring.**
   - A failure is "new" if it was not present in the immediately preceding builds.
   - A failure is "recurring" if it appeared in recent builds too.
   - If history data is limited, say "insufficient history" rather than guessing.

5. **Flag flaky suspicion.**
   - If a test has recent pass/fail alternation in its history, flag it as "possibly flaky."
   - Do not call a test flaky just because it failed once.

6. **Review recent changes.**
   - Summarize what code changes were included in this build (from the all-in-one context or `get_build_changes`).
   - Note which change areas might relate to the failures, but do not overclaim causation.

7. **Determine investigation priorities.**
   - Rank what the QA engineer should check first based on: new failures before recurring ones, build-level errors before individual test failures, clustered failures before isolated ones.

## Output format

Return a Markdown report with these sections:

```
## Summary
One-paragraph plain-language summary: what build, how many failures, overall severity, key finding.

## Build Overview
| Field | Value |
|-------|-------|
| Build ID | ... |
| Status | ... |
| Build Number | ... |
| Branch | ... |
| Started / Finished | ... |
| Total Tests | ... |
| Failed | ... |
| Passed | ... |

## Failure Groups
For each root-cause cluster:
### Group N: <short label>
- **Tests affected:** count
- **Representative test:** name
- **Error pattern:** one-line summary
- **New or recurring:** new / recurring / unknown
- **Flaky suspicion:** yes (reason) / no / insufficient data

## New vs Known Failures
Brief summary of how many failures are new, how many are recurring, how many are unclear.

## Flaky Signals
List any tests with pass/fail alternation or other flaky indicators.
If none, say "No flaky signals detected in available history."

## Recent Changes
List the changes included in this build (author, description, affected paths if available).
Note any plausible connections to failure areas. Do not speculate beyond what the data supports.

## What to Check First
Numbered list of practical next steps, ordered by priority.
Keep it actionable: "Check X", "Verify Y", "Compare with Z".
```

## Rules

- Do not pad the report with filler. If a section has nothing meaningful, write one line and move on.
- Do not repeat the same failure details in multiple sections.
- Keep the summary honest. If the data is limited, say so.
- If the build actually passed, say "This build passed — no failures to analyze" and include only the Build Overview section.

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
