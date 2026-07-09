// ── Compact build shapes returned by tools ──────────────────────────

export interface BuildCard {
  buildId: number;
  buildNumber: string;
  status: string;          // SUCCESS | FAILURE | ERROR | UNKNOWN
  state: string;           // queued | running | finished
  buildTypeId?: string;
  branchName?: string;
  startDate?: string;
  finishDate?: string;
  queuedDate?: string;
  statusText?: string;
  webUrl?: string;
}

export interface BuildDetail extends BuildCard {
  buildTypeId: string;
  triggered?: {
    type: string;
    user?: string;
    date?: string;
  };
  agent?: {
    name: string;
    id: number;
  };
  properties?: Record<string, string>;
  revisions?: Array<{ version: string; vcsBranchName?: string }>;
}

export interface BuildStatusSummary {
  buildId: number;
  status: string;
  state: string;
  statusText?: string;
  finishDate?: string;
}

export interface BuildSummaryCard {
  build: BuildCard;
  problemCount: number;
  failedTestCount: number;
}

// ── Build configuration shapes ──────────────────────────────────────

export interface BuildTypeCard {
  buildTypeId: string;
  name: string;
  projectId: string;
  projectName: string;
  paused?: boolean;
  webUrl?: string;
}

// ── Change shapes ───────────────────────────────────────────────────

export interface ChangeCard {
  id: number;
  version: string;
  username: string;
  date: string;
  comment: string;
  files?: Array<{ path: string; changeType: string }>;
}
