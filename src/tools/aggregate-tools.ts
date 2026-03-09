// ── Aggregate Tools ─────────────────────────────────────────────────
//
// Tools: get_build_summary, compare_builds, get_failed_build_analysis_context

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import type { McpConfig } from "../schemas/common.js";
import type { BuildSummaryCard } from "../schemas/build.js";
import { success, failure, BuildIdInput } from "../schemas/common.js";
import {
  normalizeBuildCard,
  normalizeBuildProblem,
  normalizeFailedTest,
  normalizeChange,
} from "../utils/normalization.js";
import { extractLogExcerpt, logUnavailable, type LogExcerptResult } from "../utils/log-parsing.js";
import { clusterByRootCause } from "../utils/matching.js";

export function registerAggregateTools(
  server: McpServer,
  client: TeamCityClient,
  config: McpConfig,
): void {
  // ── get_build_summary ─────────────────────────────────────────

  server.tool(
    "get_build_summary",
    "Get a compact summary card for a build: build details, problem count, and failed test count. Useful for quick build overview.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        const [rawBuild, problemCount, failedTestCount] = await Promise.all([
          client.getBuild(buildId),
          client.getBuildProblemCount(buildId),
          client.getFailedTestCount(buildId),
        ]);

        const summary: BuildSummaryCard = {
          build: normalizeBuildCard(rawBuild),
          problemCount,
          failedTestCount,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(summary), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── compare_builds ────────────────────────────────────────────

  const CompareBuildsInput = z.object({
    buildId: z.number().describe("Build ID to analyze"),
    baselineBuildId: z.number().describe("Baseline build ID to compare against"),
  });

  server.tool(
    "compare_builds",
    "Full diff of any two builds — works for green-vs-red, green-vs-green, or any pair. Shows test count breakdown per build, new/fixed/persistent failures, missing/new tests, and ignored status changes. Answers both 'what broke' and 'why do two green builds have different test counts'.",
    CompareBuildsInput.shape,
    async ({ buildId, baselineBuildId }) => {
      try {
        const [currentTests, baselineTests] = await Promise.all([
          client.getAllTests(buildId),
          client.getAllTests(baselineBuildId),
        ]);

        const toMap = (tests: unknown[]) => {
          const map = new Map<string, string>();
          for (const t of tests as any[]) {
            map.set(t.name ?? "", t.status ?? "UNKNOWN");
          }
          return map;
        };

        const countByStatus = (map: Map<string, string>) => {
          const counts = { passed: 0, failed: 0, ignored: 0, total: map.size };
          for (const status of map.values()) {
            if (status === "SUCCESS") counts.passed++;
            else if (status === "FAILURE") counts.failed++;
            else if (status === "UNKNOWN") counts.ignored++; // TC reports ignored/muted as UNKNOWN
            else counts.ignored++;
          }
          return counts;
        };

        const current = toMap(currentTests);
        const baseline = toMap(baselineTests);

        const newFailures: string[] = [];
        const fixedTests: string[] = [];
        const sameFailures: string[] = [];
        const newTests: string[] = [];
        const missingTests: string[] = [];
        const becameIgnored: string[] = [];
        const becameActive: string[] = [];

        for (const [name, currStatus] of current) {
          const baseStatus = baseline.get(name);
          if (!baseStatus) {
            newTests.push(name);
          } else if (currStatus === "FAILURE" && baseStatus !== "FAILURE") {
            newFailures.push(name);
          } else if (currStatus === "FAILURE" && baseStatus === "FAILURE") {
            sameFailures.push(name);
          } else if (currStatus !== "FAILURE" && baseStatus === "FAILURE") {
            fixedTests.push(name);
          }

          // Track ignored transitions
          if (baseStatus) {
            const currActive = currStatus === "SUCCESS" || currStatus === "FAILURE";
            const baseActive = baseStatus === "SUCCESS" || baseStatus === "FAILURE";
            if (currActive && !baseActive) {
              becameActive.push(name);
            } else if (!currActive && baseActive) {
              becameIgnored.push(name);
            }
          }
        }

        for (const name of baseline.keys()) {
          if (!current.has(name)) {
            missingTests.push(name);
          }
        }

        const MAX_LIST = 20;
        const truncate = (list: string[]) =>
          list.length <= MAX_LIST
            ? list
            : [...list.slice(0, MAX_LIST), `... and ${list.length - MAX_LIST} more`];

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              buildId,
              baselineBuildId,
              baseline: countByStatus(baseline),
              current: countByStatus(current),
              summary: {
                newFailures: newFailures.length,
                fixedTests: fixedTests.length,
                sameFailures: sameFailures.length,
                missingTests: missingTests.length,
                newTests: newTests.length,
                becameIgnored: becameIgnored.length,
                becameActive: becameActive.length,
              },
              diff: {
                newFailures: truncate(newFailures),
                fixedTests: truncate(fixedTests),
                sameFailures: truncate(sameFailures),
                missingTests: truncate(missingTests),
                newTests: truncate(newTests),
                becameIgnored: truncate(becameIgnored),
                becameActive: truncate(becameActive),
              },
            }), null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── get_failed_build_analysis_context ─────────────────────────

  server.tool(
    "get_failed_build_analysis_context",
    "Aggregate a compact analysis context for a failed build. Returns clustered failures (not raw test list), build problems, changes, log excerpt, and auto-comparison with the previous green build. Designed for efficient LLM consumption.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        // Fetch core data in parallel
        const [rawBuild, rawProblems, rawFailedTests, rawChanges] = await Promise.all([
          client.getBuild(buildId),
          client.getBuildProblems(buildId),
          client.getFailedTests(buildId),
          client.getBuildChanges(buildId),
        ]);

        const build = normalizeBuildCard(rawBuild);
        const problems = rawProblems.map(normalizeBuildProblem);
        const failedTests = rawFailedTests.map(normalizeFailedTest);
        const changes = rawChanges.map(normalizeChange);

        // Cluster failures by root cause instead of returning raw list
        const clusters = clusterByRootCause(
          failedTests.map((t) => ({ testName: t.testName, details: t.details ?? "" })),
        );

        // Log excerpt (optional, may fail)
        let logExcerpt: LogExcerptResult;
        try {
          const rawLog = await client.downloadBuildLog(buildId);
          logExcerpt = extractLogExcerpt(rawLog, config.logTailLines);
        } catch {
          logExcerpt = logUnavailable("Build log retrieval failed or unavailable");
        }

        // Auto-find previous green build for comparison
        let comparison: {
          baselineBuildId: number;
          baselineBuildNumber: string;
          newFailures: number;
          fixedTests: number;
          sameFailures: number;
          missingTests: number;
          newTests: number;
        } | null = null;

        try {
          const recentSuccessful = await client.getBuilds(1, "SUCCESS");
          if (recentSuccessful.length > 0) {
            const baseline = recentSuccessful[0] as any;
            const [currentAllTests, baselineAllTests] = await Promise.all([
              client.getAllTests(buildId),
              client.getAllTests(baseline.id),
            ]);

            const toStatusMap = (tests: unknown[]) => {
              const map = new Map<string, string>();
              for (const t of tests as any[]) {
                map.set(t.name ?? "", t.status ?? "UNKNOWN");
              }
              return map;
            };

            const current = toStatusMap(currentAllTests);
            const baselineMap = toStatusMap(baselineAllTests);

            let newFailures = 0, fixedTests = 0, sameFailures = 0, missingTests = 0, newTests = 0;

            for (const [name, status] of current) {
              const baseStatus = baselineMap.get(name);
              if (!baseStatus) { newTests++; continue; }
              if (status === "FAILURE" && baseStatus !== "FAILURE") newFailures++;
              else if (status === "FAILURE" && baseStatus === "FAILURE") sameFailures++;
              else if (status !== "FAILURE" && baseStatus === "FAILURE") fixedTests++;
            }

            for (const name of baselineMap.keys()) {
              if (!current.has(name)) missingTests++;
            }

            comparison = {
              baselineBuildId: baseline.id,
              baselineBuildNumber: baseline.number ?? String(baseline.id),
              newFailures,
              fixedTests,
              sameFailures,
              missingTests,
              newTests,
            };
          }
        } catch {
          // Comparison is best-effort — don't fail the whole context
        }

        const context = {
          build,
          problems,
          failureClusters: clusters,
          totalFailedTests: failedTests.length,
          clusterCount: clusters.length,
          changes,
          logExcerpt,
          comparisonWithPreviousGreen: comparison,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(context), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
