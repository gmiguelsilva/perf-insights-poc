import { execFileSync } from "node:child_process";
import type { GitCommit, GitFileChange } from "../types.js";
import { resolvePersonByGit, type TrackedConfig } from "../config.js";

const COMMIT_MARK = "@@COMMIT@@";

/**
 * Le o historico de um repositorio local via `git log --numstat` (do commit
 * mais antigo para o mais novo), resolve o autor de cada commit para uma
 * pessoa rastreada (por email, depois por nome) e devolve os commits
 * estruturados. Commits de autores nao mapeados no config ficam com
 * `personId` indefinido e sao reportados separadamente pelo chamador.
 */
export function collectCommits(repoId: string, repoPath: string, config: TrackedConfig): GitCommit[] {
  const format = `${COMMIT_MARK}%H|%h|%an|%ae|%aI|%s`;
  const output = execFileSync(
    "git",
    ["log", "--reverse", `--pretty=format:${format}`, "--numstat"],
    { cwd: repoPath, encoding: "utf-8", maxBuffer: 1024 * 1024 * 32 },
  );

  const commits: GitCommit[] = [];
  const blocks = output.split(COMMIT_MARK).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    const [sha, shortSha, authorName, authorEmail, date, ...rest] = lines[0].split("|");
    const message = rest.join("|");

    const files: GitFileChange[] = [];
    for (const line of lines.slice(1)) {
      const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (!match) continue;
      const [, added, removed, path] = match;
      files.push({
        path,
        added: added === "-" ? 0 : Number(added),
        removed: removed === "-" ? 0 : Number(removed),
      });
    }

    const person = resolvePersonByGit(config, authorName, authorEmail);

    commits.push({
      repoId,
      sha,
      shortSha,
      authorName,
      authorEmail,
      personId: person?.personId,
      date,
      message,
      files,
    });
  }

  return commits;
}
