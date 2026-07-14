import { execFileSync } from "node:child_process";
import type { GitCommit, GitFileChange } from "../types.js";

const COMMIT_MARK = "@@COMMIT@@";

/**
 * Le o historico de um repositorio local via `git log --numstat` (do commit
 * mais antigo para o mais novo) e devolve uma lista estruturada de commits
 * com as linhas adicionadas/removidas por arquivo.
 */
export function collectCommits(repoPath: string): GitCommit[] {
  const format = `${COMMIT_MARK}%H|%h|%an|%aI|%s`;
  const output = execFileSync(
    "git",
    ["log", "--reverse", `--pretty=format:${format}`, "--numstat"],
    { cwd: repoPath, encoding: "utf-8", maxBuffer: 1024 * 1024 * 32 },
  );

  const commits: GitCommit[] = [];
  const blocks = output.split(COMMIT_MARK).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.length > 0);
    const [sha, shortSha, author, date, ...rest] = lines[0].split("|");
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

    commits.push({ sha, shortSha, author, date, message, files });
  }

  return commits;
}
