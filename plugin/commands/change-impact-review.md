---
description: Review whether recent code changes relate to build failures
---

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
