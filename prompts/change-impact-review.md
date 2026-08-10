<!--
  GENERATED FILE — do not edit. Source of truth: plugin/commands/change-impact-review.md
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

# Change Impact Review

Review whether recent code changes may be related to failures in a TeamCity build.

Apply the shared **qa-analysis** skill throughout this analysis.

## Input

- `[BUILD_ID]` — optional. A specific failed build to review. If not provided, use the most relevant recent failed build.

## Resolving the target build

- If `[BUILD_ID]` is provided, use that build.
- If not provided:
  1. Call `list_recent_builds`.
  2. Pick the most recent failed build.
  3. If no failed builds exist, say "No recent failed builds found — nothing to review" and stop.

## Analysis steps

1. **Get build context.**
   Call `get_failed_build_analysis_context` for the target build. This gives you build info, failures, and changes in one call.

2. **Understand the failures.**
   From the context, identify:
   - The main failure groups (by error pattern, test class, or exception type).
   - Which test areas are affected (package names, test suite names, functional areas).

3. **Review the changes.**
   From the context (or via `get_build_changes` if needed), identify:
   - Each change: author, commit message, affected files/paths.
   - The scope of each change: what part of the system was modified.

4. **Look for connections.**
   For each change, consider:
   - Does the modified code area overlap with the areas where tests are failing?
   - Does the commit message mention anything related to the failing functionality?
   - Is the change in a shared component (utility, config, base class) that could affect multiple test areas?
   - Is the change in test infrastructure (test helpers, fixtures, setup) that could cause test failures?

   Rate each potential connection:
   - **Plausible** — the change area overlaps with the failure area.
   - **Possible** — the change is in a shared area that could indirectly affect the failures.
   - **Unlikely** — no clear relationship visible.

   Do NOT claim a change caused a failure unless the overlap is obvious. Use careful language:
   - "This change touches the same module where tests are failing"
   - "This change modified shared test infrastructure, which could affect these tests"
   - "No clear connection between this change and the observed failures"

5. **Identify risk areas.**
   Note any changes that are inherently higher-risk regardless of current failures:
   - Changes to build configuration or CI scripts.
   - Changes to dependency versions.
   - Changes to shared utilities or base classes.
   - Large changesets touching many files.

6. **Suggest concrete next checks.**
   Based on the connections found, suggest what the engineer should verify.

## Output format

Return a Markdown report with these sections:

```
## Summary
One-paragraph overview: what build, how many changes, how many failures, whether any connections were found.

## Build Summary
| Field | Value |
|-------|-------|
| Build ID | ... |
| Status | ... |
| Failed Tests | ... |
| Changes Included | ... |

## Recent Changes
For each change:
### <author>: <short commit message>
- **Files changed:** list or summary of affected paths
- **Scope:** what area of the system this touches

## Failure Context
Brief summary of the failure groups (reference, don't repeat the full triage — that's what analyze-failed-build is for).

## Possible Change-to-Failure Connections
For each plausible or possible connection:
- **Change:** <short description>
- **Failure area:** <which tests or failure group>
- **Connection strength:** Plausible / Possible
- **Reasoning:** one sentence explaining why

If no connections are found, say "No clear connections found between the included changes and the observed failures."

## Risk Notes
Any changes that are higher-risk regardless of current failures (shared code, config, dependencies, large scope).
If nothing stands out, say "No elevated-risk changes noted."

## Suggested Next Checks
Numbered list of practical verification steps.
Examples:
- "Review <specific change> and check if it affects <specific test area>"
- "Run <specific test suite> locally against the change"
- "Compare this build's failures with the previous build to confirm these are new"
```

## Rules

- This is a correlation report, not a blame report. Use cautious language about causation.
- Do not speculate beyond what the data shows. "No clear connection" is a valid and useful finding.
- Keep the failure context section brief — just enough to frame the changes against. The user can run `analyze-failed-build` for the full triage.
- If the build has no changes (e.g., a retry of the same commit), say so and suggest checking environment or infrastructure factors instead.

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
