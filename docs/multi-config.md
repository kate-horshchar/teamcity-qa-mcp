# Multi-config analysis

Analyzing one build configuration is the default mode. This page covers the
flexible-target tools: a **list of configurations** or a **whole project**
analyzed together, with one aggregated summary.

## Targets

Tools that accept a target take **at most one** of:

| Parameter | Meaning | Example |
|---|---|---|
| `buildTypeId` | one build configuration | `"Shop_ApiTests"` |
| `buildTypeIds` | an explicit list | `["Shop_ApiTests", "Shop_UiTests"]` |
| `projectId` | a whole project, **including nested subprojects** | `"Shop"` |
| *(none)* | the configured `TEAMCITY_BUILD_TYPE_ID` | — |

Supported by `get_multi_config_failure_summary`, `list_recent_builds`, and
`find_failure_across_builds`. Project expansion uses TeamCity's
`affectedProject` locator, so configurations of sub-subprojects are included;
use `list_project_build_configs` to preview what a project resolves to.

## The aggregator: get_multi_config_failure_summary

One call returns three layers:

1. **`summary`** — totals across the target: builds, failed/successful/running,
   failed tests, configurations with failures, and **`crossConfigClusters`** —
   root causes that hit two or more configurations at once. Independent test
   suites rarely break identically, so a cross-config cluster is a strong
   infrastructure signal (see [root cause detection](root-cause-detection.md)).
2. **`perConfig`** — per-configuration breakdown: compact `buildsInWindow`
   counts (total/passed/failed/running), latest build status, failed test
   count, top-5 root-cause clusters. The full per-build list is intentionally
   omitted to keep project-wide responses compact — fetch it for a single
   configuration with `list_recent_builds`. An error in one configuration
   (missing permissions, deleted config) lands in that entry's `error` field
   and never fails the rest.
3. **`target` + `window`** — what was actually analyzed: resolved configuration
   IDs and the exact time window, so the report is self-describing.

## Cost controls

Analyzing a 50-config project could mean hundreds of API calls and an
unreadable response. The aggregator keeps both bounded, and every limit is an
explicit, overridable parameter:

| Parameter | Default | Effect |
|---|---|---|
| `sinceHours` | 24 | only builds started within the window are considered |
| `maxBuildsPerConfig` | 10 | cap on builds fetched per configuration |
| `newFailuresOnly` | false | cluster only tests that were NOT failing in the previous build of that configuration |

Additional built-in behavior: failed-test details are fetched **only for the
most recent failed build** of each configuration (one extra call when
`newFailuresOnly` needs a baseline), and responses contain clusters, not raw
test lists. `failedTestCount` and clusters therefore describe the latest red
build per configuration — older builds in the window contribute status counts
only.

## Examples

Health of a whole project over the default 24 hours:

```json
{ "projectId": "Shop" }
```

Two related suites, three days back, regressions only:

```json
{ "buildTypeIds": ["Shop_ApiTests", "Shop_UiTests"], "sinceHours": 72, "newFailuresOnly": true }
```

A worked end-to-end scenario with responses lives in
[examples/multi-config-summary.md](../examples/multi-config-summary.md), and
`/generate-report` in the [plugin](cowork-plugin.md) turns the same call into
a self-contained HTML health report.
