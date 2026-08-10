// ── Multi-Config Aggregation ────────────────────────────────────────
//
// Pure functions behind get_multi_config_failure_summary: time window
// math, per-config result aggregation, cross-config root-cause
// clustering, and new-failure diffing. No I/O here — everything is
// unit-testable without a TeamCity instance.

import type { BuildCard } from "../schemas/build.js";
import type { FailureCluster } from "./matching.js";

// ── Time window ─────────────────────────────────────────────────────

/**
 * Format a date as a TeamCity locator timestamp: yyyyMMddTHHmmss+ZZZZ.
 * Always rendered in UTC (+0000) to avoid local-timezone ambiguity.
 */
export function toTeamCityDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}+0000`
  );
}

/** Start of an analysis window that reaches sinceHours back from now. */
export function windowStart(sinceHours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - sinceHours * 60 * 60 * 1000);
}

// ── Per-config result shape ─────────────────────────────────────────

export interface BuildWindowCounts {
  total: number;
  passed: number;
  failed: number;
  running: number;
}

export interface ConfigFailureSummary {
  buildTypeId: string;
  name?: string;
  /**
   * Counts of builds within the analysis window. The full per-build list is
   * intentionally omitted to keep project-wide responses compact; fetch it
   * for a single configuration with list_recent_builds when needed.
   */
  buildsInWindow: BuildWindowCounts;
  latestBuild?: { buildId: number; buildNumber: string; status: string };
  /** Failed test count of the most recent failed build in the window (0 when none). */
  failedTestCount: number;
  /** Top root-cause clusters of the most recent failed build. */
  topClusters: FailureCluster[];
  /** Only present when newFailuresOnly was requested and a baseline build existed. */
  newFailures?: string[];
  /** Set when analysis of this configuration failed; other fields are empty. */
  error?: string;
}

// ── Aggregation ─────────────────────────────────────────────────────

export interface MultiConfigCounts {
  configsAnalyzed: number;
  configsWithFailures: number;
  configsWithErrors: number;
  totalBuilds: number;
  failedBuilds: number;
  successfulBuilds: number;
  runningBuilds: number;
  totalFailedTests: number;
}

export function isFailedStatus(status: string): boolean {
  return status === "FAILURE" || status === "ERROR";
}

/** Summarize a config's builds in the window into compact counts. */
export function countBuildsInWindow(builds: BuildCard[]): BuildWindowCounts {
  const counts: BuildWindowCounts = { total: builds.length, passed: 0, failed: 0, running: 0 };
  for (const build of builds) {
    if (build.state === "running") {
      counts.running += 1;
    } else if (isFailedStatus(build.status)) {
      counts.failed += 1;
    } else if (build.status === "SUCCESS") {
      counts.passed += 1;
    }
  }
  return counts;
}

export function aggregateConfigResults(perConfig: ConfigFailureSummary[]): MultiConfigCounts {
  const counts: MultiConfigCounts = {
    configsAnalyzed: perConfig.length,
    configsWithFailures: 0,
    configsWithErrors: 0,
    totalBuilds: 0,
    failedBuilds: 0,
    successfulBuilds: 0,
    runningBuilds: 0,
    totalFailedTests: 0,
  };

  for (const result of perConfig) {
    if (result.error) {
      counts.configsWithErrors += 1;
      continue;
    }
    const w = result.buildsInWindow;
    counts.totalBuilds += w.total;
    counts.failedBuilds += w.failed;
    counts.successfulBuilds += w.passed;
    counts.runningBuilds += w.running;
    counts.totalFailedTests += result.failedTestCount;
    if (result.failedTestCount > 0 || w.failed > 0) {
      counts.configsWithFailures += 1;
    }
  }

  return counts;
}

// ── Cross-config clustering ─────────────────────────────────────────

export interface CrossConfigCluster {
  rootCause: string;
  exceptionType: string | null;
  configCount: number;
  buildTypeIds: string[];
  totalTests: number;
}

/**
 * Find root causes that appear in two or more configurations — the same
 * failure hitting several configs at once is a strong infrastructure
 * signal. Clusters are matched by exception type when present, otherwise
 * by the exact root-cause line.
 */
export function findCrossConfigClusters(perConfig: ConfigFailureSummary[]): CrossConfigCluster[] {
  const byKey = new Map<string, CrossConfigCluster & { configs: Set<string> }>();

  for (const result of perConfig) {
    if (result.error) continue;
    for (const cluster of result.topClusters) {
      const key = cluster.exceptionType ?? cluster.rootCause;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          rootCause: cluster.rootCause,
          exceptionType: cluster.exceptionType,
          configCount: 0,
          buildTypeIds: [],
          totalTests: 0,
          configs: new Set<string>(),
        };
        byKey.set(key, entry);
      }
      if (!entry.configs.has(result.buildTypeId)) {
        entry.configs.add(result.buildTypeId);
        entry.buildTypeIds.push(result.buildTypeId);
      }
      entry.totalTests += cluster.count;
    }
  }

  return [...byKey.values()]
    .filter((entry) => entry.configs.size >= 2)
    .map(({ configs, ...cluster }) => ({ ...cluster, configCount: configs.size }))
    .sort((a, b) => b.configCount - a.configCount || b.totalTests - a.totalTests);
}

// ── New-failure diffing ─────────────────────────────────────────────

/** Test names failing now that were not failing in the baseline build. */
export function diffFailedTestNames(current: string[], previous: string[]): string[] {
  const baseline = new Set(previous);
  return current.filter((name) => !baseline.has(name));
}

// ── Sorting ─────────────────────────────────────────────────────────

/**
 * Sort build cards newest-first by startDate. TeamCity timestamps
 * (yyyyMMddTHHmmss+ZZZZ) sort correctly as strings within one server
 * timezone. Builds without a startDate go last.
 */
export function sortBuildCardsByStartDateDesc(cards: BuildCard[]): BuildCard[] {
  return [...cards].sort((a, b) => {
    if (!a.startDate && !b.startDate) return 0;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return b.startDate.localeCompare(a.startDate);
  });
}
