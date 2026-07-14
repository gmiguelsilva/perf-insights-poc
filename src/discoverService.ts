import { execFileSync } from "node:child_process";
import fs from "node:fs";
import {
  resolvePersonByGit,
  resolvePersonByGithubLogin,
  type PersonConfig,
  type ResolvedRepoConfig,
  type TrackedConfig,
} from "./config.js";

export interface UnmatchedGitIdentity {
  repoId: string;
  name: string;
  email: string;
  commits: number;
  suggestedPersonId?: string;
  suggestedPersonName?: string;
}

export interface UnmatchedGithubLogin {
  repoId: string;
  login: string;
  contributions: number;
}

export interface DiscoverResult {
  unmatchedGit: UnmatchedGitIdentity[];
  unmatchedGithub: UnmatchedGithubLogin[];
  reposSkipped: string[];
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

/** Distancia de Levenshtein simples - o suficiente pra sugerir "sera que e essa pessoa?" sem precisar de lib externa. */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

export function suggestPerson(people: PersonConfig[], candidateName: string): PersonConfig | undefined {
  let best: { person: PersonConfig; score: number } | undefined;
  for (const person of people) {
    const score = similarity(person.name, candidateName);
    if (!best || score > best.score) best = { person, score };
  }
  return best && best.score >= 0.6 ? best.person : undefined;
}

export function suggestPersonId(name: string): string {
  return normalize(name).slice(0, 20) || "novo-dev";
}

function collectGitAuthors(repoPath: string): { name: string; email: string; commits: number }[] {
  const output = execFileSync("git", ["log", "--format=%an|%ae"], {
    cwd: repoPath,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 32,
  });
  const counts = new Map<string, { name: string; email: string; commits: number }>();
  for (const line of output.split("\n").filter(Boolean)) {
    const [name, email] = line.split("|");
    const key = email.toLowerCase();
    const entry = counts.get(key) ?? { name, email, commits: 0 };
    entry.commits++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.commits - a.commits);
}

function collectGithubContributors(githubRepo: string): { login: string; contributions: number }[] {
  try {
    const raw = execFileSync("gh", ["api", `repos/${githubRepo}/contributors`, "--paginate"], {
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 32,
    });
    return (JSON.parse(raw) as { login: string; contributions: number }[]).sort((a, b) => b.contributions - a.contributions);
  } catch {
    return [];
  }
}

/** Varre os repositorios configurados e lista identidades de commit/PR que ainda nao batem com ninguem em `config`, com sugestao de pessoa por similaridade de nome. */
export function discoverUnmatched(config: TrackedConfig, repos: ResolvedRepoConfig[]): DiscoverResult {
  const unmatchedGit: UnmatchedGitIdentity[] = [];
  const unmatchedGithub: UnmatchedGithubLogin[] = [];
  const reposSkipped: string[] = [];

  for (const repo of repos) {
    if (!fs.existsSync(repo.absolutePath)) {
      reposSkipped.push(repo.id);
      continue;
    }

    for (const author of collectGitAuthors(repo.absolutePath)) {
      if (resolvePersonByGit(config, author.name, author.email)) continue;
      const suggestion = suggestPerson(config.people, author.name);
      unmatchedGit.push({
        repoId: repo.id,
        name: author.name,
        email: author.email,
        commits: author.commits,
        suggestedPersonId: suggestion?.personId,
        suggestedPersonName: suggestion?.name,
      });
    }

    if (repo.github) {
      for (const contributor of collectGithubContributors(repo.github)) {
        if (resolvePersonByGithubLogin(config, contributor.login)) continue;
        unmatchedGithub.push({ repoId: repo.id, login: contributor.login, contributions: contributor.contributions });
      }
    }
  }

  unmatchedGit.sort((a, b) => b.commits - a.commits);
  unmatchedGithub.sort((a, b) => b.contributions - a.contributions);
  return { unmatchedGit, unmatchedGithub, reposSkipped };
}
