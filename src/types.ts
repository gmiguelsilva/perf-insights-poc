// --- Tipos "legado" de QA/Funcional (fase anterior, personas simuladas) ---
// Mantidos para quando reconectarmos QA/Funcional com dados reais; não são
// usados pelo pipeline atual, que está focado em Dev multi-repo.
export type Role = "dev" | "qa" | "funcional";
export type DataOrigin = "real" | "simulado";

export interface QaIterationMetrics {
  bugsFound: number;
  escapedDefects: number;
  testCasesWritten: number;
  reviewComments: number;
  avgReviewTurnaroundHours: number;
}

export interface FuncionalIterationMetrics {
  requirementsWritten: number;
  clarificationRequests: number;
  reworkCausedPct: number;
  stakeholderApprovalDays: number;
}

export interface PersonIteration {
  iteration: number;
  iterationLabel: string;
  score: number;
  note?: string;
}

export interface PersonSeries {
  personId: string;
  name: string;
  role: Role;
  origin: DataOrigin;
  iterations: PersonIteration[];
  raw: Record<string, unknown>[];
}

// --- Coleta de Git (multi-repo) ---

export interface GitFileChange {
  path: string;
  added: number;
  removed: number;
}

export interface GitCommit {
  repoId: string;
  sha: string;
  shortSha: string;
  authorName: string;
  authorEmail: string;
  personId?: string;
  date: string;
  message: string;
  files: GitFileChange[];
}

export interface CodeQualitySnapshot {
  repoId: string;
  commitSha: string;
  eslintErrors: number;
  eslintWarnings: number;
  filesLinted: number;
  avgComplexity: number;
  maxComplexity: number;
  functionCount: number;
  linesOfCode: number;
}

// --- Coleta de PRs (GitHub) ---

export interface PullRequestData {
  repoId: string;
  number: number;
  title: string;
  url: string;
  authorLogin: string;
  personId?: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewComments: number;
  changesRequestedCount: number;
}

// --- Baseline por repositório (normalização justa entre repos) ---

export interface RepoCommitBaseline {
  n: number;
  meanIssuesPerKloc: number;
  stdIssuesPerKloc: number;
  meanComplexity: number;
  stdComplexity: number;
}

export interface RepoPrBaseline {
  n: number;
  meanTimeToMergeHours: number;
  stdTimeToMergeHours: number;
  meanChangesRequested: number;
  stdChangesRequested: number;
}

export interface RepoBaseline {
  repoId: string;
  commits: RepoCommitBaseline;
  prs?: RepoPrBaseline;
}

// --- Linha do tempo unificada por pessoa (evento = commit ou PR, cross-repo) ---

export interface DevEventBase {
  personId: string;
  repoId: string;
  timestamp: string;
  signal: number; // 0-100, já normalizado contra o baseline do repo
  score: number; // média móvel do signal ao longo da linha do tempo da pessoa
}

export interface CommitDevEvent extends DevEventBase {
  type: "commit";
  sha: string;
  shortSha: string;
  message: string;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  eslintErrors: number;
  eslintWarnings: number;
  issuesPerKloc: number;
  avgComplexity: number;
}

export interface PrDevEvent extends DevEventBase {
  type: "pr";
  number: number;
  title: string;
  url: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewComments: number;
  changesRequestedCount: number;
  timeToMergeHours: number | null;
}

export type DevEvent = CommitDevEvent | PrDevEvent;

export interface PersonDevTimeline {
  personId: string;
  name: string;
  reposTouched: string[];
  events: DevEvent[];
}

export interface RepoSummary {
  id: string;
  github?: string;
  commitCount: number;
  prCount: number;
}

export interface DevReport {
  generatedAt: string;
  repos: RepoSummary[];
  people: PersonDevTimeline[];
  unmatchedIdentities: { repoId: string; authorName: string; authorEmail: string }[];
}
