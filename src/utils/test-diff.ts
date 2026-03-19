// ── Test Diff Utilities ──────────────────────────────────────────────
//
// Shared utilities for diffing test sets between builds.
// Used by compare_builds, get_green_build_diff_context, and
// get_failed_build_analysis_context.

// ── Types ────────────────────────────────────────────────────────────

export interface TestStatusCounts {
  passed: number;
  failed: number;
  ignored: number;
  total: number;
}

export interface TestStatusMap {
  map: Map<string, string>;
  counts: TestStatusCounts;
}

export interface TestDiffResult {
  newFailures: string[];
  fixedTests: string[];
  sameFailures: string[];
  missingTests: string[];
  newTests: string[];
  becameIgnored: string[];
  becameActive: string[];
}

export interface TestDiffSummary {
  newFailures: number;
  fixedTests: number;
  sameFailures: number;
  missingTests: number;
  newTests: number;
  becameIgnored: number;
  becameActive: number;
}

export interface ClassDiffEntry {
  newFailures: number;
  fixedTests: number;
  sameFailures: number;
  missingTests: number;
  newTests: number;
  delta: string;
  details?: string[];
}

export type ClassGroupedDiff = Record<string, ClassDiffEntry>;

// ── Functions ────────────────────────────────────────────────────────

/**
 * Build a status map from raw TC test occurrences.
 * Expects objects with `name` and `status` fields.
 */
export function buildStatusMap(rawTests: unknown[]): TestStatusMap {
  const map = new Map<string, string>();
  for (const t of rawTests as Array<{ name?: string; status?: string }>) {
    map.set(t.name ?? "", t.status ?? "UNKNOWN");
  }

  const counts: TestStatusCounts = { passed: 0, failed: 0, ignored: 0, total: map.size };
  for (const status of map.values()) {
    if (status === "SUCCESS") counts.passed++;
    else if (status === "FAILURE") counts.failed++;
    else counts.ignored++;
  }

  return { map, counts };
}

/**
 * Compute a full diff between two test status maps.
 */
export function diffTestMaps(current: TestStatusMap, baseline: TestStatusMap): TestDiffResult {
  const newFailures: string[] = [];
  const fixedTests: string[] = [];
  const sameFailures: string[] = [];
  const newTests: string[] = [];
  const missingTests: string[] = [];
  const becameIgnored: string[] = [];
  const becameActive: string[] = [];

  for (const [name, currStatus] of current.map) {
    const baseStatus = baseline.map.get(name);

    if (!baseStatus) {
      newTests.push(name);
      continue;
    }

    if (currStatus === "FAILURE" && baseStatus !== "FAILURE") {
      newFailures.push(name);
    } else if (currStatus === "FAILURE" && baseStatus === "FAILURE") {
      sameFailures.push(name);
    } else if (currStatus !== "FAILURE" && baseStatus === "FAILURE") {
      fixedTests.push(name);
    }

    const currActive = currStatus === "SUCCESS" || currStatus === "FAILURE";
    const baseActive = baseStatus === "SUCCESS" || baseStatus === "FAILURE";
    if (currActive && !baseActive) {
      becameActive.push(name);
    } else if (!currActive && baseActive) {
      becameIgnored.push(name);
    }
  }

  for (const name of baseline.map.keys()) {
    if (!current.map.has(name)) {
      missingTests.push(name);
    }
  }

  return { newFailures, fixedTests, sameFailures, missingTests, newTests, becameIgnored, becameActive };
}

/**
 * Summarize a diff result into counts only.
 */
export function summarizeDiff(diff: TestDiffResult): TestDiffSummary {
  return {
    newFailures: diff.newFailures.length,
    fixedTests: diff.fixedTests.length,
    sameFailures: diff.sameFailures.length,
    missingTests: diff.missingTests.length,
    newTests: diff.newTests.length,
    becameIgnored: diff.becameIgnored.length,
    becameActive: diff.becameActive.length,
  };
}

/**
 * Truncate diff lists to `maxItems`, appending "... and N more" if needed.
 * Used for flat-mode compare_builds output.
 */
export function truncateDiff(
  diff: TestDiffResult,
  maxItems: number,
): Record<string, string[]> {
  const truncate = (list: string[]) =>
    list.length <= maxItems
      ? list
      : [...list.slice(0, maxItems), `... and ${list.length - maxItems} more`];

  return {
    newFailures: truncate(diff.newFailures),
    fixedTests: truncate(diff.fixedTests),
    sameFailures: truncate(diff.sameFailures),
    missingTests: truncate(diff.missingTests),
    newTests: truncate(diff.newTests),
    becameIgnored: truncate(diff.becameIgnored),
    becameActive: truncate(diff.becameActive),
  };
}

/**
 * Extract class name from a fully-qualified test name.
 *
 * Examples:
 *   "com.example.SomeClass.testMethod"  → "SomeClass"
 *   "SomeClass.testMethod"              → "SomeClass"
 *   "testMethod"                        → "testMethod"
 */
export function extractClassName(fqn: string): string {
  const parts = fqn.split(".");
  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }
  return fqn;
}

/**
 * Extract method name (last segment) from a fully-qualified test name.
 */
function extractMethodName(fqn: string): string {
  const parts = fqn.split(".");
  return parts[parts.length - 1];
}

/**
 * Group a test diff by class name, returning per-class deltas.
 *
 * When a class has total changed items ≤ `detailThreshold`, individual
 * method names are included in the `details` array.
 */
export function groupDiffByClass(
  diff: TestDiffResult,
  detailThreshold: number = 10,
): ClassGroupedDiff {
  const groups: Record<string, {
    newFailures: number;
    fixedTests: number;
    sameFailures: number;
    missingTests: number;
    newTests: number;
    methods: string[];
  }> = {};

  const ensure = (cls: string) => {
    if (!groups[cls]) {
      groups[cls] = { newFailures: 0, fixedTests: 0, sameFailures: 0, missingTests: 0, newTests: 0, methods: [] };
    }
    return groups[cls];
  };

  const addAll = (list: string[], category: keyof Omit<typeof groups[string], "methods">) => {
    for (const fqn of list) {
      const cls = extractClassName(fqn);
      const g = ensure(cls);
      g[category]++;
      g.methods.push(extractMethodName(fqn));
    }
  };

  addAll(diff.newFailures, "newFailures");
  addAll(diff.fixedTests, "fixedTests");
  addAll(diff.sameFailures, "sameFailures");
  addAll(diff.missingTests, "missingTests");
  addAll(diff.newTests, "newTests");

  // Build output sorted by total activity descending
  const entries = Object.entries(groups).map(([className, g]) => {
    const total = g.newFailures + g.fixedTests + g.sameFailures + g.missingTests + g.newTests;
    const delta = g.newTests - g.missingTests;
    const deltaStr = delta > 0 ? `+${delta}` : String(delta);

    const entry: ClassDiffEntry = {
      newFailures: g.newFailures,
      fixedTests: g.fixedTests,
      sameFailures: g.sameFailures,
      missingTests: g.missingTests,
      newTests: g.newTests,
      delta: deltaStr,
    };

    // Include method details for small groups
    if (total <= detailThreshold) {
      entry.details = g.methods;
    }

    return { className, entry, total };
  });

  entries.sort((a, b) => b.total - a.total);

  const result: ClassGroupedDiff = {};
  for (const { className, entry } of entries) {
    result[className] = entry;
  }

  return result;
}
