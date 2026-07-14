import type {
  AggregatedReport,
  CodeQualitySnapshot,
  DevIterationMetrics,
  FuncionalIterationMetrics,
  GitCommit,
  PersonSeries,
  QaIterationMetrics,
} from "./types.js";
import {
  FUNCIONAL_PERSONAS,
  QA_PERSONAS,
  generateFuncionalMetrics,
  generateQaMetrics,
} from "./synthetic/personas.js";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Mapeia um valor para 0-100 dentro de [min,max]; `invert=true` quando "menor e melhor". */
function scoreFromRange(value: number, min: number, max: number, invert = false): number {
  const t = (value - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, t));
  const normalized = invert ? 1 - clamped : clamped;
  return normalized * 100;
}

function buildDevIterations(commits: GitCommit[], snapshots: CodeQualitySnapshot[]) {
  return commits.map((commit, i) => {
    const snap = snapshots[i];
    const linesAdded = commit.files.reduce((sum, f) => sum + f.added, 0);
    const linesRemoved = commit.files.reduce((sum, f) => sum + f.removed, 0);
    const kloc = Math.max(snap.linesOfCode / 1000, 0.1);
    const issuesPerKloc = Number(((snap.eslintErrors + snap.eslintWarnings) / kloc).toFixed(2));

    const metrics: DevIterationMetrics = {
      linesAdded,
      linesRemoved,
      filesChanged: commit.files.length,
      eslintErrors: snap.eslintErrors,
      eslintWarnings: snap.eslintWarnings,
      issuesPerKloc,
      avgComplexity: snap.avgComplexity,
      maxComplexity: snap.maxComplexity,
    };

    const issuesScore = scoreFromRange(issuesPerKloc, 0, 40, true);
    const complexityScore = scoreFromRange(metrics.avgComplexity, 1, 10, true);
    const score = clampScore(issuesScore * 0.6 + complexityScore * 0.4);

    return {
      iteration: i,
      iterationLabel: `Iteração ${i + 1}`,
      score,
      note: commit.message,
      metrics,
    };
  });
}

function scoreQa(metrics: QaIterationMetrics): number {
  const escapedScore = scoreFromRange(metrics.escapedDefects, 0, 10, true);
  const bugsFoundScore = scoreFromRange(metrics.bugsFound, 0, 20, false);
  const turnaroundScore = scoreFromRange(metrics.avgReviewTurnaroundHours, 2, 24, true);
  return clampScore(escapedScore * 0.4 + bugsFoundScore * 0.3 + turnaroundScore * 0.3);
}

function scoreFuncional(metrics: FuncionalIterationMetrics): number {
  const reworkScore = scoreFromRange(metrics.reworkCausedPct, 0, 30, true);
  const clarificationScore = scoreFromRange(metrics.clarificationRequests, 0, 8, true);
  const approvalScore = scoreFromRange(metrics.stakeholderApprovalDays, 0.5, 5, true);
  return clampScore(reworkScore * 0.4 + clarificationScore * 0.3 + approvalScore * 0.3);
}

export function buildAggregatedReport(
  sourceRepo: string,
  commits: GitCommit[],
  snapshots: CodeQualitySnapshot[],
): AggregatedReport {
  const totalIterations = commits.length;
  const people: PersonSeries[] = [];

  const devAuthor = commits[0]?.author ?? "Desenvolvedor";
  const devIterations = buildDevIterations(commits, snapshots);
  people.push({
    personId: "dev-main",
    name: `${devAuthor} (Dev)`,
    role: "dev",
    origin: "real",
    iterations: devIterations.map(({ metrics: _metrics, ...rest }) => rest),
    raw: devIterations.map((it) => it.metrics as unknown as Record<string, unknown>),
  });

  for (const persona of QA_PERSONAS) {
    const rawMetrics = generateQaMetrics(persona, totalIterations);
    people.push({
      personId: persona.personId,
      name: persona.name,
      role: "qa",
      origin: "simulado",
      iterations: rawMetrics.map((metrics, i) => ({
        iteration: i,
        iterationLabel: `Iteração ${i + 1}`,
        score: scoreQa(metrics),
      })),
      raw: rawMetrics as unknown as Record<string, unknown>[],
    });
  }

  for (const persona of FUNCIONAL_PERSONAS) {
    const rawMetrics = generateFuncionalMetrics(persona, totalIterations);
    people.push({
      personId: persona.personId,
      name: persona.name,
      role: "funcional",
      origin: "simulado",
      iterations: rawMetrics.map((metrics, i) => ({
        iteration: i,
        iterationLabel: `Iteração ${i + 1}`,
        score: scoreFuncional(metrics),
      })),
      raw: rawMetrics as unknown as Record<string, unknown>[],
    });
  }

  return { generatedAt: new Date().toISOString(), sourceRepo, people };
}
