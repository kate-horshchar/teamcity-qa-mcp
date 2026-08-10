---
description: Summarize recent build health for a given time window
---

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
