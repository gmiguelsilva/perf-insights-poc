export type Role = "dev" | "qa" | "funcional";

export type DataOrigin = "real" | "simulado";

export interface GitFileChange {
  path: string;
  added: number;
  removed: number;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  date: string;
  message: string;
  files: GitFileChange[];
}

export interface CodeQualitySnapshot {
  commitSha: string;
  eslintErrors: number;
  eslintWarnings: number;
  filesLinted: number;
  avgComplexity: number;
  maxComplexity: number;
  functionCount: number;
  linesOfCode: number;
}

export interface DevIterationMetrics {
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
  eslintErrors: number;
  eslintWarnings: number;
  issuesPerKloc: number;
  avgComplexity: number;
  maxComplexity: number;
}

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

export type IterationMetrics =
  | { role: "dev"; metrics: DevIterationMetrics }
  | { role: "qa"; metrics: QaIterationMetrics }
  | { role: "funcional"; metrics: FuncionalIterationMetrics };

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

export interface AggregatedReport {
  generatedAt: string;
  sourceRepo: string;
  people: PersonSeries[];
}
