// ── Test occurrence shapes ───────────────────────────────────────────

export interface FailedTestCard {
  id: string;              // testOccurrence id / locator
  testName: string;
  status: string;
  duration?: number;       // seconds
  details?: string;        // short failure message
  currentlyMuted?: boolean;
  currentlyInvestigated?: boolean;
}

export interface TestFailureDetail {
  id: string;
  testName: string;
  status: string;
  duration?: number;
  failureMessage?: string;
  stackTrace?: string;
  expectedValue?: string;
  actualValue?: string;
  buildId: number;
  currentlyMuted?: boolean;
  currentlyInvestigated?: boolean;
  metadata?: Record<string, unknown>;
}

export interface TestHistoryEntry {
  buildId: number;
  buildNumber: string;
  date: string;
  status: string;
  duration?: number;
}
