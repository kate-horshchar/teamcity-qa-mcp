// ── Target Resolution ───────────────────────────────────────────────
//
// Shared logic for tools that accept a flexible analysis target:
// a single build configuration, a list of configurations, or a whole
// project (including nested subprojects). At most one of the three may
// be provided; when none is, the configured default build type applies.

import type { McpConfig } from "../schemas/common.js";

export interface TargetInput {
  buildTypeId?: string;
  buildTypeIds?: string[];
  projectId?: string;
}

export type TargetKind = "config" | "configList" | "project" | "default";

export interface ResolvedTarget {
  kind: TargetKind;
  /** Build configurations covered by the target. Names are known only for project targets. */
  configs: Array<{ buildTypeId: string; name?: string }>;
}

/** Client surface needed for target resolution (subset of TeamCityClient). */
export interface ProjectBuildTypesSource {
  getProjectBuildTypes(projectId: string, includeSubprojects?: boolean): Promise<unknown[]>;
}

/**
 * Validate that at most one target dimension is provided and that the
 * provided one is non-empty. Returns an error message or null when valid.
 */
export function validateTarget(input: TargetInput): string | null {
  const provided = [
    input.buildTypeId !== undefined,
    input.buildTypeIds !== undefined,
    input.projectId !== undefined,
  ].filter(Boolean).length;

  if (provided > 1) {
    return "Provide at most one of buildTypeId, buildTypeIds, projectId";
  }
  if (input.buildTypeId !== undefined && !input.buildTypeId.trim()) {
    return "buildTypeId must not be empty";
  }
  if (input.buildTypeIds !== undefined && input.buildTypeIds.length === 0) {
    return "buildTypeIds must not be empty";
  }
  if (input.buildTypeIds?.some((id) => !id.trim())) {
    return "buildTypeIds must not contain empty values";
  }
  if (input.projectId !== undefined && !input.projectId.trim()) {
    return "projectId must not be empty";
  }
  return null;
}

/**
 * Resolve a target to a concrete list of build configurations.
 * Project targets are expanded via the TeamCity API (including nested
 * subprojects). Call validateTarget() first — this assumes valid input.
 */
export async function resolveTarget(
  client: ProjectBuildTypesSource,
  config: Pick<McpConfig, "buildTypeId">,
  input: TargetInput,
): Promise<ResolvedTarget> {
  if (input.buildTypeId !== undefined) {
    return { kind: "config", configs: [{ buildTypeId: input.buildTypeId }] };
  }

  if (input.buildTypeIds !== undefined) {
    // De-duplicate while preserving order
    const seen = new Set<string>();
    const configs = input.buildTypeIds
      .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
      .map((id) => ({ buildTypeId: id }));
    return { kind: "configList", configs };
  }

  if (input.projectId !== undefined) {
    const raw = await client.getProjectBuildTypes(input.projectId, true);
    const configs = (raw as any[])
      .filter((bt) => bt?.id)
      .map((bt) => ({ buildTypeId: bt.id as string, name: (bt.name ?? undefined) as string | undefined }));
    if (configs.length === 0) {
      throw new Error(`No build configurations found in project '${input.projectId}'`);
    }
    return { kind: "project", configs };
  }

  return { kind: "default", configs: [{ buildTypeId: config.buildTypeId }] };
}

// ── Build locator helpers ───────────────────────────────────────────
//
// Locator strings for GET /app/rest/builds. Kept as pure functions so
// tests can assert the exact strings sent to TeamCity.

/** Locator part selecting a single build configuration by ID. */
export function singleConfigLocatorPart(buildTypeId: string): string {
  return `buildType:(id:${buildTypeId})`;
}

/** Locator part selecting all builds under a project, including nested subprojects. */
export function projectLocatorPart(projectId: string): string {
  return `affectedProject:(id:${projectId})`;
}

/**
 * Full builds locator: target part + count/filter dimensions.
 * The dimension order matches the pre-existing single-config behavior
 * (`buildType:X,count:N,defaultFilter:false[,status:S]`) so the default
 * path produces byte-identical locators.
 */
export function buildsLocator(
  targetPart: string,
  opts: { count: number; status?: string; sinceDate?: string },
): string {
  let locator = `${targetPart},count:${opts.count},defaultFilter:false`;
  if (opts.status) {
    locator += `,status:${opts.status}`;
  }
  if (opts.sinceDate) {
    locator += `,startDate:(date:${opts.sinceDate},condition:after)`;
  }
  return locator;
}
