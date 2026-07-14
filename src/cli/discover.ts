import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadTrackedConfig, resolveRepoPaths } from "../config.js";
import { discoverUnmatched, suggestPersonId } from "../discoverService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "tracked.json");

function main() {
  const config = loadTrackedConfig(CONFIG_PATH);
  const repos = resolveRepoPaths(config, CONFIG_PATH);
  const result = discoverUnmatched(config, repos);

  for (const repoId of result.reposSkipped) {
    console.log(`(repositorio "${repoId}" nao encontrado localmente, pulando)`);
  }

  console.log(`\n=== Identidades Git nao mapeadas (${result.unmatchedGit.length}) ===`);
  if (result.unmatchedGit.length === 0) console.log("(nenhuma - todos os autores de commit ja estao mapeados)");
  for (const u of result.unmatchedGit) {
    console.log(`\n${u.name} <${u.email}>  -  ${u.commits} commit(s) em ${u.repoId}`);
    if (u.suggestedPersonId) {
      console.log(`  parece ser ${u.suggestedPersonName} (${u.suggestedPersonId})? rode:`);
      console.log(`    npm run people -- add --id ${u.suggestedPersonId} --email ${u.email} --git-name "${u.name}"`);
    } else {
      console.log(`  nenhuma pessoa parecida encontrada - cadastrar como nova pessoa:`);
      console.log(`    npm run people -- add --id ${suggestPersonId(u.name)} --name "${u.name}" --email ${u.email}`);
    }
  }

  console.log(`\n=== Logins GitHub nao mapeados (${result.unmatchedGithub.length}) ===`);
  if (result.unmatchedGithub.length === 0) {
    console.log("(nenhum - todos os contribuidores de PR ja estao mapeados, ou nenhum repo com GitHub configurado)");
  }
  for (const u of result.unmatchedGithub) {
    console.log(`\n@${u.login}  -  ${u.contributions} contribuicao(oes) em ${u.repoId}`);
    console.log(`  se voce sabe de quem e:`);
    console.log(`    npm run people -- add --id <personId> --github ${u.login}`);
  }

  console.log("\nDica: \"npm run ui\" mostra isso numa tela clicavel, sem precisar copiar comando.\n");
}

main();
