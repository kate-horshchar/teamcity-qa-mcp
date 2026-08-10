---
description: Compare two builds to find regressions and resolved tests
---

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
