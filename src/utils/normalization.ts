import type { BuildCard, BuildDetail, ChangeCard } from "../schemas/build.js";
import type { FailedTestCard, TestFailureDetail, TestHistoryEntry, TestOccurrenceCard } from "../schemas/test.js";
import type { BuildProblemCard } from "../schemas/problem.js";
import { extractClassName } from "./test-diff.js";

// ── TeamCity raw types (loose) ──────────────────────────────────────
// We intentionally use `any` for raw TC payloads since the API shape
// can vary across versions. Normalization functions handle missing fields.

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Build normalization ─────────────────────────────────────────────

export function normalizeBuildCard(raw: any): BuildCard {
  return {
    buildId: raw.id,
    buildNumber: raw.number ?? String(raw.id),
    status: raw.status ?? "UNKNOWN",
    state: raw.state ?? "unknown",
    branchName: raw.branchName ?? undefined,
    startDate: raw.startDate ?? undefined,
    finishDate: raw.finishDate ?? undefined,
    queuedDate: raw.queuedDate ?? undefined,
    statusText: raw.statusText ?? undefined,
    webUrl: raw.webUrl ?? undefined,
  };
}

export function normalizeBuildDetail(raw: any): BuildDetail {
  const card = normalizeBuildCard(raw);
  return {
    ...card,
    buildTypeId: raw.buildTypeId ?? raw.buildType?.id ?? "",
    triggered: raw.triggered
      ? {
          type: raw.triggered.type ?? "unknown",
          user: raw.triggered.user?.username ?? undefined,
          date: raw.triggered.date ?? undefined,
        }
      : undefined,
    agent: raw.agent
      ? { name: raw.agent.name, id: raw.agent.id }
      : undefined,
    revisions: raw.revisions?.revision?.map((r: any) => ({
      version: r.version,
      vcsBranchName: r["vcs-branch-name"] ?? r.vcsBranchName ?? undefined,
    })) ?? undefined,
  };
}

// ── Build problem normalization ─────────────────────────────────────

export function normalizeBuildProblem(raw: any): BuildProblemCard {
  return {
    id: raw.id ?? "",
    type: raw.type ?? raw.problemType ?? "UNKNOWN",
    identity: raw.identity ?? "",
    details: raw.details ?? raw.description ?? "",
  };
}

// ── Test normalization ──────────────────────────────────────────────

export function normalizeFailedTest(raw: any): FailedTestCard {
  return {
    id: raw.id ?? "",
    testName: raw.name ?? raw.test?.name ?? "unknown",
    status: raw.status ?? "UNKNOWN",
    duration: raw.duration != null ? Number(raw.duration) / 1000 : undefined, // TC returns ms
    details: raw.details ?? undefined,
    currentlyMuted: raw.currentlyMuted ?? undefined,
    currentlyInvestigated: raw.currentlyInvestigated ?? undefined,
  };
}

export function normalizeTestFailureDetail(raw: any): TestFailureDetail {
  return {
    id: raw.id ?? "",
    testName: raw.name ?? raw.test?.name ?? "unknown",
    status: raw.status ?? "UNKNOWN",
    duration: raw.duration != null ? Number(raw.duration) / 1000 : undefined,
    failureMessage: raw.details ?? undefined,
    stackTrace: raw.test?.parsedTestName?.testMethodName
      ? undefined
      : extractStackTrace(raw.details),
    expectedValue: raw.expectedValue ?? undefined,
    actualValue: raw.actualValue ?? undefined,
    buildId: raw.build?.id ?? 0,
    currentlyMuted: raw.currentlyMuted ?? undefined,
    currentlyInvestigated: raw.currentlyInvestigated ?? undefined,
    metadata: raw.metadata ?? undefined,
  };
}

export function normalizeTestHistoryEntry(raw: any): TestHistoryEntry {
  return {
    buildId: raw.build?.id ?? 0,
    buildNumber: raw.build?.number ?? "",
    date: raw.build?.finishDate ?? raw.build?.startDate ?? "",
    status: raw.status ?? "UNKNOWN",
    duration: raw.duration != null ? Number(raw.duration) / 1000 : undefined,
  };
}

export function normalizeTestOccurrence(raw: any): TestOccurrenceCard {
  const testName = raw.name ?? "";
  return {
    testName,
    status: raw.status ?? "UNKNOWN",
    duration: raw.duration != null ? Number(raw.duration) / 1000 : undefined,
    className: extractClassName(testName),
  };
}

// ── Change normalization ────────────────────────────────────────────

export function normalizeChange(raw: any): ChangeCard {
  return {
    id: raw.id ?? 0,
    version: raw.version ?? "",
    username: raw.username ?? raw.user?.username ?? "unknown",
    date: raw.date ?? "",
    comment: raw.comment ?? "",
    files: raw.files?.file?.map((f: any) => ({
      path: f.file ?? f["relative-file"] ?? f.name ?? "",
      changeType: f.changeType ?? "unknown",
    })) ?? undefined,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function extractStackTrace(details?: string): string | undefined {
  if (!details) return undefined;
  // Look for common stack trace indicators
  const stackIdx = details.indexOf("\tat ");
  if (stackIdx === -1) {
    const atIdx = details.indexOf("   at ");
    if (atIdx === -1) return undefined;
    return details.slice(atIdx).slice(0, 3000);
  }
  return details.slice(stackIdx).slice(0, 3000);
}
