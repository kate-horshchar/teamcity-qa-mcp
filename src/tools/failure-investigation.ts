// ── Failure Investigation Tools ─────────────────────────────────────
//
// Tools: get_build_problems, get_failed_tests, get_test_failure_details, get_build_log_excerpt

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import type { McpConfig } from "../schemas/common.js";
import { success, failure, errorMessage, BuildIdInput } from "../schemas/common.js";
import {
  normalizeBuildProblem,
  normalizeFailedTest,
  normalizeTestFailureDetail,
} from "../utils/normalization.js";
import { extractLogExcerpt, searchLog, logUnavailable } from "../utils/log-parsing.js";

export function registerFailureInvestigationTools(
  server: McpServer,
  client: TeamCityClient,
  config: McpConfig,
): void {
  // ── get_build_problems ────────────────────────────────────────

  server.tool(
    "get_build_problems",
    "Get structured build problems for a build. Returns problem type, identity, and details.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        const raw = await client.getBuildProblems(buildId);
        const problems = raw.map(normalizeBuildProblem);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(problems), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── get_failed_tests ──────────────────────────────────────────

  server.tool(
    "get_failed_tests",
    "Get failed test occurrences for a build. Returns test names, statuses, durations, and short failure details.",
    BuildIdInput.shape,
    async ({ buildId }) => {
      try {
        const raw = await client.getFailedTests(buildId);
        const tests = raw.map(normalizeFailedTest);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(tests), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── get_test_failure_details ──────────────────────────────────

  const TestOccurrenceInput = z.object({
    testOccurrenceId: z
      .string()
      .describe(
        "Test occurrence ID or locator, typically returned by get_failed_tests (the 'id' field).",
      ),
  });

  server.tool(
    "get_test_failure_details",
    "Get detailed failure info for one test occurrence: failure message, stack trace, expected/actual values.",
    TestOccurrenceInput.shape,
    async ({ testOccurrenceId }) => {
      try {
        const raw = await client.getTestOccurrence(testOccurrenceId);
        const detail = normalizeTestFailureDetail(raw);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(detail), null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(failure(errorMessage(err))) }],
          isError: true,
        };
      }
    },
  );

  // ── get_build_log_excerpt ─────────────────────────────────────

  const BuildLogExcerptInput = z.object({
    buildId: z.number().describe("TeamCity build ID"),
    pattern: z
      .string()
      .optional()
      .describe("Regex pattern to search the entire log (case-insensitive). When provided, returns matching lines with context instead of the default tail+error-windows excerpt."),
    context: z
      .number()
      .optional()
      .describe("Lines of context around each match when using pattern search (default: 3, like grep -C)."),
    maxMatches: z
      .number()
      .optional()
      .describe("Maximum matches to return when using pattern search (default: 50)."),
  });

  server.tool(
    "get_build_log_excerpt",
    "Get a compact, relevant excerpt from a build log. By default, extracts tail lines and error pattern windows. Optionally, provide a `pattern` to search the entire log with regex (like grep -C). Falls back gracefully if log retrieval is unavailable.",
    BuildLogExcerptInput.shape,
    async ({ buildId, pattern, context: contextLines, maxMatches }) => {
      try {
        const rawLog = await client.downloadBuildLog(buildId);

        if (pattern) {
          // Search mode: regex search across the entire log
          let result;
          try {
            result = searchLog(rawLog, pattern, contextLines ?? 3, maxMatches ?? 50);
          } catch (regexErr) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify(failure(`Invalid regex pattern: ${errorMessage(regexErr)}`)) }],
              isError: true,
            };
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(success(result), null, 2) }],
          };
        }

        // Default mode: tail + error windows
        const excerpt = extractLogExcerpt(rawLog, config.logTailLines);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(excerpt), null, 2) }],
        };
      } catch (err) {
        // Graceful degradation: log retrieval is optional
        const unavailable = logUnavailable(
          err instanceof Error ? err.message : "Build log retrieval failed",
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(success(unavailable), null, 2) }],
        };
      }
    },
  );
}
