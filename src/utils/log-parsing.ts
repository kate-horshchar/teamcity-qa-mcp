// ── Build log parsing utilities ─────────────────────────────────────
//
// These helpers extract relevant portions of a plain-text build log.
// The goal is to return compact, useful excerpts rather than raw logs.

const ERROR_PATTERNS = [
  /\bERROR\b/i,
  /\bFAILED\b/i,
  /\bFAILURE\b/i,
  /\bException\b/,
  /\bAssertionError\b/,
  /\bAssertionFailedError\b/,
  /\bComparisonFailure\b/,
  /\bNullPointerException\b/,
  /\bTimeoutException\b/,
  /\bBuild failed\b/i,
  /\bProcess exited with code [^0]\b/,
  /\bfatal:/i,
  /\bpanic:/i,
];

export interface LogExcerpt {
  available: true;
  totalLines: number;
  excerptLines: number;
  tail: string;
  errorWindows: ErrorWindow[];
}

export interface LogUnavailable {
  available: false;
  reason: string;
  fallbackSuggestion: string;
}

export interface ErrorWindow {
  lineStart: number;
  lineEnd: number;
  matchedPattern: string;
  content: string;
}

export type LogExcerptResult = LogExcerpt | LogUnavailable;

/**
 * Extract a compact excerpt from a plain-text build log.
 *
 * Strategy:
 * 1. Always include the tail N lines (configurable).
 * 2. Scan for error patterns and extract context windows around each match.
 * 3. Deduplicate overlapping windows.
 * 4. Return both the tail and error windows.
 */
export function extractLogExcerpt(
  fullLog: string,
  tailLines: number = 200,
  windowRadius: number = 5,
  maxExcerptChars: number = 15000,
): LogExcerpt {
  const lines = fullLog.split("\n");
  const totalLines = lines.length;

  // Tail extraction
  const tailStart = Math.max(0, totalLines - tailLines);
  const tail = lines.slice(tailStart).join("\n").slice(0, maxExcerptChars);

  // Error windows
  const rawWindows: ErrorWindow[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(lines[i])) {
        const lineStart = Math.max(0, i - windowRadius);
        const lineEnd = Math.min(lines.length - 1, i + windowRadius);
        rawWindows.push({
          lineStart,
          lineEnd,
          matchedPattern: pattern.source,
          content: lines.slice(lineStart, lineEnd + 1).join("\n"),
        });
        break; // One pattern match per line is enough
      }
    }
  }

  // Merge overlapping windows
  const errorWindows = mergeWindows(rawWindows, lines);

  // Truncate if total content is too large
  let totalChars = tail.length;
  const trimmedWindows: ErrorWindow[] = [];
  for (const w of errorWindows) {
    if (totalChars + w.content.length > maxExcerptChars) break;
    totalChars += w.content.length;
    trimmedWindows.push(w);
  }

  return {
    available: true,
    totalLines,
    excerptLines: tailLines,
    tail,
    errorWindows: trimmedWindows,
  };
}

function mergeWindows(windows: ErrorWindow[], lines: string[]): ErrorWindow[] {
  if (windows.length === 0) return [];

  // Sort by lineStart
  const sorted = [...windows].sort((a, b) => a.lineStart - b.lineStart);
  const merged: ErrorWindow[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.lineStart <= current.lineEnd + 1) {
      // Overlapping or adjacent — merge
      current.lineEnd = Math.max(current.lineEnd, next.lineEnd);
      current.matchedPattern += `, ${next.matchedPattern}`;
    } else {
      current.content = lines.slice(current.lineStart, current.lineEnd + 1).join("\n");
      merged.push(current);
      current = { ...next };
    }
  }
  current.content = lines.slice(current.lineStart, current.lineEnd + 1).join("\n");
  merged.push(current);

  return merged;
}

// ── Log search ──────────────────────────────────────────────────────

export interface LogSearchResult {
  available: true;
  totalLines: number;
  pattern: string;
  totalMatches: number;
  returnedMatches: number;
  matches: LogSearchMatch[];
  truncated: boolean;
}

export interface LogSearchMatch {
  lineNumber: number;
  matchedLine: string;
  context: string;
  contextLineStart: number;
  contextLineEnd: number;
}

/**
 * Search a build log with a regex pattern and return matches with context.
 * Similar to `grep -C` but for build logs.
 */
export function searchLog(
  fullLog: string,
  pattern: string,
  contextLines: number = 3,
  maxMatches: number = 50,
  maxChars: number = 30000,
): LogSearchResult {
  const regex = new RegExp(pattern, "i");
  const lines = fullLog.split("\n");
  const totalLines = lines.length;

  // Find all matching line indices
  const matchIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matchIndices.push(i);
    }
  }

  const totalMatches = matchIndices.length;

  // Build context windows for matches (up to maxMatches), merging overlaps
  const limited = matchIndices.slice(0, maxMatches);
  const matches: LogSearchMatch[] = [];
  let totalCharsUsed = 0;
  let truncated = matchIndices.length > maxMatches;

  // Merge overlapping context windows
  let i = 0;
  while (i < limited.length) {
    let windowStart = Math.max(0, limited[i] - contextLines);
    let windowEnd = Math.min(lines.length - 1, limited[i] + contextLines);
    const firstMatchIdx = limited[i];

    // Merge with subsequent overlapping windows
    let j = i + 1;
    while (j < limited.length && limited[j] - contextLines <= windowEnd + 1) {
      windowEnd = Math.min(lines.length - 1, limited[j] + contextLines);
      j++;
    }

    const context = lines.slice(windowStart, windowEnd + 1).join("\n");
    if (totalCharsUsed + context.length > maxChars) {
      truncated = true;
      break;
    }
    totalCharsUsed += context.length;

    matches.push({
      lineNumber: firstMatchIdx + 1, // 1-based
      matchedLine: lines[firstMatchIdx],
      context,
      contextLineStart: windowStart + 1,
      contextLineEnd: windowEnd + 1,
    });

    i = j;
  }

  return {
    available: true,
    totalLines,
    pattern,
    totalMatches,
    returnedMatches: matches.length,
    matches,
    truncated,
  };
}

// ── Graceful degradation ────────────────────────────────────────────

/**
 * Return a "log unavailable" response for graceful degradation.
 */
export function logUnavailable(reason: string): LogUnavailable {
  return {
    available: false,
    reason,
    fallbackSuggestion: "Rely on build problems and failed tests for failure analysis.",
  };
}
