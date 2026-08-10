---
description: Analyze test count stability across recent green builds
---

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
