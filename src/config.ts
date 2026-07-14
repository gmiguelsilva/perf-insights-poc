import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

export interface GitIdentity {
  name: string;
  email: string;
}

export interface PersonConfig {
  personId: string;
  name: string;
  gitIdentities: GitIdentity[];
  githubLogins: string[];
}

export interface RepoConfig {
  id: string;
  /** Caminho local, relativo a este arquivo de config. */
  path: string;
  /** "owner/repo" no GitHub, opcional - habilita a coleta de PRs via `gh api`. */
  github?: string;
}

export interface TrackedConfig {
  people: PersonConfig[];
  repos: RepoConfig[];
}

export interface ResolvedRepoConfig extends RepoConfig {
  absolutePath: string;
}

export interface CliFilters {
  people?: string[];
  repos?: string[];
}

export function loadTrackedConfig(configPath: string): TrackedConfig {
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as TrackedConfig;
  if (!Array.isArray(parsed.people) || !Array.isArray(parsed.repos)) {
    throw new Error(`Config invalida em ${configPath}: esperado { people: [], repos: [] }`);
  }
  return parsed;
}

export function resolveRepoPaths(config: TrackedConfig, configPath: string): ResolvedRepoConfig[] {
  const configDir = path.dirname(configPath);
  return config.repos.map((repo) => ({
    ...repo,
    absolutePath: path.resolve(configDir, repo.path),
  }));
}

/** Resolve a pessoa dona de um commit, casando por email exato e depois por nome. */
export function resolvePersonByGit(config: TrackedConfig, authorName: string, authorEmail: string): PersonConfig | undefined {
  const byEmail = config.people.find((p) => p.gitIdentities.some((id) => id.email.toLowerCase() === authorEmail.toLowerCase()));
  if (byEmail) return byEmail;
  return config.people.find((p) => p.gitIdentities.some((id) => id.name.toLowerCase() === authorName.toLowerCase()));
}

/** Resolve a pessoa dona de um PR/review pelo login do GitHub. */
export function resolvePersonByGithubLogin(config: TrackedConfig, login: string): PersonConfig | undefined {
  return config.people.find((p) => p.githubLogins.some((l) => l.toLowerCase() === login.toLowerCase()));
}

export function parseCliFilters(argv: string[]): CliFilters {
  const { values } = parseArgs({
    args: argv,
    options: {
      people: { type: "string" },
      repos: { type: "string" },
    },
    strict: false,
  });

  return {
    people: typeof values.people === "string" ? values.people.split(",").map((s) => s.trim()) : undefined,
    repos: typeof values.repos === "string" ? values.repos.split(",").map((s) => s.trim()) : undefined,
  };
}

export function applyRepoFilter(repos: ResolvedRepoConfig[], filters: CliFilters): ResolvedRepoConfig[] {
  if (!filters.repos?.length) return repos;
  const wanted = new Set(filters.repos);
  return repos.filter((r) => wanted.has(r.id));
}

export function applyPeopleFilter(people: PersonConfig[], filters: CliFilters): PersonConfig[] {
  if (!filters.people?.length) return people;
  const wanted = new Set(filters.people);
  return people.filter((p) => wanted.has(p.personId));
}
