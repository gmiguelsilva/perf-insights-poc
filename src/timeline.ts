import type {
  CodeQualitySnapshot,
  CommitDevEvent,
  DevEvent,
  GitCommit,
  PersonDevTimeline,
  PrDevEvent,
  PullRequestData,
  RepoBaseline,
} from "./types.js";
import type { PersonConfig } from "./config.js";
import { commitSignal, prSignal } from "./analyzers/repoBaseline.js";

const ROLLING_WINDOW = 5;

interface RepoData {
  repoId: string;
  commits: GitCommit[];
  snapshots: CodeQualitySnapshot[];
  prs: PullRequestData[];
  baseline: RepoBaseline;
}

function commitToEvent(commit: GitCommit, snapshot: CodeQualitySnapshot, baseline: RepoBaseline): CommitDevEvent {
  const linesAdded = commit.files.reduce((s, f) => s + f.added, 0);
  const linesRemoved = commit.files.reduce((s, f) => s + f.removed, 0);
  const kloc = Math.max(snapshot.linesOfCode / 1000, 0.1);

  return {
    type: "commit",
    personId: commit.personId as string,
    repoId: commit.repoId,
    timestamp: commit.date,
    sha: commit.sha,
    shortSha: commit.shortSha,
    message: commit.message,
    linesAdded,
    linesRemoved,
    filesChanged: commit.files.length,
    eslintErrors: snapshot.eslintErrors,
    eslintWarnings: snapshot.eslintWarnings,
    issuesPerKloc: Number(((snapshot.eslintErrors + snapshot.eslintWarnings) / kloc).toFixed(2)),
    avgComplexity: snapshot.avgComplexity,
    signal: Number(commitSignal(snapshot, baseline.commits).toFixed(1)),
    score: 0, // preenchido depois, na media movel
  };
}

function prToEvent(pr: PullRequestData, baseline: RepoBaseline): PrDevEvent | undefined {
  const signal = prSignal(pr, baseline.prs);
  if (signal === null) return undefined;

  const timeToMergeHours = pr.mergedAt
    ? Number(((new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / 3_600_000).toFixed(1))
    : null;

  return {
    type: "pr",
    personId: pr.personId as string,
    repoId: pr.repoId,
    timestamp: pr.mergedAt ?? pr.createdAt,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    reviewComments: pr.reviewComments,
    changesRequestedCount: pr.changesRequestedCount,
    timeToMergeHours,
    signal: Number(signal.toFixed(1)),
    score: 0,
  };
}

/**
 * Junta commits + PRs de todos os repositorios configurados numa unica linha
 * do tempo cronologica por pessoa, e calcula um score de media movel sobre
 * essa sequencia. Isso e o que permite comparar/enxergar evolucao mesmo
 * quando a pessoa contribui em varios repositorios com ritmos diferentes -
 * a unidade de "iteracao" passa a ser "o proximo evento de trabalho dessa
 * pessoa", nao um commit de um repo especifico nem uma janela de calendario.
 */
export function buildPersonTimelines(people: PersonConfig[], repoData: RepoData[]): PersonDevTimeline[] {
  const eventsByPerson = new Map<string, DevEvent[]>();

  for (const repo of repoData) {
    repo.commits.forEach((commit, i) => {
      if (!commit.personId) return;
      const snapshot = repo.snapshots[i];
      const event = commitToEvent(commit, snapshot, repo.baseline);
      const list = eventsByPerson.get(commit.personId) ?? [];
      list.push(event);
      eventsByPerson.set(commit.personId, list);
    });

    for (const pr of repo.prs) {
      if (!pr.personId) continue;
      const event = prToEvent(pr, repo.baseline);
      if (!event) continue;
      const list = eventsByPerson.get(pr.personId) ?? [];
      list.push(event);
      eventsByPerson.set(pr.personId, list);
    }
  }

  const timelines: PersonDevTimeline[] = [];
  for (const person of people) {
    const events = (eventsByPerson.get(person.personId) ?? []).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    events.forEach((event, i) => {
      const windowStart = Math.max(0, i - ROLLING_WINDOW + 1);
      const window = events.slice(windowStart, i + 1);
      const avg = window.reduce((s, e) => s + e.signal, 0) / window.length;
      event.score = Math.round(avg);
    });

    timelines.push({
      personId: person.personId,
      name: person.name,
      reposTouched: [...new Set(events.map((e) => e.repoId))],
      events,
    });
  }

  return timelines;
}

export type { RepoData };
