import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadTrackedConfig, saveTrackedConfig, type TrackedConfig } from "../config.js";
import { removePerson, upsertPerson } from "../peopleService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "..", "..", "config", "tracked.json");

function printUsage(): void {
  console.log(`Uso:
  npm run people -- list
  npm run people -- add --id <personId> --name "<Nome>" [--email <email>...] [--git-name <nome-do-git>] [--github <login>...]
  npm run people -- remove --id <personId>

Dica: "npm run ui" abre uma tela pra fazer isso mesmo pelo navegador.

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

  const result = upsertPerson(config, {
    personId: id,
    name: args.name as string | undefined,
    emails: args.email as string[] | undefined,
    githubLogins: args.github as string[] | undefined,
    gitName: args["git-name"] as string | undefined,
  });

  console.log(result.created ? `+ Pessoa criada: ${result.person.name} (${id})` : `~ Pessoa atualizada: ${result.person.name} (${id})`);
  for (const email of result.addedEmails) console.log(`  + identidade git: <${email}>`);
  for (const login of result.addedLogins) console.log(`  + login github: ${login}`);
  if (!result.addedEmails.length && !result.addedLogins.length && !result.created) {
    console.log("  (nada novo pra adicionar - identidades ja cadastradas)");
  }

  saveTrackedConfig(CONFIG_PATH, config);
  console.log(`\nconfig/tracked.json atualizado.`);
}

function cmdRemove(config: TrackedConfig, args: Record<string, unknown>): void {
  const id = args.id as string | undefined;
  if (!id) throw new Error("--id e obrigatorio.");

  const removed = removePerson(config, id);
  if (!removed) {
    console.log(`Nenhuma pessoa com id "${id}" encontrada - nada a remover.`);
    return;
  }

  saveTrackedConfig(CONFIG_PATH, config);
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

  const config = loadTrackedConfig(CONFIG_PATH);

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
