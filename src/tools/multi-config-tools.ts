// ── Multi-Config Tools ──────────────────────────────────────────────
//
// Tools: list_project_build_configs, get_multi_config_failure_summary
//
// Flexible-target analysis: a single build configuration, a list of
// configurations, or a whole project (including nested subprojects).

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TeamCityClient } from "../client.js";
import type { McpConfig } from "../schemas/common.js";
import { success, failure, errorMessage } from "../schemas/common.js";
import { normalizeBuildCard, normalizeBuildTypeCard, normalizeFailedTest } from "../utils/normalization.js";
import { clusterByRootCause } from "../utils/matching.js";
import {
  validateTarget,
  resolveTarget,
  singleConfigLocatorPart,
} from "../utils/target-resolution.js";
import {
  toTeamCityDate,
  windowStart,
  isFailedStatus,
  aggregateConfigResults,
  findCrossConfigClusters,
  diffFailedTestNames,
  type ConfigFailureSummary,
} from "../utils/multi-config-aggregation.js";

const DEFAULT_SINCE_HOURS = 24;
const DEFAULT_MAX_BUILDS_PER_CONFIG = 10;
const TOP_CLUSTERS_PER_CONFIG = 5;

export function registerMultiConfigTools(
  server: McpServer,
  client: TeamCityClient,
  config: McpConfig,
): void {
  // ── list_project_build_configs ────────────────────────────────

  const ListProjectConfigsInput = z.object({
    projectId: z.string().describe("TeamCity project ID (e.g. 'MyProject' or 'MyProject_Subproject')"),
    includeSubprojects: z
      .boolean()
      .optional()
      .describe("Include build configurations from nested subprojects (default: true)."),
  });

  server.tool(
    "list_project_build_configs",
    "List all build configurations of a TeamCity project, including nested subprojects by default. Use this to discover what a project contains before analyzing it, or to pick configuration IDs for other tools.",
    ListProjectConfigsInput.shape,
    async ({ projectId, includeSubprojects }) => {
      try {
        if (!projectId.trim()) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure("projectId must not be empty")) }],
            isError: true,
          };
        }

        const raw = await client.getProjectBuildTypes(projectId, includeSubprojects ?? true);
        const configs = raw.map(normalizeBuildTypeCard);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              projectId,
              configCount: configs.length,
              configs,
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

  // ── get_multi_config_failure_summary ──────────────────────────

  const MultiConfigSummaryInput = z.object({
    buildTypeId: z
      .string()
      .optional()
      .describe("Analyze a single build configuration."),
    buildTypeIds: z
      .array(z.string())
      .optional()
      .describe("Analyze a list of build configurations together."),
    projectId: z
      .string()
      .optional()
      .describe("Analyze a whole project — all its build configurations, including nested subprojects."),
    sinceHours: z
      .number()
      .optional()
      .describe("Analysis window in hours (default: 24). Only builds started within the window are considered."),
    maxBuildsPerConfig: z
      .number()
      .optional()
      .describe("Maximum builds to fetch per configuration within the window (default: 10)."),
    newFailuresOnly: z
      .boolean()
      .optional()
      .describe("When true, failure clusters cover only tests that were NOT failing in the previous build of the same configuration (default: false)."),
  });

  server.tool(
    "get_multi_config_failure_summary",
    "Aggregate failure summary across build configurations: a single config, a list, or a whole project including nested subprojects (provide at most one of buildTypeId, buildTypeIds, projectId; none = the configured default). Returns one overall summary (build/failure counts plus cross-config root-cause clusters — the same cause hitting several configs suggests infrastructure) and a per-config breakdown. Failure details reflect the most recent failed build of each configuration within the window. Errors for one configuration do not fail the rest.",
    MultiConfigSummaryInput.shape,
    async ({ buildTypeId, buildTypeIds, projectId, sinceHours, maxBuildsPerConfig, newFailuresOnly }) => {
      try {
        const targetError = validateTarget({ buildTypeId, buildTypeIds, projectId });
        if (targetError) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure(targetError)) }],
            isError: true,
          };
        }

        const effectiveSinceHours = sinceHours ?? DEFAULT_SINCE_HOURS;
        const effectiveMaxBuilds = maxBuildsPerConfig ?? DEFAULT_MAX_BUILDS_PER_CONFIG;
        if (effectiveSinceHours <= 0) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(failure("sinceHours must be positive")) }],
            isError: true,
          };
        }

        const resolved = await resolveTarget(client, config, { buildTypeId, buildTypeIds, projectId });
        const since = windowStart(effectiveSinceHours);
        const sinceDate = toTeamCityDate(since);

        const perConfig = await Promise.all(
          resolved.configs.map((cfg) =>
            analyzeConfig(client, cfg, {
              sinceDate,
              maxBuilds: effectiveMaxBuilds,
              newFailuresOnly: newFailuresOnly ?? false,
            }),
          ),
        );

        const counts = aggregateConfigResults(perConfig);
        const crossConfigClusters = findCrossConfigClusters(perConfig);

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(success({
              target: {
                kind: resolved.kind,
                resolvedConfigs: resolved.configs.map((c) => c.buildTypeId),
              },
              window: { sinceHours: effectiveSinceHours, since: since.toISOString() },
              summary: { ...counts, crossConfigClusters },
              perConfig,
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

// ── Per-config analysis ───────────────────────────────────────────
//
// Cost control: one builds request per config; failed-test details are
// fetched only for the most recent failed build (plus its predecessor
// when newFailuresOnly is set). A failure here is isolated into the
// config's `error` field instead of failing the whole aggregation.

async function analyzeConfig(
  client: TeamCityClient,
  cfg: { buildTypeId: string; name?: string },
  opts: { sinceDate: string; maxBuilds: number; newFailuresOnly: boolean },
): Promise<ConfigFailureSummary> {
  const base: ConfigFailureSummary = {
    buildTypeId: cfg.buildTypeId,
    ...(cfg.name ? { name: cfg.name } : {}),
    builds: [],
    failedTestCount: 0,
    topClusters: [],
  };

  try {
    const rawBuilds = await client.getBuildsForLocator(singleConfigLocatorPart(cfg.buildTypeId), {
      count: opts.maxBuilds,
      sinceDate: opts.sinceDate,
    });
    const builds = rawBuilds.map(normalizeBuildCard);
    base.builds = builds;

    const latest = builds[0];
    if (latest) {
      base.latestBuild = {
        buildId: latest.buildId,
        buildNumber: latest.buildNumber,
        status: latest.status,
      };
    }

    const latestFailed = builds.find((b) => b.state === "finished" && isFailedStatus(b.status));
    if (!latestFailed) return base;

    const failedTests = (await client.getFailedTests(latestFailed.buildId)).map(normalizeFailedTest);
    base.failedTestCount = failedTests.length;

    let clusterInput = failedTests;
    if (opts.newFailuresOnly) {
      const failedIdx = builds.findIndex((b) => b.buildId === latestFailed.buildId);
      const previous = builds.slice(failedIdx + 1).find((b) => b.state === "finished");
      if (previous) {
        const previousFailed = (await client.getFailedTests(previous.buildId)).map(normalizeFailedTest);
        base.newFailures = diffFailedTestNames(
          failedTests.map((t) => t.testName),
          previousFailed.map((t) => t.testName),
        );
        const newNames = new Set(base.newFailures);
        clusterInput = failedTests.filter((t) => newNames.has(t.testName));
      }
      // No earlier build in the window → baseline unknown, keep full clusters
    }

    base.topClusters = clusterByRootCause(
      clusterInput.map((t) => ({ testName: t.testName, details: t.details ?? "" })),
    ).slice(0, TOP_CLUSTERS_PER_CONFIG);

    return base;
  } catch (err) {
    return { ...base, builds: [], failedTestCount: 0, topClusters: [], error: errorMessage(err) };
  }
}
