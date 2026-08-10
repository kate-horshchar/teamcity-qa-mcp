---
description: Identify likely flaky tests from recent build history
---

# Flaky Test Review

Review recent build history to identify likely flaky tests and distinguish them from genuinely broken tests.

Apply the shared **qa-analysis** skill throughout this analysis.

## Input

- `[LOOKBACK_BUILDS]` — optional. How many recent builds to review. Default: 10.

## Analysis steps

1. **Get recent builds.**
   Call `list_recent_builds` to get the build list within the lookback window.
   Note the total count and how many passed vs failed.

2. **Identify candidate tests.**
   A test is a candidate for flaky review if it failed in at least one build within the window.
   - For each failed build, call `get_failed_tests` to collect the set of failing test names.
   - Build a map: test name -> list of build IDs where it failed.
   - Note: if `get_failed_tests` returns tests from classes with parameterized rotation (many tests with timestamps or dynamic values in names), these may appear as "new failures" but are actually rotated test IDs. Use `get_build_tests` with `classPattern` to verify the actual pass/fail status of the underlying test method, not just the parameterized ID.

3. **Get history for candidates.**
   For each candidate test (or at least the top candidates by failure count), call `get_test_history` to get its pass/fail sequence over recent builds.

4. **Classify each candidate.**

   **Likely flaky** — the test shows clear pass/fail alternation:
   - Failed and passed multiple times within the window.
   - No consistent pattern of always-failing.
   - Especially suspicious: failed in one build, passed in the next, with no code changes between them.

   **Possibly unstable** — the test shows some instability but evidence is weaker:
   - Failed more than once but also passed, without a clear alternating pattern.
   - Started failing recently and has not yet stabilized in either direction.
   - Not enough data points to be confident.

   **Consistently broken** — the test is failing reliably, which is NOT flakiness:
   - Failed in every build (or nearly every build) within the window.
   - This suggests a real product bug or a stale test, not flakiness.

   **Insufficient data** — not enough history to classify:
   - Only one or two data points.
   - Test was added recently.

5. **Check for environmental patterns.**
   If flaky candidates share a common trait (same test class, same test tag, same type of failure — e.g., timeout, connection error), note this as a possible environmental or infrastructure factor.

6. **Summarize the flaky landscape.**
   How bad is the flaky situation? Are there many flaky tests or just a few? Is the flakiness concentrated in one area or scattered?

## Output format

Return a Markdown report with these sections:

```
## Summary
One or two sentences: how many builds reviewed, how many unique failing tests found, how many look flaky.

## Scope
- **Builds reviewed:** N
- **Build window:** <oldest build date> to <newest build date>
- **Unique failing tests found:** count

## Likely Flaky Tests
For each likely flaky test:
| Test | Failures | Passes | Pattern | Notes |
|------|----------|--------|---------|-------|
| test name | N out of M builds | N out of M builds | alternating / intermittent | e.g., "timeout-related", "no code changes between pass/fail" |

If none, say "No tests identified as likely flaky in this window."

## Possibly Unstable Tests
For each possibly unstable test:
| Test | Failures | Passes | Notes |
|------|----------|--------|-------|
| test name | N out of M | N out of M | reason for uncertainty |

If none, say "No tests flagged as possibly unstable."

## Consistently Broken Tests
Tests that fail in every (or nearly every) build — these are real failures, not flaky tests:
| Test | Failures | Passes | Since |
|------|----------|--------|-------|
| test name | N out of M | N out of M | approximate first failure |

If none, say "No consistently broken tests found."

## Environmental Patterns
Any shared traits among the flaky or unstable tests (common class, common error type, timeout patterns, etc.).
If none, say "No common environmental patterns detected."

## Summary
- Total likely flaky: N
- Total possibly unstable: N
- Total consistently broken: N
- Overall flaky burden: low / moderate / high
- Recommendation: one or two sentences on what to do (e.g., "Quarantine these 3 tests", "Investigate the timeout pattern in the payment tests", "The flaky burden is low — no action needed right now").
```

## Rules

- Do not call a test "flaky" unless it has passed AND failed within the review window. A test that only failed is broken, not flaky.
- Use graduated confidence language: "likely flaky", "possibly unstable", "insufficient evidence." Never say "definitely flaky" unless the evidence is overwhelming (many alternations, no code changes).
- If the lookback window has very few builds (< 3), warn that the analysis has low confidence and recommend a larger window.
- Do not call `get_failed_build_analysis_context` for every build. Use `get_failed_tests` and `get_test_history` — they are more appropriate for this analysis.
- If there are many candidate tests (> 20), focus on the top 20 by failure frequency and note that more exist.
