import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPeopleFilter,
  applyRepoFilter,
  loadTrackedConfig,
  parseCliFilters,
  resolveRepoPaths,
} from "./config.js";
import { collectCommits } from "./collectors/gitCollector.js";
import { collectPullRequests } from "./collectors/githubPrCollector.js";
import { analyzeCommitsCodeQuality } from "./analyzers/codeQuality.js";
import { computeCommitBaseline, computePrBaseline } from "./analyzers/repoBaseline.js";
import { buildPersonTimelines, type RepoData } from "./timeline.js";
import { buildDashboardHtml } from "./report/buildDashboard.js";
import { loadRepoCache, saveRepoCache } from "./cache.js";
import type { DevReport, GitCommit, RepoBaseline } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "tracked.json");
const CACHE_DIR = path.join(PROJECT_ROOT, "data", "cache");

async function main() {
  const filters = parseCliFilters(process.argv.slice(2));
  const config = loadTrackedConfig(CONFIG_PATH);

  const repos = applyRepoFilter(resolveRepoPaths(config, CONFIG_PATH), filters);
  const people = applyPeopleFilter(config.people, filters);
  if (people.length === 0) throw new Error("Nenhuma pessoa selecionada (verifique --people ou config/tracked.json).");
  if (repos.length === 0) throw new Error("Nenhum repositorio selecionado (verifique --repos ou config/tracked.json).");

  const repoData: RepoData[] = [];
  const unmatchedIdentities: DevReport["unmatchedIdentities"] = [];
  const repoSummaries: DevReport["repos"] = [];

  for (const repo of repos) {
    if (!fs.existsSync(repo.absolutePath)) {
      console.warn(`Aviso: repositorio "${repo.id}" nao encontrado em ${repo.absolutePath}, pulando.`);
      continue;
    }

    console.log(`\n=== Repositorio: ${repo.id} ===`);
    console.log("Coletando commits...");
    const commits: GitCommit[] = collectCommits(repo.id, repo.absolutePath, config);
    console.log(`  ${commits.length} commits.`);

    for (const commit of commits) {
      if (!commit.personId) {
        unmatchedIdentities.push({ repoId: repo.id, authorName: commit.authorName, authorEmail: commit.authorEmail });
      }
    }

    console.log("Analisando qualidade de codigo (ESLint + complexidade) por commit...");
    const cache = loadRepoCache(CACHE_DIR, repo.id);
    const snapshots = analyzeCommitsCodeQuality(repo.id, repo.absolutePath, commits, cache);
    saveRepoCache(CACHE_DIR, repo.id, cache);

    let prs: ReturnType<typeof collectPullRequests> = [];
    if (repo.github) {
      console.log(`Coletando PRs de ${repo.github} via GitHub API...`);
      prs = collectPullRequests(repo.id, repo.github, config);
      console.log(`  ${prs.length} PRs.`);
    } else {
      console.log("Sem repositorio GitHub configurado - pulando coleta de PRs.");
    }

    const baseline: RepoBaseline = {
      repoId: repo.id,
      commits: computeCommitBaseline(snapshots),
      prs: computePrBaseline(prs),
    };

    repoData.push({ repoId: repo.id, commits, snapshots, prs, baseline });
    repoSummaries.push({ id: repo.id, github: repo.github, commitCount: commits.length, prCount: prs.length });
  }

  console.log("\nConstruindo linha do tempo unificada por pessoa (commits + PRs, cross-repo)...");
  const timelines = buildPersonTimelines(people, repoData);

  const report: DevReport = {
    generatedAt: new Date().toISOString(),
    repos: repoSummaries,
    people: timelines,
    unmatchedIdentities,
  };

  if (unmatchedIdentities.length) {
    console.warn(`\nAviso: ${unmatchedIdentities.length} commit(s) de autores nao mapeados em config/tracked.json:`);
    const seen = new Set<string>();
    for (const u of unmatchedIdentities) {
      const key = `${u.repoId}:${u.authorEmail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.warn(`  - ${u.authorName} <${u.authorEmail}> em ${u.repoId}`);
    }
  }

  const dataPath = path.join(PROJECT_ROOT, "data", "aggregated.json");
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nDados agregados salvos em ${dataPath}`);

  const templatePath = path.join(PROJECT_ROOT, "dashboard", "template.html");
  const outputPath = path.join(PROJECT_ROOT, "dist", "dashboard.html");
  buildDashboardHtml(report, templatePath, outputPath);
  console.log(`Dashboard gerado em ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
