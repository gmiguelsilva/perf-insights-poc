import { execFileSync } from "node:child_process";
import type { PullRequestData } from "../types.js";
import { resolvePersonByGithubLogin, type TrackedConfig } from "../config.js";

interface GhPrListItem {
  number: number;
}

interface GhPrDetail {
  number: number;
  title: string;
  html_url: string;
  user: { login: string } | null;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  review_comments: number;
}

interface GhReview {
  state: string;
}

function ghApi(args: string[]): string | null {
  try {
    return execFileSync("gh", ["api", ...args], { encoding: "utf-8", maxBuffer: 1024 * 1024 * 32 });
  } catch {
    return null;
  }
}

function ghApiJson<T>(args: string[]): T | null {
  const raw = ghApi(args);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Coleta PRs de um repositorio via `gh api` (precisa de `gh auth login` feito
 * previamente). Tolerante a falhas: repo sem PRs, `gh` indisponivel, ou sem
 * acesso -> devolve lista vazia em vez de derrubar o pipeline inteiro, ja
 * que nem todo repo configurado necessariamente tem PRs (ex: commits diretos
 * na branch principal).
 */
export function collectPullRequests(repoId: string, githubRepo: string, config: TrackedConfig): PullRequestData[] {
  const list = ghApiJson<GhPrListItem[]>([
    `repos/${githubRepo}/pulls`,
    "-X",
    "GET",
    "-f",
    "state=all",
    "-f",
    "per_page=100",
    "--paginate",
  ]);

  if (!list || list.length === 0) return [];

  const prs: PullRequestData[] = [];
  for (const item of list) {
    const detail = ghApiJson<GhPrDetail>([`repos/${githubRepo}/pulls/${item.number}`]);
    if (!detail) continue;

    const reviews = ghApiJson<GhReview[]>([`repos/${githubRepo}/pulls/${item.number}/reviews`]) ?? [];
    const changesRequestedCount = reviews.filter((r) => r.state === "CHANGES_REQUESTED").length;

    const login = detail.user?.login ?? "";
    const person = resolvePersonByGithubLogin(config, login);

    prs.push({
      repoId,
      number: detail.number,
      title: detail.title,
      url: detail.html_url,
      authorLogin: login,
      personId: person?.personId,
      createdAt: detail.created_at,
      mergedAt: detail.merged_at,
      closedAt: detail.closed_at,
      additions: detail.additions,
      deletions: detail.deletions,
      changedFiles: detail.changed_files,
      reviewComments: detail.review_comments,
      changesRequestedCount,
    });
  }

  return prs;
}
