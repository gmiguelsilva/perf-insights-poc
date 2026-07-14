import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTrackedConfig,
  resolvePersonByGit,
  resolvePersonByGithubLogin,
  resolveRepoPaths,
  type PersonConfig,
} from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "tracked.json");

interface UnmatchedGit {
  repoId: string;
  name: string;
  email: string;
  commits: number;
}

interface UnmatchedGithub {
  repoId: string;
  login: string;
  contributions: number;
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
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

function suggestPerson(people: PersonConfig[], candidateName: string): PersonConfig | undefined {
  let best: { person: PersonConfig; score: number } | undefined;
  for (const person of people) {
    const score = similarity(person.name, candidateName);
    if (!best || score > best.score) best = { person, score };
  }
  return best && best.score >= 0.6 ? best.person : undefined;
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
    const list = JSON.parse(raw) as { login: string; contributions: number }[];
    return list.sort((a, b) => b.contributions - a.contributions);
  } catch {
    return [];
  }
}

function main() {
  const config = loadTrackedConfig(CONFIG_PATH);
  const repos = resolveRepoPaths(config, CONFIG_PATH);

  const unmatchedGit: UnmatchedGit[] = [];
  const unmatchedGithub: UnmatchedGithub[] = [];

  for (const repo of repos) {
    if (!fs.existsSync(repo.absolutePath)) {
      console.log(`(repositorio "${repo.id}" nao encontrado localmente em ${repo.absolutePath}, pulando)`);
      continue;
    }

    for (const author of collectGitAuthors(repo.absolutePath)) {
      if (!resolvePersonByGit(config, author.name, author.email)) {
        unmatchedGit.push({ repoId: repo.id, name: author.name, email: author.email, commits: author.commits });
      }
    }

    if (repo.github) {
      for (const contributor of collectGithubContributors(repo.github)) {
        if (!resolvePersonByGithubLogin(config, contributor.login)) {
          unmatchedGithub.push({ repoId: repo.id, login: contributor.login, contributions: contributor.contributions });
        }
      }
    }
  }

  console.log(`\n=== Identidades Git nao mapeadas (${unmatchedGit.length}) ===`);
  if (unmatchedGit.length === 0) console.log("(nenhuma - todos os autores de commit ja estao mapeados)");
  for (const u of unmatchedGit.sort((a, b) => b.commits - a.commits)) {
    const suggestion = suggestPerson(config.people, u.name);
    console.log(`\n${u.name} <${u.email}>  -  ${u.commits} commit(s) em ${u.repoId}`);
    if (suggestion) {
      console.log(`  parece ser ${suggestion.name} (${suggestion.personId})? rode:`);
      console.log(`    npm run people -- add --id ${suggestion.personId} --email ${u.email} --git-name "${u.name}"`);
    } else {
      const suggestedId = normalize(u.name).slice(0, 20) || "novo-dev";
      console.log(`  nenhuma pessoa parecida encontrada - cadastrar como nova pessoa:`);
      console.log(`    npm run people -- add --id ${suggestedId} --name "${u.name}" --email ${u.email}`);
    }
  }

  console.log(`\n=== Logins GitHub nao mapeados (${unmatchedGithub.length}) ===`);
  if (unmatchedGithub.length === 0) console.log("(nenhum - todos os contribuidores de PR ja estao mapeados, ou nenhum repo com GitHub configurado)");
  for (const u of unmatchedGithub.sort((a, b) => b.contributions - a.contributions)) {
    console.log(`\n@${u.login}  -  ${u.contributions} contribuicao(oes) em ${u.repoId}`);
    console.log(`  se voce sabe de quem e:`);
    console.log(`    npm run people -- add --id <personId> --github ${u.login}`);
  }

  console.log("");
}

main();
