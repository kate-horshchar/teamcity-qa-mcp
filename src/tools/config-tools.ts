// ── Config Tools ────────────────────────────────────────────────────
//
// Tools: set_build_type_id, set_auth_token
//
// Runtime configuration management. These tools mutate shared state
// so that subsequent tool calls use the updated values.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import type { McpConfig } from "../schemas/common.js";
import { success, failure, errorMessage } from "../schemas/common.js";
import { persistEnvVar } from "../utils/config-persistence.js";

export function registerConfigTools(
  server: McpServer,
  client: TeamCityClient,
  config: McpConfig,
): void {
  // ── set_build_type_id ──────────────────────────────────────────

  const SetBuildTypeIdInput = z.object({
    buildTypeId: z.string().describe("New TeamCity build type/configuration ID (e.g. 'MyProject_Build')"),
  });

  server.tool(
    "set_build_type_id",
    "Change the active TeamCity build configuration at runtime. Affects all subsequent tool calls. Use when you need to switch between build configurations without restarting.",
    SetBuildTypeIdInput.shape,
    async ({ buildTypeId }) => {
      try {
        if (!buildTypeId.trim()) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure("buildTypeId must not be empty")) }],
            isError: true,
          };
        }

        const previous = config.buildTypeId;
        config.buildTypeId = buildTypeId;

        const persist = persistEnvVar("TEAMCITY_BUILD_TYPE_ID", buildTypeId);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              previous,
              current: buildTypeId,
              message: "Build type ID updated. All subsequent tool calls will use the new value.",
              persisted: persist.persisted,
              ...(persist.persisted
                ? { configSource: persist.source, configPath: persist.path }
                : { warning: persist.error }),
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

  // ── set_auth_token ─────────────────────────────────────────────

  const SetAuthTokenInput = z.object({
    token: z.string().describe("New TeamCity Bearer token"),
  });

  server.tool(
    "set_auth_token",
    "Update the TeamCity authentication token at runtime. Use when the current token has expired. The token value is not echoed in the response for security.",
    SetAuthTokenInput.shape,
    async ({ token }) => {
      try {
        if (!token.trim()) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure("Token must not be empty")) }],
            isError: true,
          };
        }

        client.updateToken(token);

        const persist = persistEnvVar("TEAMCITY_TOKEN", token);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              message: "Authentication token updated. All subsequent API calls will use the new token.",
              persisted: persist.persisted,
              ...(persist.persisted
                ? { configSource: persist.source, configPath: persist.path }
                : { warning: persist.error }),
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
