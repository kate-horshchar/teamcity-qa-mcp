// ── Build Discovery Tools ───────────────────────────────────────────
//
// Tools: list_recent_builds, get_build_by_id, get_build_tests

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import { success, failure, errorMessage, BuildIdInput } from "../schemas/common.js";
import { normalizeBuildCard, normalizeBuildDetail, normalizeTestOccurrence } from "../utils/normalization.js";
import { extractClassName } from "../utils/test-diff.js";
import {
  validateTarget,
  singleConfigLocatorPart,
  projectLocatorPart,
} from "../utils/target-resolution.js";
import { sortBuildCardsByStartDateDesc } from "../utils/multi-config-aggregation.js";

export function registerBuildDiscoveryTools(server: McpServer, client: TeamCityClient): void {
  // ── list_recent_builds ────────────────────────────────────────

  const ListBuildsInput = z.object({
    limit: z.number().optional().describe("Maximum number of builds to return"),
    status: z
      .enum(["SUCCESS", "FAILURE", "ERROR"])
      .optional()
      .describe("Filter by build status. Omit to return all builds."),
    buildTypeId: z
      .string()
      .optional()
      .describe("Target a specific build configuration instead of the configured default."),
    buildTypeIds: z
      .array(z.string())
      .optional()
      .describe("Target several build configurations. Builds are fetched per configuration (limit applies per configuration), merged, and sorted newest-first."),
    projectId: z
      .string()
      .optional()
      .describe("Target a whole TeamCity project — returns builds from all its configurations, including nested subprojects."),
  });

  server.tool(
    "list_recent_builds",
    "List recent builds. By default uses the configured build configuration; optionally target another configuration (buildTypeId), several (buildTypeIds), or a whole project including nested subprojects (projectId) — provide at most one. Optionally filter by status (SUCCESS, FAILURE, ERROR). Returns compact build cards with status, state, dates, branch, and buildTypeId.",
    ListBuildsInput.shape,
    async ({ limit, status, buildTypeId, buildTypeIds, projectId }) => {
      try {
        const targetError = validateTarget({ buildTypeId, buildTypeIds, projectId });
        if (targetError) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure(targetError)) }],
            isError: true,
          };
        }

        let builds;
        if (buildTypeIds) {
          // One request per configuration, merged newest-first
          const perConfig = await Promise.all(
            buildTypeIds.map((id) =>
              client.getBuildsForLocator(singleConfigLocatorPart(id), { count: limit, status }),
            ),
          );
          builds = sortBuildCardsByStartDateDesc(perConfig.flat().map(normalizeBuildCard));
        } else if (buildTypeId || projectId) {
          const targetPart = buildTypeId
            ? singleConfigLocatorPart(buildTypeId)
            : projectLocatorPart(projectId!);
          const rawBuilds = await client.getBuildsForLocator(targetPart, { count: limit, status });
          builds = rawBuilds.map(normalizeBuildCard);
        } else {
          // Default: configured build configuration, unchanged behavior
          const rawBuilds = await client.getBuilds(limit, status);
          builds = rawBuilds.map(normalizeBuildCard);
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(builds), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── get_build_by_id ───────────────────────────────────────────

  server.tool(
    "get_build_by_id",
    "Get detailed information for a specific build by its ID. Returns build details including trigger info, agent, and revisions.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        const raw = await client.getBuild(buildId);
        const build = normalizeBuildDetail(raw);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(build), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── get_build_tests ───────────────────────────────────────────

  const GetBuildTestsInput = z.object({
    buildId: z.number().describe("TeamCity build ID"),
    status: z
      .enum(["SUCCESS", "FAILURE", "UNKNOWN"])
      .optional()
      .describe("Filter by test status. UNKNOWN includes ignored/muted. Omit to return all."),
    namePattern: z
      .string()
      .optional()
      .describe("Regex pattern to filter test names (client-side, case-insensitive)."),
    classPattern: z
      .string()
      .optional()
      .describe("Regex pattern to filter by class name extracted from FQN (case-insensitive)."),
    offset: z.number().optional().describe("Skip first N results (default: 0)"),
    limit: z.number().optional().describe("Maximum results to return (default: 100, max: 500)"),
  });

  server.tool(
    "get_build_tests",
    "Get tests for a build — passed, failed, and ignored. Supports filtering by status, test name regex, and class name regex. Unlike get_failed_tests, works for any build including green ones.",
    GetBuildTestsInput.shape,
    async ({ buildId, status, namePattern, classPattern, offset, limit }) => {
      try {
        const effectiveLimit = Math.min(limit ?? 100, 500);
        const effectiveOffset = offset ?? 0;

        // Validate regex patterns early
        let nameRegex: RegExp | undefined;
        let classRegex: RegExp | undefined;
        try {
          if (namePattern) nameRegex = new RegExp(namePattern, "i");
          if (classPattern) classRegex = new RegExp(classPattern, "i");
        } catch (regexErr) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure(`Invalid regex: ${errorMessage(regexErr)}`)) }],
            isError: true,
          };
        }

        // If we need client-side filtering, fetch all tests; otherwise use pagination
        let rawTests: unknown[];
        let hasMore = false;

        if (nameRegex || classRegex) {
          // Client-side filtering requires all tests
          rawTests = await client.getAllTests(buildId);

          // Apply status filter client-side since getAllTests doesn't filter
          if (status) {
            rawTests = rawTests.filter((t: any) => t.status === status);
          }

          // Apply regex filters
          if (nameRegex) {
            rawTests = rawTests.filter((t: any) => nameRegex!.test(t.name ?? ""));
          }
          if (classRegex) {
            rawTests = rawTests.filter((t: any) => classRegex!.test(extractClassName(t.name ?? "")));
          }

          // Manual pagination
          const total = rawTests.length;
          rawTests = rawTests.slice(effectiveOffset, effectiveOffset + effectiveLimit);
          hasMore = effectiveOffset + effectiveLimit < total;
        } else {
          // Server-side pagination (no regex filters)
          const result = await client.getTestsPage(buildId, {
            status,
            start: effectiveOffset,
            count: effectiveLimit,
          });
          rawTests = result.tests;
          hasMore = result.hasMore;
        }

        const tests = rawTests.map(normalizeTestOccurrence);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              buildId,
              totalReturned: tests.length,
              hasMore,
              tests,
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
