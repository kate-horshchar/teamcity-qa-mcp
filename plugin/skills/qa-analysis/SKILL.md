---
name: qa-analysis
description: >
  This skill should be used when the user asks about "build failures",
  "test triage", "QA analysis", "flaky tests", "build health",
  "failure grouping", "root cause analysis", or needs guidance on
  TeamCity build analysis, failure classification, or test stability assessment.
version: 1.0.0
---

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
