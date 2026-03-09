import { z } from "zod";

// ── Config loaded from environment ──────────────────────────────────

export interface McpConfig {
  teamcityUrl: string;
  teamcityToken: string;
  buildTypeId: string;
  defaultLookbackBuilds: number;
  logTailLines: number;
  similarFailuresLimit: number;
}

export function loadConfig(): McpConfig {
  const url = process.env.TEAMCITY_URL;
  const token = process.env.TEAMCITY_TOKEN;
  const buildTypeId = process.env.TEAMCITY_BUILD_TYPE_ID;

  if (!url) throw new Error("TEAMCITY_URL is required");
  if (!token) throw new Error("TEAMCITY_TOKEN is required");
  if (!buildTypeId) throw new Error("TEAMCITY_BUILD_TYPE_ID is required");

  return {
    teamcityUrl: url.replace(/\/+$/, ""),
    teamcityToken: token,
    buildTypeId,
    defaultLookbackBuilds: parseInt(process.env.TEAMCITY_DEFAULT_LOOKBACK_BUILDS || "20", 10),
    logTailLines: parseInt(process.env.TEAMCITY_LOG_TAIL_LINES || "200", 10),
    similarFailuresLimit: parseInt(process.env.TEAMCITY_SIMILAR_FAILURES_LIMIT || "10", 10),
  };
}

// ── Reusable input schemas ──────────────────────────────────────────

export const BuildIdInput = z.object({
  buildId: z.number().describe("TeamCity build ID"),
});

export const OptionalLimitInput = z.object({
  limit: z.number().optional().describe("Maximum number of results to return"),
});

// ── Generic response wrappers ───────────────────────────────────────

export interface ToolSuccess<T> {
  ok: true;
  data: T;
}

export interface ToolError {
  ok: false;
  error: string;
  fallbackSuggestion?: string;
}

export type ToolResult<T> = ToolSuccess<T> | ToolError;

export function success<T>(data: T): ToolSuccess<T> {
  return { ok: true, data };
}

export function failure(error: string, fallbackSuggestion?: string): ToolError {
  return { ok: false, error, ...(fallbackSuggestion ? { fallbackSuggestion } : {}) };
}
