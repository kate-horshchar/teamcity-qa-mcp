// ── Aggregate Tools ─────────────────────────────────────────────────
//
// Tools: get_build_summary, compare_builds, get_failed_build_analysis_context,
//        get_green_build_diff_context

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import type { McpConfig } from "../schemas/common.js";
import type { BuildSummaryCard } from "../schemas/build.js";
import { success, failure, errorMessage, BuildIdInput } from "../schemas/common.js";
import {
  normalizeBuildCard,
  normalizeBuildProblem,
  normalizeFailedTest,
  normalizeChange,
} from "../utils/normalization.js";
import { extractLogExcerpt, logUnavailable, type LogExcerptResult } from "../utils/log-parsing.js";
import { clusterByRootCause } from "../utils/matching.js";
import {
  buildStatusMap,
  diffTestMaps,
  summarizeDiff,
  truncateDiff,
  groupDiffByClass,
} from "../utils/test-diff.js";

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
    group_by_class: z
      .boolean()
      .optional()
      .describe("When true, returns diff grouped by test class with per-class deltas instead of flat test lists. Ideal when many tests belong to the same class (e.g. parameterized/rotated tests)."),
  });

  server.tool(
    "compare_builds",
    "Full diff of any two builds — works for green-vs-red, green-vs-green, or any pair. Shows test count breakdown per build, new/fixed/persistent failures, missing/new tests, and ignored status changes. Use group_by_class=true to aggregate by test class instead of listing individual tests.",
    CompareBuildsInput.shape,
    async ({ buildId, baselineBuildId, group_by_class }) => {
      try {
        const [currentTests, baselineTests] = await Promise.all([
          client.getAllTests(buildId),
          client.getAllTests(baselineBuildId),
        ]);

        const current = buildStatusMap(currentTests);
        const baseline = buildStatusMap(baselineTests);
        const diff = diffTestMaps(current, baseline);
        const summary = summarizeDiff(diff);

        if (group_by_class) {
          // Grouped mode: aggregate by test class
          const classGroups = groupDiffByClass(diff);

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(success({
                buildId,
                baselineBuildId,
                baseline: baseline.counts,
                current: current.counts,
                summary,
                classGroups,
              }), null, 2),
            }],
          };
        }

        // Flat mode (default): truncated lists
        const MAX_LIST = 20;
        const truncatedDiff = truncateDiff(diff, MAX_LIST);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              buildId,
              baselineBuildId,
              baseline: baseline.counts,
              current: current.counts,
              summary,
              diff: truncatedDiff,
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
            const baselineRaw = recentSuccessful[0] as any;
            const [currentAllTests, baselineAllTests] = await Promise.all([
              client.getAllTests(buildId),
              client.getAllTests(baselineRaw.id),
            ]);

            const currentMap = buildStatusMap(currentAllTests);
            const baselineMap = buildStatusMap(baselineAllTests);
            const diff = diffTestMaps(currentMap, baselineMap);
            const diffSummary = summarizeDiff(diff);

            comparison = {
              baselineBuildId: baselineRaw.id,
              baselineBuildNumber: baselineRaw.number ?? String(baselineRaw.id),
              ...diffSummary,
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

  // ── get_green_build_diff_context ──────────────────────────────

  const GreenBuildDiffInput = z.object({
    buildId: z.number().describe("First build ID (the one being analyzed)"),
    baselineBuildId: z.number().describe("Baseline build ID to compare against"),
    include_neighboring: z
      .boolean()
      .optional()
      .describe("Also compare with builds immediately before/after to detect if changes are consistent or an anomaly (default: false)."),
  });

  server.tool(
    "get_green_build_diff_context",
    "Aggregate analysis context for comparing two green (or any non-failed) builds. Returns grouped diff by class, changes for both builds, and optional neighboring build context. The green-build analogue of get_failed_build_analysis_context.",
    GreenBuildDiffInput.shape,
    async ({ buildId, baselineBuildId, include_neighboring }) => {
      try {
        // Parallel fetch: builds, tests, changes for both
        const [
          rawBuild, rawBaseline,
          currentTests, baselineTests,
          rawCurrentChanges, rawBaselineChanges,
        ] = await Promise.all([
          client.getBuild(buildId),
          client.getBuild(baselineBuildId),
          client.getAllTests(buildId),
          client.getAllTests(baselineBuildId),
          client.getBuildChanges(buildId),
          client.getBuildChanges(baselineBuildId),
        ]);

        const buildCard = normalizeBuildCard(rawBuild);
        const baselineCard = normalizeBuildCard(rawBaseline);
        const currentChanges = rawCurrentChanges.map(normalizeChange);
        const baselineChanges = rawBaselineChanges.map(normalizeChange);

        const currentMap = buildStatusMap(currentTests);
        const baselineMap = buildStatusMap(baselineTests);
        const diff = diffTestMaps(currentMap, baselineMap);
        const summary = summarizeDiff(diff);
        const classGroups = groupDiffByClass(diff);

        // Optional: cross-validate with neighboring builds
        let neighboringContext: {
          builds: Array<{ buildId: number; buildNumber: string; status: string }>;
          deltas: Array<{ buildId: number; baselineId: number; newTests: number; missingTests: number; delta: string }>;
        } | null = null;

        if (include_neighboring) {
          try {
            const recentBuilds = await client.getBuilds(10);
            const buildIds = (recentBuilds as any[]).map((b) => b.id as number);

            // Find positions of our two builds
            const currentIdx = buildIds.indexOf(buildId);
            const baselineIdx = buildIds.indexOf(baselineBuildId);

            // Collect unique neighboring build IDs (before/after each target)
            const neighborIds = new Set<number>();
            for (const idx of [currentIdx, baselineIdx]) {
              if (idx > 0) neighborIds.add(buildIds[idx - 1]);
              if (idx >= 0 && idx < buildIds.length - 1) neighborIds.add(buildIds[idx + 1]);
            }
            // Exclude the two main builds
            neighborIds.delete(buildId);
            neighborIds.delete(baselineBuildId);

            const neighborBuilds = (recentBuilds as any[])
              .filter((b) => neighborIds.has(b.id))
              .map((b) => ({ buildId: b.id as number, buildNumber: (b.number ?? String(b.id)) as string, status: (b.status ?? "UNKNOWN") as string }));

            // Quick diffs: compare each neighbor against baseline
            const deltas: Array<{ buildId: number; baselineId: number; newTests: number; missingTests: number; delta: string }> = [];
            for (const nb of neighborBuilds) {
              try {
                const nbTests = await client.getAllTests(nb.buildId);
                const nbMap = buildStatusMap(nbTests);
                const nbDiff = diffTestMaps(nbMap, baselineMap);
                const netDelta = nbDiff.newTests.length - nbDiff.missingTests.length;
                deltas.push({
                  buildId: nb.buildId,
                  baselineId: baselineBuildId,
                  newTests: nbDiff.newTests.length,
                  missingTests: nbDiff.missingTests.length,
                  delta: netDelta > 0 ? `+${netDelta}` : String(netDelta),
                });
              } catch {
                // Skip neighbors that fail
              }
            }

            neighboringContext = { builds: neighborBuilds, deltas };
          } catch {
            // Neighboring context is best-effort
          }
        }

        // Auto-generate conclusion
        const totalDelta = diff.newTests.length - diff.missingTests.length;
        const deltaStr = totalDelta > 0 ? `+${totalDelta}` : String(totalDelta);
        const topClasses = Object.entries(classGroups)
          .slice(0, 3)
          .map(([cls, entry]) => `${cls} (${entry.delta})`)
          .join(", ");

        const autoConclusion = [
          `Build #${buildCard.buildNumber} vs #${baselineCard.buildNumber}: net test count ${deltaStr} (${currentMap.counts.total} vs ${baselineMap.counts.total}).`,
          topClasses ? `Top changed classes: ${topClasses}.` : "No test differences found.",
          currentChanges.length > 0
            ? `Build #${buildCard.buildNumber} has ${currentChanges.length} change(s): ${currentChanges.map((c) => c.comment.split("\n")[0]).slice(0, 3).join("; ")}.`
            : `Build #${buildCard.buildNumber} has no associated changes.`,
        ].join(" ");

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              builds: { current: buildCard, baseline: baselineCard },
              currentCounts: currentMap.counts,
              baselineCounts: baselineMap.counts,
              summary,
              classGroups,
              changes: { current: currentChanges, baseline: baselineChanges },
              neighboringContext,
              autoConclusion,
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
}
