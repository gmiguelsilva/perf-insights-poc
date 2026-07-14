import type { CodeQualitySnapshot, PullRequestData, RepoCommitBaseline, RepoPrBaseline } from "../types.js";

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

function zScore(value: number, mean: number, std: number): number {
  return std > 0 ? (value - mean) / std : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function issuesPerKloc(snapshot: CodeQualitySnapshot): number {
  return (snapshot.eslintErrors + snapshot.eslintWarnings) / Math.max(snapshot.linesOfCode / 1000, 0.1);
}

/**
 * Baseline de qualidade de codigo do repositorio inteiro (media/desvio-padrao
 * de issues/KLOC e complexidade entre todos os commits analisados). E contra
 * isso que cada commit e comparado - assim um repo legado naturalmente mais
 * complexo nao penaliza injustamente quem trabalha nele.
 */
export function computeCommitBaseline(snapshots: CodeQualitySnapshot[]): RepoCommitBaseline {
  const issues = snapshots.map(issuesPerKloc);
  const complexity = snapshots.map((s) => s.avgComplexity);
  const issuesStats = meanStd(issues);
  const complexityStats = meanStd(complexity);
  return {
    n: snapshots.length,
    meanIssuesPerKloc: issuesStats.mean,
    stdIssuesPerKloc: issuesStats.std,
    meanComplexity: complexityStats.mean,
    stdComplexity: complexityStats.std,
  };
}

/** Baseline de PRs do repo (tempo de merge e churn de review), so com PRs de fato mergeados. */
export function computePrBaseline(prs: PullRequestData[]): RepoPrBaseline | undefined {
  const merged = prs.filter((p) => p.mergedAt);
  if (merged.length < 2) return undefined; // amostra pequena demais pra um desvio-padrao significativo

  const timeToMerge = merged.map(
    (p) => (new Date(p.mergedAt as string).getTime() - new Date(p.createdAt).getTime()) / 3_600_000,
  );
  const changesRequested = merged.map((p) => p.changesRequestedCount);
  const timeStats = meanStd(timeToMerge);
  const crStats = meanStd(changesRequested);

  return {
    n: merged.length,
    meanTimeToMergeHours: timeStats.mean,
    stdTimeToMergeHours: timeStats.std,
    meanChangesRequested: crStats.mean,
    stdChangesRequested: crStats.std,
  };
}

/**
 * Converte um snapshot de commit num "signal" 0-100 relativo ao proprio
 * historico do repo: 50 = igual a media do repo; acima de 50 = melhor que a
 * media (menos issues/menos complexo); abaixo = pior que a media.
 */
export function commitSignal(snapshot: CodeQualitySnapshot, baseline: RepoCommitBaseline): number {
  const issuesZ = zScore(issuesPerKloc(snapshot), baseline.meanIssuesPerKloc, baseline.stdIssuesPerKloc);
  const complexityZ = zScore(snapshot.avgComplexity, baseline.meanComplexity, baseline.stdComplexity);
  return clamp(50 - (issuesZ * 0.6 + complexityZ * 0.4) * 15, 0, 100);
}

/** Mesma ideia para PRs: velocidade de merge + churn de review, relativos ao repo. Sem baseline (poucos PRs), devolve null. */
export function prSignal(pr: PullRequestData, baseline: RepoPrBaseline | undefined): number | null {
  if (!baseline || !pr.mergedAt) return null;
  const timeToMergeHours = (new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / 3_600_000;
  const speedZ = zScore(timeToMergeHours, baseline.meanTimeToMergeHours, baseline.stdTimeToMergeHours);
  const reworkZ = zScore(pr.changesRequestedCount, baseline.meanChangesRequested, baseline.stdChangesRequested);
  return clamp(50 - (speedZ * 0.5 + reworkZ * 0.5) * 15, 0, 100);
}
