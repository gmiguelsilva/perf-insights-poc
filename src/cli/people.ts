import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { PersonConfig, TrackedConfig } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "..", "..", "config", "tracked.json");

function loadConfig(): TrackedConfig {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as TrackedConfig;
}

function saveConfig(config: TrackedConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

function printUsage(): void {
  console.log(`Uso:
  npm run people -- list
  npm run people -- add --id <personId> --name "<Nome>" [--email <email>...] [--git-name <nome-do-git>] [--github <login>...]
  npm run people -- remove --id <personId>

Exemplos:
  npm run people -- add --id joao-souza --name "João Souza" --email joao@empresa.com --github joaosouza
  npm run people -- add --id joao-souza --email 12345+joaosouza@users.noreply.github.com --git-name joaosouza
  npm run people -- remove --id joao-souza
`);
}

function cmdList(config: TrackedConfig): void {
  if (config.people.length === 0) {
    console.log("Nenhuma pessoa cadastrada em config/tracked.json.");
    return;
  }
  for (const p of config.people) {
    console.log(`\n${p.name}  (${p.personId})`);
    console.log(`  identidades git : ${p.gitIdentities.map((i) => `${i.name} <${i.email}>`).join(", ") || "(nenhuma)"}`);
    console.log(`  logins github   : ${p.githubLogins.join(", ") || "(nenhum)"}`);
  }
}

function cmdAdd(config: TrackedConfig, args: Record<string, unknown>): void {
  const id = args.id as string | undefined;
  if (!id) throw new Error("--id e obrigatorio.");

  const emails = (args.email as string[] | undefined) ?? [];
  const githubLogins = (args.github as string[] | undefined) ?? [];
  const gitName = args["git-name"] as string | undefined;
  const name = args.name as string | undefined;

  let person = config.people.find((p) => p.personId === id);
  if (!person) {
    if (!name) throw new Error(`Pessoa "${id}" nao existe ainda - use --name para cria-la.`);
    person = { personId: id, name, gitIdentities: [], githubLogins: [] };
    config.people.push(person);
    console.log(`+ Pessoa criada: ${name} (${id})`);
  } else if (name && name !== person.name) {
    console.log(`~ Nome atualizado: "${person.name}" -> "${name}"`);
    person.name = name;
  }

  for (const email of emails) {
    const identityName = gitName ?? person.name;
    const exists = person.gitIdentities.some((i) => i.email.toLowerCase() === email.toLowerCase());
    if (exists) {
      console.log(`  (email ja cadastrado, ignorado: ${email})`);
      continue;
    }
    person.gitIdentities.push({ name: identityName, email });
    console.log(`  + identidade git: ${identityName} <${email}>`);
  }

  for (const login of githubLogins) {
    if (person.githubLogins.some((l) => l.toLowerCase() === login.toLowerCase())) {
      console.log(`  (login github ja cadastrado, ignorado: ${login})`);
      continue;
    }
    person.githubLogins.push(login);
    console.log(`  + login github: ${login}`);
  }

  saveConfig(config);
  console.log(`\nconfig/tracked.json atualizado.`);
}

function cmdRemove(config: TrackedConfig, args: Record<string, unknown>): void {
  const id = args.id as string | undefined;
  if (!id) throw new Error("--id e obrigatorio.");

  const before = config.people.length;
  config.people = config.people.filter((p) => p.personId !== id);
  if (config.people.length === before) {
    console.log(`Nenhuma pessoa com id "${id}" encontrada - nada a remover.`);
    return;
  }

  saveConfig(config);
  console.log(`- Pessoa "${id}" removida de config/tracked.json.`);
  console.log(`  (commits/PRs dela nos repositorios passam a aparecer como "identidade nao mapeada" nas proximas execucoes, nao desaparecem do historico do Git.)`);
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    return;
  }

  const { values } = parseArgs({
    args: rest,
    options: {
      id: { type: "string" },
      name: { type: "string" },
      email: { type: "string", multiple: true },
      github: { type: "string", multiple: true },
      "git-name": { type: "string" },
    },
    strict: false,
  });

  const config = loadConfig();

  switch (subcommand) {
    case "list":
      cmdList(config);
      break;
    case "add":
      cmdAdd(config, values as Record<string, unknown>);
      break;
    case "remove":
      cmdRemove(config, values as Record<string, unknown>);
      break;
    default:
      console.error(`Subcomando desconhecido: ${subcommand}\n`);
      printUsage();
      process.exitCode = 1;
  }
}

main();
