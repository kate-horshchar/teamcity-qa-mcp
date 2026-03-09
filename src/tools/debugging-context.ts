// ── Debugging Context Tools ─────────────────────────────────────────
//
// Tools: get_build_changes

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import { success, failure, BuildIdInput } from "../schemas/common.js";
import { normalizeChange } from "../utils/normalization.js";

export function registerDebuggingContextTools(
  server: McpServer,
  client: TeamCityClient,
): void {
  // ── get_build_changes ─────────────────────────────────────────

  server.tool(
    "get_build_changes",
    "Get recent changes/commits associated with a build. Returns revision, author, comment, and changed files.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        const raw = await client.getBuildChanges(buildId);
        const changes = raw.map(normalizeChange);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(changes), null, 2) }],
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
