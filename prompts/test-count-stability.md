<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/test-count-stability.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

# Test Count Stability

Analyze why test counts vary across recent successful builds.
Identify parameterized test rotation, real test additions/removals,
and ignored test changes.

Apply the shared **qa-analysis** skill throughout this analysis.

## Input

- `[LOOKBACK_BUILDS]` — optional. How many recent builds to review. Default: 10.

## Analysis steps

1. **Get recent builds.**
   Call `list_recent_builds`. Filter to SUCCESS builds only.
   If fewer than 2 successful builds exist, say so and stop.

2. **Build the test count trend.**
   For each successful build, note: build ID, build number, date,
   passed, failed, ignored, total.
   Flag any builds where total differs from the majority.

3. **Compare adjacent builds with different counts.**
   For each pair of adjacent green builds where test counts differ,
   call `compare_builds` with `group_by_class=true`.

4. **Classify the differences per class.**
   For each class in the grouped diff:

   - **Parameterized rotation:** class has hundreds of missing/new,
     names contain timestamps/UUIDs/random values, delta is balanced
     or near-balanced. This is cosmetic noise.
   - **Real test additions:** new test methods or new test classes
     that weren't in the previous build.
   - **Real test removals:** test methods or classes that disappeared.
   - **Ignored changes:** tests that moved between active and ignored.

5. **Assess rotation stability.**
   For parameterized rotation classes, check:
   - Is the rotation delta always balanced (0) across all pairs?
   - Or does it drift (+1, -2, etc.)? Drifting means the
     parameterization is data-driven and non-deterministic.

6. **Cross-validate with get_green_build_diff_context.**
   If available, use this tool for the pair with the largest
   count difference to get a comprehensive view including
   changes and neighboring build context.

## Output format

Return a Markdown report with these sections:

```
## Summary
One-paragraph overview: how stable are test counts,
are there real changes or just rotation noise.

## Test Count Trend
| Build | Date | Passed | Ignored | Total | Delta vs prev |
|-------|------|--------|---------|-------|---------------|
| ...   | ...  | ...    | ...     | ...   | ...           |

## Parameterized Rotation
Classes with rotating parameterized tests:
| Class | Avg missing/new per build pair | Avg delta | Stable? |
|-------|-------------------------------|-----------|---------|
| ...   | ...                           | ...       | yes/no  |

For each class: brief description of what rotates
(timestamps, data-driven params, etc.)

## Real Test Changes
Tests that genuinely appeared or disappeared
(not part of rotation). Per build pair.
If none: "All count differences are explained by
parameterized rotation."

## Recommendations
- Which test classes need deterministic parameterization
- Whether count instability is a concern or cosmetic
- Specific suggestions (fix timestamps in names,
  pin test data source, etc.)
```

## Rules

- Focus on explaining the "why" behind count differences, not just listing them.
- Parameterized rotation is common and cosmetic — don't alarm. But unbalanced rotation (consistent drift) is worth flagging.
- If all count differences are explained by rotation, say so clearly and keep the report short.
- If there are real test additions/removals, those are the important finding — highlight them.

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
