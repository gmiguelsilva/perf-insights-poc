import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { analyzeFileComplexity } from "./complexity.js";
import type { CodeQualitySnapshot, GitCommit } from "../types.js";

const LINTABLE_EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);
const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "build", "out", ".worktrees"]);

interface EslintMessage {
  severity: number;
}
interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
}

function walkLintableFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (LINTABLE_EXT.has(path.extname(entry.name))) {
        results.push(full);
      }
    }
  }
  return results;
}

function runEslint(worktreePath: string, mainRepoPath: string): { errors: number; warnings: number; filesLinted: number } {
  const eslintBin = path.join(mainRepoPath, "node_modules", "eslint", "bin", "eslint.js");
  let stdout = "";
  try {
    stdout = execFileSync(
      process.execPath,
      [eslintBin, ".", "--format", "json", "--no-error-on-unmatched-pattern"],
      { cwd: worktreePath, encoding: "utf-8", maxBuffer: 1024 * 1024 * 64 },
    );
  } catch (err) {
    // ESLint sai com codigo 1 quando ha erros de lint - stdout ainda contem o JSON.
    const execErr = err as { stdout?: string };
    stdout = execErr.stdout ?? "";
  }

  if (!stdout.trim()) return { errors: 0, warnings: 0, filesLinted: 0 };

  const results = JSON.parse(stdout) as EslintFileResult[];
  let errors = 0;
  let warnings = 0;
  for (const file of results) {
    for (const msg of file.messages) {
      if (msg.severity === 2) errors++;
      else if (msg.severity === 1) warnings++;
    }
  }
  return { errors, warnings, filesLinted: results.length };
}

function analyzeComplexityForTree(worktreePath: string) {
  const files = walkLintableFiles(worktreePath);
  let functionCount = 0;
  let totalComplexity = 0;
  let maxComplexity = 0;
  let linesOfCode = 0;

  for (const file of files) {
    const text = fs.readFileSync(file, "utf-8");
    const result = analyzeFileComplexity(file, text);
    functionCount += result.functionCount;
    totalComplexity += result.totalComplexity;
    maxComplexity = Math.max(maxComplexity, result.maxComplexity);
    linesOfCode += result.linesOfCode;
  }

  return {
    functionCount,
    avgComplexity: functionCount ? totalComplexity / functionCount : 1,
    maxComplexity,
    linesOfCode,
  };
}

/**
 * Para cada commit, cria um `git worktree` isolado no estado exato daquele
 * commit, aponta node_modules para a instalacao ja existente do repo
 * principal (via junction do Windows, sem precisar reinstalar dependencias
 * por commit) e roda ESLint + a analise de complexidade sobre a arvore
 * inteira naquele ponto no tempo. Isso mede a saude do codigo-fonte como um
 * todo a cada iteracao, nao so o diff daquele commit.
 */
export function analyzeCommitsCodeQuality(repoId: string, repoPath: string, commits: GitCommit[]): CodeQualitySnapshot[] {
  const worktreesRoot = path.join(os.tmpdir(), "perf-insights-poc-worktrees");
  fs.mkdirSync(worktreesRoot, { recursive: true });
  const mainNodeModules = path.join(repoPath, "node_modules");

  const snapshots: CodeQualitySnapshot[] = [];

  for (const commit of commits) {
    const worktreePath = path.join(worktreesRoot, `${repoId}-${commit.shortSha}`);

    if (fs.existsSync(worktreePath)) {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
    execFileSync("git", ["worktree", "add", "--detach", worktreePath, commit.sha], {
      cwd: repoPath,
      encoding: "utf-8",
    });

    const worktreeNodeModules = path.join(worktreePath, "node_modules");
    fs.symlinkSync(mainNodeModules, worktreeNodeModules, "junction");

    try {
      const lint = runEslint(worktreePath, repoPath);
      const complexity = analyzeComplexityForTree(worktreePath);
      snapshots.push({
        repoId,
        commitSha: commit.sha,
        eslintErrors: lint.errors,
        eslintWarnings: lint.warnings,
        filesLinted: lint.filesLinted,
        avgComplexity: Number(complexity.avgComplexity.toFixed(2)),
        maxComplexity: complexity.maxComplexity,
        functionCount: complexity.functionCount,
        linesOfCode: complexity.linesOfCode,
      });
    } finally {
      fs.rmdirSync(worktreeNodeModules);
      execFileSync("git", ["worktree", "remove", "--force", worktreePath], { cwd: repoPath });
    }
  }

  try {
    execFileSync("git", ["worktree", "prune"], { cwd: repoPath });
  } catch {
    // best-effort cleanup
  }

  return snapshots;
}
