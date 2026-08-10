<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/recent-builds-summary.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

# Recent Builds Summary

Summarize the recent TeamCity build history for a practical QA health check.

Apply the shared **qa-analysis** skill throughout this analysis.

## Input

- `[LOOKBACK_HOURS]` — optional. How many hours back to look. Default: 24.

## Important context

This plugin may be used in environments with only 1-2 long-running test builds per day. Do not assume a high-frequency CI pipeline. A small number of builds in the window is normal, not an error.

## Analysis steps

1. **Get recent builds.**
   Call `list_recent_builds`. Filter to builds that started within the requested time window.
   If no builds fall within the window, say so and stop.

2. **Summarize each build briefly.**
   For each build in the window, note: build ID, status, build number, start time, and test counts if available.
   For failed builds, call `get_build_summary` if you need more detail.

3. **Identify notable failures.**
   For each failed build in the window:
   - Call `get_build_problems` and/or `get_failed_tests` to understand what failed.
   - Group failures briefly — you don't need full root-cause analysis here, just enough to describe the failure shape.

4. **Spot patterns across builds.**
   - Are the same tests failing across multiple builds? Flag as recurring.
   - Is there a test that passed in one build and failed in another within this window? Flag as potentially flaky.
   - Are failures growing, shrinking, or stable across the window?

5. **Assess overall health.**
   - What fraction of builds passed vs failed?
   - Is the failure trend getting worse, stable, or improving?
   - Are there any build-level (infrastructure) problems vs test-level failures?

## Output format

Return a Markdown report with these sections:

```
## Summary
One or two sentences: how many builds in the window, pass/fail ratio, overall health assessment.

## Time Window
- **Requested:** last N hours
- **Actual range:** <earliest build time> to <latest build time>
- **Builds found:** count

## Builds Reviewed

| # | Build ID | Status | Build Number | Started | Failed Tests |
|---|----------|--------|--------------|---------|--------------|
| 1 | ...      | ...    | ...          | ...     | ...          |

## Notable Failures
For each failed build, a brief description:
### Build <ID>: <short label>
- **Failed tests:** count
- **Main failure areas:** one-line summary of the dominant failure groups
- **Build-level problems:** if any (compilation errors, infrastructure issues, etc.)

## Recurring vs New Patterns
- Which failures appeared in multiple builds within this window?
- Which failures are new (appeared only in the latest build)?
- If the window contains only one build, skip cross-build comparison and say so.

## Potential Flaky Signals
List tests that show pass/fail inconsistency within this window.
If the window has too few builds to judge flakiness, say "Not enough builds in this window to assess flakiness."

## Key Takeaways
2-4 bullet points: the most important things a QA engineer should know from this window.
Focus on what changed, what is broken, and what needs attention.
```

## Rules

- If only one build exists in the window, produce a shorter report — skip cross-build sections and focus on that build's status.
- Do not call `get_failed_build_analysis_context` for every build — that's too heavy for a summary. Use lighter tools.
- Keep the report concise. This is a health check, not a deep dive.
- If all builds passed, say so clearly and keep the report short.

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
