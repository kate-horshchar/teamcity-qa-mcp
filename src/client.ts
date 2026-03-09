// ── TeamCity HTTP Client ────────────────────────────────────────────
//
// Central client for all TeamCity REST API communication.
// Uses Bearer token auth. All methods are read-only.

import type { McpConfig } from "./schemas/common.js";

const REQUEST_TIMEOUT_MS = 30_000;

export class TeamCityClient {
  private baseUrl: string;
  private token: string;
  private config: McpConfig;

  constructor(config: McpConfig) {
    this.baseUrl = config.teamcityUrl;
    this.token = config.teamcityToken;
    this.config = config;
  }

  // ── Generic request helpers ─────────────────────────────────────

  private async fetchJson<T = unknown>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TeamCityApiError(
        `TeamCity API error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return response.json() as Promise<T>;
  }

  private async fetchText(path: string): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "text/plain",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new TeamCityApiError(
        `TeamCity API error: ${response.status} ${response.statusText}`,
        response.status,
        body,
      );
    }

    return response.text();
  }

  // ── Build endpoints ─────────────────────────────────────────────

  /**
   * List recent builds for the configured build type.
   * TC API: GET /app/rest/builds?locator=buildType:{id},count:{n}
   */
  async getBuilds(limit?: number, status?: string): Promise<unknown[]> {
    const count = limit ?? this.config.defaultLookbackBuilds;
    let locator = `buildType:${this.config.buildTypeId},count:${count},defaultFilter:false`;
    if (status) {
      locator += `,status:${status}`;
    }
    const data = await this.fetchJson<{ build?: unknown[] }>(
      `/app/rest/builds?locator=${encodeURIComponent(locator)}&fields=build(id,number,status,state,branchName,startDate,finishDate,queuedDate,statusText,webUrl)`,
    );
    return data.build ?? [];
  }

  /**
   * Get all tests for a build with pagination. Used for compare_builds.
   * TC paginates at ~100-500 items; this collects all pages.
   */
  async getAllTests(buildId: number): Promise<unknown[]> {
    const pageSize = 500;
    let start = 0;
    const allTests: unknown[] = [];

    while (true) {
      const locator = `build:(id:${buildId}),start:${start},count:${pageSize}`;
      const data = await this.fetchJson<{ testOccurrence?: unknown[]; count?: number; nextHref?: string }>(
        `/app/rest/testOccurrences?locator=${encodeURIComponent(locator)}&fields=count,nextHref,testOccurrence(name,status)`,
      );
      const page = data.testOccurrence ?? [];
      allTests.push(...page);

      // Stop if we got less than a full page or no nextHref
      if (page.length < pageSize || !data.nextHref) break;
      start += pageSize;
    }

    return allTests;
  }

  /**
   * Get detailed info for a single build.
   * TC API: GET /app/rest/builds/id:{buildId}
   */
  async getBuild(buildId: number): Promise<unknown> {
    return this.fetchJson(
      `/app/rest/builds/id:${buildId}?fields=id,number,status,state,branchName,startDate,finishDate,queuedDate,statusText,webUrl,buildTypeId,buildType(id),triggered(type,user(username),date),agent(id,name),revisions(revision(version,vcs-branch-name))`,
    );
  }

  // ── Build problems ──────────────────────────────────────────────

  /**
   * Get build problems for a build.
   * TC API: GET /app/rest/problemOccurrences?locator=build:(id:{buildId})
   */
  async getBuildProblems(buildId: number): Promise<unknown[]> {
    const locator = `build:(id:${buildId})`;
    const data = await this.fetchJson<{ problemOccurrence?: unknown[] }>(
      `/app/rest/problemOccurrences?locator=${encodeURIComponent(locator)}&fields=problemOccurrence(id,type,identity,details)`,
    );
    return data.problemOccurrence ?? [];
  }

  // ── Test occurrences ────────────────────────────────────────────

  /**
   * Get failed tests for a build.
   * TC API: GET /app/rest/testOccurrences?locator=build:(id:{buildId}),status:FAILURE
   */
  async getFailedTests(buildId: number): Promise<unknown[]> {
    const locator = `build:(id:${buildId}),status:FAILURE,count:100`;
    const data = await this.fetchJson<{ testOccurrence?: unknown[] }>(
      `/app/rest/testOccurrences?locator=${encodeURIComponent(locator)}&fields=testOccurrence(id,name,status,duration,details,currentlyMuted,currentlyInvestigated)`,
    );
    return data.testOccurrence ?? [];
  }

  /**
   * Get detailed info for a single test occurrence.
   * TC API: GET /app/rest/testOccurrences/{testOccurrenceId}
   *
   * The testOccurrenceId is typically in the format:
   *   build:(id:12345),id:67890
   * or a URL-encoded locator returned by previous calls.
   */
  async getTestOccurrence(testOccurrenceId: string): Promise<unknown> {
    return this.fetchJson(
      `/app/rest/testOccurrences/${encodeURIComponent(testOccurrenceId)}?fields=id,name,status,duration,details,currentlyMuted,currentlyInvestigated,build(id,number),test(name,parsedTestName(testMethodName)),expectedValue,actualValue,metadata`,
    );
  }

  /**
   * Get recent history for a specific test (by test name).
   * TC API: GET /app/rest/testOccurrences?locator=test:(name:{testName}),count:{limit}
   */
  async getTestHistory(testName: string, limit?: number): Promise<unknown[]> {
    const count = limit ?? this.config.defaultLookbackBuilds;
    const locator = `test:(name:${testName}),count:${count}`;
    const data = await this.fetchJson<{ testOccurrence?: unknown[] }>(
      `/app/rest/testOccurrences?locator=${encodeURIComponent(locator)}&fields=testOccurrence(id,name,status,duration,build(id,number,finishDate,startDate))`,
    );
    return data.testOccurrence ?? [];
  }

  // ── Changes ─────────────────────────────────────────────────────

  /**
   * Get changes associated with a build.
   * TC API: GET /app/rest/changes?locator=build:(id:{buildId})
   */
  async getBuildChanges(buildId: number): Promise<unknown[]> {
    const locator = `build:(id:${buildId})`;
    const data = await this.fetchJson<{ change?: unknown[] }>(
      `/app/rest/changes?locator=${encodeURIComponent(locator)}&fields=change(id,version,username,date,comment,files(file(file,changeType)))`,
    );
    return data.change ?? [];
  }

  // ── Build log ───────────────────────────────────────────────────

  /**
   * Download the build log as plain text.
   *
   * IMPORTANT: Uses downloadBuildLog.html endpoint, NOT /app/rest/builds/.../log
   * The REST endpoint is write-oriented and not suitable for log retrieval.
   */
  async downloadBuildLog(buildId: number): Promise<string> {
    return this.fetchText(
      `/downloadBuildLog.html?buildId=${buildId}&plain=true`,
    );
  }

  // ── Convenience ─────────────────────────────────────────────────

  /** Count of failed tests for a build (lightweight). */
  async getFailedTestCount(buildId: number): Promise<number> {
    const locator = `build:(id:${buildId}),status:FAILURE`;
    const data = await this.fetchJson<{ count?: number }>(
      `/app/rest/testOccurrences?locator=${encodeURIComponent(locator)}&fields=count`,
    );
    return data.count ?? 0;
  }

  /** Count of build problems for a build (lightweight). */
  async getBuildProblemCount(buildId: number): Promise<number> {
    const locator = `build:(id:${buildId})`;
    const data = await this.fetchJson<{ count?: number }>(
      `/app/rest/problemOccurrences?locator=${encodeURIComponent(locator)}&fields=count`,
    );
    return data.count ?? 0;
  }

}

// ── Error class ───────────────────────────────────────────────────

export class TeamCityApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = "TeamCityApiError";
  }
}
