import { describe, it, expect } from "vitest";
import type { BuildCard } from "../schemas/build.js";
import {
  toTeamCityDate,
  windowStart,
  isFailedStatus,
  aggregateConfigResults,
  findCrossConfigClusters,
  diffFailedTestNames,
  sortBuildCardsByStartDateDesc,
  type ConfigFailureSummary,
} from "./multi-config-aggregation.js";

// ── Helpers ──────────────────────────────────────────────────────────

function build(overrides: Partial<BuildCard>): BuildCard {
  return {
    buildId: 1,
    buildNumber: "1",
    status: "SUCCESS",
    state: "finished",
    ...overrides,
  };
}

function configResult(overrides: Partial<ConfigFailureSummary>): ConfigFailureSummary {
  return {
    buildTypeId: "Cfg",
    builds: [],
    failedTestCount: 0,
    topClusters: [],
    ...overrides,
  };
}

// ── Time window ──────────────────────────────────────────────────────

describe("toTeamCityDate", () => {
  it("formats as yyyyMMddTHHmmss+0000 in UTC", () => {
    expect(toTeamCityDate(new Date(Date.UTC(2026, 6, 7, 9, 5, 3)))).toBe("20260707T090503+0000");
  });

  it("pads single-digit components", () => {
    expect(toTeamCityDate(new Date(Date.UTC(2026, 0, 1, 0, 0, 0)))).toBe("20260101T000000+0000");
  });
});

describe("windowStart", () => {
  it("subtracts the window from now", () => {
    const now = new Date(Date.UTC(2026, 6, 7, 12, 0, 0));
    expect(windowStart(24, now).toISOString()).toBe("2026-07-06T12:00:00.000Z");
    expect(windowStart(1, now).toISOString()).toBe("2026-07-07T11:00:00.000Z");
  });
});

// ── Aggregation ──────────────────────────────────────────────────────

describe("isFailedStatus", () => {
  it("treats FAILURE and ERROR as failed, everything else as not", () => {
    expect(isFailedStatus("FAILURE")).toBe(true);
    expect(isFailedStatus("ERROR")).toBe(true);
    expect(isFailedStatus("SUCCESS")).toBe(false);
    expect(isFailedStatus("UNKNOWN")).toBe(false);
  });
});

describe("aggregateConfigResults", () => {
  it("aggregates counts across configs", () => {
    const counts = aggregateConfigResults([
      configResult({
        buildTypeId: "Cfg_A",
        builds: [
          build({ buildId: 1, status: "FAILURE" }),
          build({ buildId: 2, status: "SUCCESS" }),
        ],
        failedTestCount: 7,
      }),
      configResult({
        buildTypeId: "Cfg_B",
        builds: [
          build({ buildId: 3, status: "SUCCESS" }),
          build({ buildId: 4, status: "SUCCESS", state: "running" }),
        ],
      }),
    ]);

    expect(counts).toEqual({
      configsAnalyzed: 2,
      configsWithFailures: 1,
      configsWithErrors: 0,
      totalBuilds: 4,
      failedBuilds: 1,
      successfulBuilds: 2,
      runningBuilds: 1,
      totalFailedTests: 7,
    });
  });

  it("isolates config errors from build counts", () => {
    const counts = aggregateConfigResults([
      configResult({ buildTypeId: "Cfg_A", error: "TeamCity API error: 404 Not Found" }),
      configResult({ buildTypeId: "Cfg_B", builds: [build({ buildId: 1 })] }),
    ]);

    expect(counts.configsWithErrors).toBe(1);
    expect(counts.configsAnalyzed).toBe(2);
    expect(counts.totalBuilds).toBe(1);
    expect(counts.configsWithFailures).toBe(0);
  });

  it("counts a config as failing when its window has failed builds even without test details", () => {
    const counts = aggregateConfigResults([
      configResult({
        buildTypeId: "Cfg_A",
        builds: [build({ buildId: 1, status: "ERROR" })],
        failedTestCount: 0,
      }),
    ]);
    expect(counts.configsWithFailures).toBe(1);
  });
});

// ── Cross-config clustering ──────────────────────────────────────────

describe("findCrossConfigClusters", () => {
  const timeoutCluster = {
    rootCause: "java.net.SocketTimeoutException: connect timed out",
    exceptionType: "SocketTimeoutException",
    count: 5,
    testNames: ["t1"],
  };

  it("finds root causes shared by two or more configs", () => {
    const clusters = findCrossConfigClusters([
      configResult({ buildTypeId: "Cfg_A", topClusters: [timeoutCluster] }),
      configResult({ buildTypeId: "Cfg_B", topClusters: [{ ...timeoutCluster, count: 3 }] }),
      configResult({
        buildTypeId: "Cfg_C",
        topClusters: [
          { rootCause: "AssertionError: expected 200", exceptionType: "AssertionError", count: 1, testNames: ["t2"] },
        ],
      }),
    ]);

    expect(clusters).toEqual([
      {
        rootCause: "java.net.SocketTimeoutException: connect timed out",
        exceptionType: "SocketTimeoutException",
        configCount: 2,
        buildTypeIds: ["Cfg_A", "Cfg_B"],
        totalTests: 8,
      },
    ]);
  });

  it("matches by root-cause line when there is no exception type", () => {
    const cause = { rootCause: "Process exited with code 137", exceptionType: null, count: 2, testNames: ["t"] };
    const clusters = findCrossConfigClusters([
      configResult({ buildTypeId: "Cfg_A", topClusters: [cause] }),
      configResult({ buildTypeId: "Cfg_B", topClusters: [{ ...cause, count: 4 }] }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].totalTests).toBe(6);
  });

  it("excludes causes seen in a single config and skips errored configs", () => {
    const clusters = findCrossConfigClusters([
      configResult({ buildTypeId: "Cfg_A", topClusters: [timeoutCluster] }),
      configResult({ buildTypeId: "Cfg_B", topClusters: [timeoutCluster], error: "boom" }),
    ]);
    expect(clusters).toEqual([]);
  });

  it("sorts by config count, then by affected tests", () => {
    const wide = { rootCause: "A", exceptionType: "AException", count: 1, testNames: ["t"] };
    const big = { rootCause: "B", exceptionType: "BException", count: 50, testNames: ["t"] };
    const clusters = findCrossConfigClusters([
      configResult({ buildTypeId: "C1", topClusters: [wide, big] }),
      configResult({ buildTypeId: "C2", topClusters: [wide, big] }),
      configResult({ buildTypeId: "C3", topClusters: [wide] }),
    ]);
    expect(clusters.map((c) => c.exceptionType)).toEqual(["AException", "BException"]);
  });
});

// ── New-failure diffing ──────────────────────────────────────────────

describe("diffFailedTestNames", () => {
  it("returns names failing now that were not failing before", () => {
    expect(diffFailedTestNames(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });

  it("returns everything when the baseline is empty and nothing when identical", () => {
    expect(diffFailedTestNames(["a"], [])).toEqual(["a"]);
    expect(diffFailedTestNames(["a"], ["a"])).toEqual([]);
  });
});

// ── Sorting ──────────────────────────────────────────────────────────

describe("sortBuildCardsByStartDateDesc", () => {
  it("sorts newest first, missing startDate last, without mutating input", () => {
    const input = [
      build({ buildId: 1, startDate: "20260705T100000+0000" }),
      build({ buildId: 2 }),
      build({ buildId: 3, startDate: "20260707T100000+0000" }),
      build({ buildId: 4, startDate: "20260706T100000+0000" }),
    ];
    const sorted = sortBuildCardsByStartDateDesc(input);
    expect(sorted.map((b) => b.buildId)).toEqual([3, 4, 1, 2]);
    expect(input.map((b) => b.buildId)).toEqual([1, 2, 3, 4]);
  });
});
