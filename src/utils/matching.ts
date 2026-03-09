// ── Failure clustering and cross-build matching ─────────────────────

export interface FailureCluster {
  rootCause: string;
  exceptionType: string | null;
  count: number;
  testNames: string[];
}

/**
 * Extract root cause from failure details — first line before stack trace.
 */
export function extractRootCause(details: string): string {
  if (!details) return "Unknown";
  // Take first line (before \n\tat or \n   at)
  const firstLine = details.split(/\n\s*at\s/)[0].trim();
  // Truncate if too long
  return firstLine.length > 300 ? firstLine.slice(0, 300) + "..." : firstLine;
}

/**
 * Extract exception type from failure message.
 * Matches patterns like "com.example.SomeException" or just "SomeException".
 */
export function extractExceptionType(details: string): string | null {
  if (!details) return null;
  // Match fully-qualified or simple exception/error names
  const match = details.match(/([a-zA-Z_$][a-zA-Z0-9_$.]*(?:Exception|Error|Failure))/);
  return match ? match[1] : null;
}

/**
 * Cluster failed tests by root cause.
 * Groups tests that share the same first-line error message.
 */
export function clusterByRootCause(
  tests: Array<{ testName: string; details: string }>,
): FailureCluster[] {
  const clusterMap = new Map<string, FailureCluster>();

  for (const test of tests) {
    const rootCause = extractRootCause(test.details);
    const existing = clusterMap.get(rootCause);

    if (existing) {
      existing.count++;
      existing.testNames.push(test.testName);
    } else {
      clusterMap.set(rootCause, {
        rootCause,
        exceptionType: extractExceptionType(test.details),
        count: 1,
        testNames: [test.testName],
      });
    }
  }

  // Sort by count descending
  return Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
}

/**
 * Check if a failure message matches a search query.
 * Supports matching by exception type or message fragment.
 */
export function matchesFailurePattern(
  details: string,
  exceptionType?: string,
  messageFragment?: string,
): boolean {
  if (!details) return false;

  if (exceptionType) {
    const extracted = extractExceptionType(details);
    if (extracted && extracted.toLowerCase().includes(exceptionType.toLowerCase())) {
      return true;
    }
  }

  if (messageFragment) {
    if (details.toLowerCase().includes(messageFragment.toLowerCase())) {
      return true;
    }
  }

  return false;
}
