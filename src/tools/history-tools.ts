// ── History & Pattern Tools ──────────────────────────────────────────
//
// Tools: get_test_history, cluster_build_failures, find_failure_across_builds

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import type { McpConfig } from "../schemas/common.js";
import { success, failure, BuildIdInput } from "../schemas/common.js";
import { normalizeTestHistoryEntry, normalizeFailedTest } from "../utils/normalization.js";
import { clusterByRootCause, matchesFailurePattern } from "../utils/matching.js";

export function registerHistoryTools(
  server: McpServer,
  client: TeamCityClient,
  config: McpConfig,
): void {
  // ── get_test_history ──────────────────────────────────────────

  const TestHistoryInput = z.object({
    testName: z.string().describe("Fully-qualified test name"),
    limit: z.number().optional().describe("Max history entries to return"),
  });

  server.tool(
    "get_test_history",
    "Get recent execution history for a specific test. Returns build IDs, dates, statuses, and durations. Useful for detecting flaky patterns.",
    TestHistoryInput.shape,
    async ({ testName, limit }) => {
      try {
        const raw = await client.getTestHistory(testName, limit);
        const history = raw.map(normalizeTestHistoryEntry);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(history), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── cluster_build_failures ────────────────────────────────────

  server.tool(
    "cluster_build_failures",
    "Group all failed tests in a build by root cause. Instead of listing 43 failures individually, returns clusters like '1 root cause: AuthException 503, affects 43 tests'. Sorted by cluster size descending.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        const raw = await client.getFailedTests(buildId);
        const tests = raw.map(normalizeFailedTest);

        const clusters = clusterByRootCause(
          tests.map((t) => ({ testName: t.testName, details: t.details ?? "" })),
        );

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              buildId,
              totalFailures: tests.length,
              clusterCount: clusters.length,
              clusters,
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

  // ── find_failure_across_builds ────────────────────────────────

  const FailureAcrossBuildsInput = z.object({
    exceptionType: z.string().optional().describe("Exception type to search for (e.g. 'AutotestAuthException')"),
    messageFragment: z.string().optional().describe("Text fragment to search in failure messages (e.g. '503')"),
    buildLimit: z.number().optional().describe("Number of recent builds to search (default: 10)"),
  });

  server.tool(
    "find_failure_across_builds",
    "Search for a specific failure pattern across recent builds. Answers 'is this a new problem or recurring?' by checking if the same exception or error message appeared in previous builds. Returns a per-build breakdown.",
    FailureAcrossBuildsInput.shape,
    async ({ exceptionType, messageFragment, buildLimit }) => {
      try {
        if (!exceptionType && !messageFragment) {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify(failure("At least one of exceptionType or messageFragment is required")),
            }],
            isError: true,
          };
        }

        const limit = buildLimit ?? 10;
        const rawBuilds = await client.getBuilds(limit);

        const builds: Array<{
          buildId: number;
          buildNumber: string;
          status: string;
          finishDate: string | undefined;
          matchingTests: number;
          totalFailedTests: number;
        }> = [];

        for (const rawBuild of rawBuilds as any[]) {
          const buildId = rawBuild.id;
          const rawTests = await client.getFailedTests(buildId);
          const tests = rawTests.map(normalizeFailedTest);

          const matching = tests.filter((t) =>
            matchesFailurePattern(t.details ?? "", exceptionType, messageFragment),
          );

          if (matching.length > 0) {
            builds.push({
              buildId,
              buildNumber: rawBuild.number ?? String(buildId),
              status: rawBuild.status ?? "UNKNOWN",
              finishDate: rawBuild.finishDate ?? undefined,
              matchingTests: matching.length,
              totalFailedTests: tests.length,
            });
          }
        }

        const searchPattern = [
          exceptionType ? `exception: ${exceptionType}` : null,
          messageFragment ? `message: "${messageFragment}"` : null,
        ].filter(Boolean).join(", ");

        const firstSeen = builds.length > 0 ? builds[builds.length - 1] : null;
        const lastSeen = builds.length > 0 ? builds[0] : null;

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              searchPattern,
              buildsSearched: limit,
              buildsWithMatch: builds.length,
              firstSeen: firstSeen ? { buildId: firstSeen.buildId, buildNumber: firstSeen.buildNumber, finishDate: firstSeen.finishDate } : null,
              lastSeen: lastSeen ? { buildId: lastSeen.buildId, buildNumber: lastSeen.buildNumber, finishDate: lastSeen.finishDate } : null,
              builds,
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
