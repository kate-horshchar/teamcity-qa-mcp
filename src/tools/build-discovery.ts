// ── Build Discovery Tools ───────────────────────────────────────────
//
// Tools: list_recent_builds, get_build_by_id

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import { success, failure, BuildIdInput } from "../schemas/common.js";
import { normalizeBuildCard, normalizeBuildDetail } from "../utils/normalization.js";

export function registerBuildDiscoveryTools(server: McpServer, client: TeamCityClient): void {
  // ── list_recent_builds ────────────────────────────────────────

  const ListBuildsInput = z.object({
    limit: z.number().optional().describe("Maximum number of builds to return"),
    status: z
      .enum(["SUCCESS", "FAILURE", "ERROR"])
      .optional()
      .describe("Filter by build status. Omit to return all builds."),
  });

  server.tool(
    "list_recent_builds",
    "List recent builds for the configured build configuration. Optionally filter by status (SUCCESS, FAILURE, ERROR). Returns compact build cards with status, state, dates, and branch info.",
    ListBuildsInput.shape,
    async ({ limit, status }) => {
      try {
        const rawBuilds = await client.getBuilds(limit, status);
        const builds = rawBuilds.map(normalizeBuildCard);
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
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
