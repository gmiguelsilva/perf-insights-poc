import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectCommits } from "./collectors/gitCollector.js";
import { analyzeCommitsCodeQuality } from "./analyzers/codeQuality.js";
import { buildAggregatedReport } from "./aggregate.js";
import { buildDashboardHtml } from "./report/buildDashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

const TARGET_REPO = process.env.PERF_INSIGHTS_REPO ?? path.resolve(PROJECT_ROOT, "..", "gd-crm-poc");

async function main() {
  console.log(`Repositorio alvo: ${TARGET_REPO}`);

  console.log("Coletando historico de commits...");
  const commits = collectCommits(TARGET_REPO);
  console.log(`  ${commits.length} commits encontrados.`);

  console.log("Analisando qualidade de codigo por iteracao (ESLint + complexidade)...");
  const snapshots = analyzeCommitsCodeQuality(TARGET_REPO, commits);

  console.log("Agregando metricas reais + personas sinteticas de QA/Funcional...");
  const report = buildAggregatedReport(TARGET_REPO, commits, snapshots);

  const dataPath = path.join(PROJECT_ROOT, "data", "aggregated.json");
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`  Dados agregados salvos em ${dataPath}`);

  const templatePath = path.join(PROJECT_ROOT, "dashboard", "template.html");
  const outputPath = path.join(PROJECT_ROOT, "dist", "dashboard.html");
  buildDashboardHtml(report, templatePath, outputPath);
  console.log(`  Dashboard gerado em ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
