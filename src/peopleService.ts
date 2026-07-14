import type { PersonConfig, TrackedConfig } from "./config.js";

export interface UpsertPersonInput {
  personId: string;
  name?: string;
  emails?: string[];
  gitName?: string;
  githubLogins?: string[];
}

export interface UpsertPersonResult {
  person: PersonConfig;
  created: boolean;
  addedEmails: string[];
  addedLogins: string[];
}

/** Cria a pessoa se `personId` ainda nao existir (exige `name`), ou soma novas identidades a uma pessoa ja existente. Nunca sobrescreve identidades ja cadastradas. */
export function upsertPerson(config: TrackedConfig, input: UpsertPersonInput): UpsertPersonResult {
  let person = config.people.find((p) => p.personId === input.personId);
  let created = false;

  if (!person) {
    if (!input.name) throw new Error(`Pessoa "${input.personId}" nao existe - informe "name" para criar.`);
    person = { personId: input.personId, name: input.name, gitIdentities: [], githubLogins: [] };
    config.people.push(person);
    created = true;
  } else if (input.name && input.name !== person.name) {
    person.name = input.name;
  }

  const addedEmails: string[] = [];
  for (const email of input.emails ?? []) {
    const already = person.gitIdentities.some((i) => i.email.toLowerCase() === email.toLowerCase());
    if (already) continue;
    person.gitIdentities.push({ name: input.gitName ?? person.name, email });
    addedEmails.push(email);
  }

  const addedLogins: string[] = [];
  for (const login of input.githubLogins ?? []) {
    const already = person.githubLogins.some((l) => l.toLowerCase() === login.toLowerCase());
    if (already) continue;
    person.githubLogins.push(login);
    addedLogins.push(login);
  }

  return { person, created, addedEmails, addedLogins };
}

export function removePerson(config: TrackedConfig, personId: string): boolean {
  const before = config.people.length;
  config.people = config.people.filter((p) => p.personId !== personId);
  return config.people.length !== before;
}

export function removeGitIdentity(config: TrackedConfig, personId: string, email: string): boolean {
  const person = config.people.find((p) => p.personId === personId);
  if (!person) return false;
  const before = person.gitIdentities.length;
  person.gitIdentities = person.gitIdentities.filter((i) => i.email.toLowerCase() !== email.toLowerCase());
  return person.gitIdentities.length !== before;
}

export function removeGithubLogin(config: TrackedConfig, personId: string, login: string): boolean {
  const person = config.people.find((p) => p.personId === personId);
  if (!person) return false;
  const before = person.githubLogins.length;
  person.githubLogins = person.githubLogins.filter((l) => l.toLowerCase() !== login.toLowerCase());
  return person.githubLogins.length !== before;
}
