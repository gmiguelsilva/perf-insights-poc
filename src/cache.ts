import fs from "node:fs";
import path from "node:path";
import type { CodeQualitySnapshot } from "./types.js";

export type RepoCache = Record<string, CodeQualitySnapshot>;

function cacheFile(cacheDir: string, repoId: string): string {
  return path.join(cacheDir, `${repoId}.json`);
}

/** Snapshots de commits ja analisados numa run anterior, por sha. Analise de codigo (worktree + ESLint) e cara; sem isso, repos com muito historico ficam inviaveis de rodar toda hora. */
export function loadRepoCache(cacheDir: string, repoId: string): RepoCache {
  const file = cacheFile(cacheDir, repoId);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as RepoCache;
  } catch {
    return {};
  }
}

export function saveRepoCache(cacheDir: string, repoId: string, cache: RepoCache): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile(cacheDir, repoId), JSON.stringify(cache, null, 2), "utf-8");
}
