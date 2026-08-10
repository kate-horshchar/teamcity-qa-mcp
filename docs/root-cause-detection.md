# Root cause detection

How an AI client tells apart the three classic reasons a test goes red —
**code change**, **flaky test**, **infrastructure** — using this server's data.

The honest division of labor: **the server retrieves and structures the
evidence; the AI weighs it.** There is no classifier inside the server, no
scoring model, no magic — which is exactly why the reasoning is transparent
and can be audited by reading the tool responses.

## The evidence each tool contributes

| Signal | Tool(s) | Points to |
|---|---|---|
| Failure clusters (one error, many tests) | `cluster_build_failures`, `get_failed_build_analysis_context` | one shared root cause rather than N independent bugs |
| Commits in the failing build, changed files vs failing test areas | `get_build_changes`, `get_failed_build_analysis_context` | **code change** |
| Diff against the previous green build (new vs persistent failures) | `compare_builds`, `get_failed_build_analysis_context` | **code change** (new failures follow changes) |
| Pass/fail alternation of one test over time, with no related changes | `get_test_history` | **flaky test** |
| Same error signature across past builds (firstSeen/lastSeen) | `find_failure_across_builds` | recurring issue vs fresh regression |
| Error signatures: timeout, connection refused, 5xx, OOM | failure details from any tool | **infrastructure** |
| Same root cause hitting several build configurations at once | `get_multi_config_failure_summary` (cross-config clusters) | **infrastructure** (independent test suites rarely break identically) |
| Build-level problems (compilation, agent, artifact) | `get_build_problems` | **infrastructure** / toolchain |

## Typical reasoning chains

**Code change.** A build goes red with 12 new failures, all in one package.
`get_failed_build_analysis_context` shows a commit touching that same package,
and `comparisonWithPreviousGreen` confirms the failures are new. The AI
reports the suspicious change (neutrally — an area to investigate, not an
accusation) with the commit and author from `get_build_changes`.

**Flaky test.** One test failed; `get_test_history` shows pass-fail-pass-fail
over the last 15 runs while `get_build_changes` shows unrelated commits.
The qa-analysis skill's language rules apply: "likely flaky", never
"definitely flaky" without overwhelming evidence — and a test that *only*
fails is broken, not flaky.

**Infrastructure.** 43 tests fail across three different test suites;
`cluster_build_failures` collapses them into one cluster:
`SocketTimeoutException` against the same host. `find_failure_across_builds`
shows the pattern started two builds ago; `get_multi_config_failure_summary`
shows the same cluster in other configurations of the project. No code change
can plausibly explain synchronized timeouts across independent suites.

## Practical notes

- Prefer the one-call contexts (`get_failed_build_analysis_context`,
  `get_multi_config_failure_summary`) first; drill down with narrow tools only
  when a specific question remains. This keeps token usage and API load low.
- Parameterized tests with dynamic names (timestamps, UUIDs) create noise in
  diffs — "497 missing / 497 new" between two green builds is rotation, not
  change. `compare_builds` with `group_by_class=true` reveals it.
- "Insufficient history" is a valid conclusion. The plugin's qa-analysis skill
  explicitly instructs the AI to say so rather than guess.
