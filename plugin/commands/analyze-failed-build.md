---
description: Triage a failed build with root-cause grouping and investigation priorities
---

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
