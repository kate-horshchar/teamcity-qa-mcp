<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/flaky-test-review.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

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
