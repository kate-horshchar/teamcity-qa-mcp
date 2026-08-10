<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/build-comparison-report.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

# Build Comparison Report

Compare two TeamCity builds in a practical QA-focused way.

Apply the shared **qa-analysis** skill throughout this analysis.

## Inputs

- `[COMPARE_MODE]` — required. One of:
  - `failed_vs_previous_green` — compare a recent failed build against the last successful build before it.
  - `failed_vs_previous_failed` — compare the latest failed build against the previous failed build.
  - `green_vs_green` — compare two successful builds (e.g., to investigate test count differences).
  - `custom` — compare two explicitly specified builds.
- `[BUILD_ID_A]` — required only for `custom` and `green_vs_green` modes. The first build (typically the older or baseline build).
- `[BUILD_ID_B]` — required only for `custom` and `green_vs_green` modes. The second build (typically the newer build).

## Resolving the builds

### Mode: `failed_vs_previous_green`
1. Call `list_recent_builds`.
2. Find the most recent failed build — this is Build B.
3. Find the most recent successful build before Build B — this is Build A.
4. If no successful build is found in the recent history, say so and produce a partial report using only Build B.

### Mode: `failed_vs_previous_failed`
1. Call `list_recent_builds`.
2. Find the two most recent failed builds. The older one is Build A, the newer one is Build B.
3. If fewer than two failed builds exist, say so and stop.

### Mode: `green_vs_green`
1. Use `[BUILD_ID_A]` as Build A and `[BUILD_ID_B]` as Build B.
2. If either ID is missing, call `list_recent_builds`, filter to SUCCESS, and pick the two most recent.
3. Verify both builds are SUCCESS. If not, warn the user and suggest `custom` mode instead.

### Mode: `custom`
1. Use `[BUILD_ID_A]` as Build A and `[BUILD_ID_B]` as Build B.
2. If either ID is missing, ask the user for it.

## Analysis steps

0. **Detect comparison type.**
   After resolving both builds, check their statuses.
   - If both builds are SUCCESS — switch to Green vs Green flow (step 1a).
   - Otherwise — continue with the existing flow (step 1).

1. **Get comparison data.**
   Call `compare_builds` with both build IDs. This returns test-level differences (new failures, resolved tests, common failures).
   If the diff shows > 50 missing or new tests, re-call with `group_by_class=true` to aggregate noise and reveal the real signal.

2. **Get build summaries.**
   Call `get_build_summary` for both builds to get status, test counts, and basic metadata.

3. **Understand failure groups if needed.**
   If Build B has failures, call `get_build_problems` or `get_failed_tests` for Build B to understand the failure shape.
   Only do this if the comparison data alone is not enough to describe the differences clearly.

4. **Review changes between builds.**
   Call `get_build_changes` for Build B to see what code changed since Build A.
   If both builds are failures, optionally call `get_build_changes` for Build A too to see if the change sets differ significantly.

5. **Classify the differences.**
   - **Newly failed:** tests that passed in Build A but failed in Build B. These are the most important — they likely relate to recent changes.
   - **Resolved:** tests that failed in Build A but passed in Build B. Good news — note them briefly.
   - **Still failing:** tests that failed in both builds. These are pre-existing. Mention the count, but don't deep-dive unless the error changed.
   - **Failure group changes:** did the dominant failure clusters change between builds? New cluster appearing? Old cluster disappearing?

6. **Cross-build validation (if diff contains many missing/new tests).**
   If missingTests + newTests > 50, compare Build A with the build before it (A-1) using `compare_builds` with `group_by_class=true`. This reveals whether the missing/new volume is normal rotation or an anomaly specific to this pair of builds.

---

### Green vs Green flow

1a. **Green vs Green comparison.**
    Call `get_green_build_diff_context` with both build IDs and `include_neighboring=true`. This returns grouped diff by class, changes for both builds, and neighboring build context for cross-validation.
    Skip steps 3-5 (failure-focused) and go to step 5a.

2a. **Get build summaries.**
    Call `get_build_summary` for both builds if the green-build context does not already include this data.

5a. **Classify green vs green differences.**
    - **Parameterized rotation:** hundreds of missing/new in the same class, balanced or near-balanced delta. This is noise — note it but don't alarm.
    - **Real test additions/removals:** tests in new classes or entirely new test methods that weren't in the baseline build.
    - **Ignored changes:** tests that moved between active and ignored.
    - **Cross-build validation:** if the same rotation volume appears between neighboring builds, it's normal. If this pair is anomalous, flag it.

## Output format

Return a Markdown report with these sections:

### For failure comparisons (standard flow)

```
## Summary
One-paragraph overview: what was compared, what is the main finding (regression, improvement, or stable).

## Compared Builds

| Field | Build A | Build B |
|-------|---------|---------|
| Build ID | ... | ... |
| Status | ... | ... |
| Build Number | ... | ... |
| Started | ... | ... |
| Total Tests | ... | ... |
| Failed | ... | ... |
| Passed | ... | ... |

## Main Differences
High-level: how many tests newly failed, how many resolved, how many still failing.
One-sentence assessment of the direction (getting worse / improving / sideways).

## Newly Failed Tests
List of tests that failed in Build B but not in Build A.
For each: test name, error summary (one line).
If more than 15, show the top 15 and note the remainder count.

## Resolved Tests
List of tests that failed in Build A but passed in Build B.
If more than 15, show the top 15 and note the remainder.
If none, say "No tests were resolved between these builds."

## Failure Group Changes
How did the failure clusters shift?
- New failure groups in Build B
- Failure groups that disappeared (resolved)
- Groups that persisted but changed in size

## Changes Between Builds
Summarize code changes included in Build B (or between both builds).
Note any plausible connections to the newly failed tests.

## Summary
2-3 bullet points: the key takeaways for the QA engineer.
Is this a regression? An improvement? A lateral shift?
What should be investigated?
```

### For green vs green comparisons

```
## Summary
One-paragraph overview: what was compared, what is the main finding.

## Compared Builds

| Field | Build A | Build B |
|-------|---------|---------|
| Build ID | ... | ... |
| Status | ... | ... |
| Build Number | ... | ... |
| Started | ... | ... |
| Total Tests | ... | ... |
| Passed | ... | ... |
| Ignored | ... | ... |

## Test Count Changes
| Metric | Build A | Build B | Delta |
|--------|---------|---------|-------|
| Passed | ... | ... | ... |
| Ignored | ... | ... | ... |
| Total | ... | ... | ... |

## Parameterized Test Rotation (if detected)
Which test classes have rotating parameterized tests.
Per-class: how many missing, how many new, net delta.
Whether rotation is balanced (noise) or unbalanced (real change).

## Stable Differences
Tests that genuinely appeared or disappeared
(not part of parameterized rotation).
If none, say "No real test changes between these builds."

## Changes Between Builds
Summarize code changes for both builds.
Note whether any changes could explain test count differences.

## Summary
2-3 bullet points: the key takeaways.
Is the count difference explained by rotation, real changes, or both?
Any action needed?
```

## Rules

- The most important section is **Newly Failed Tests** (failure flow) or **Stable Differences** (green vs green flow). Prioritize clarity there.
- Do not dump raw test lists without context. Always include at least a one-line error summary per test.
- If the builds are identical in results, say "No meaningful differences found" and keep the report short.
- For `custom` mode, do not assume which build is "better" — just report the differences directionally (A to B).
- When rotation dominates the diff in green vs green, explicitly call it out so the QA engineer can distinguish noise from signal.

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
