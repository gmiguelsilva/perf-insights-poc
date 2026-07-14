import fs from "node:fs";
import path from "node:path";
import type { DevReport } from "../types.js";

const START_MARK = "/*__REPORT_DATA__*/";
const END_MARK = "/*__END_REPORT_DATA__*/";

export function buildDashboardHtml(report: DevReport, templatePath: string, outputPath: string): void {
  const template = fs.readFileSync(templatePath, "utf-8");
  const startIdx = template.indexOf(START_MARK);
  const endIdx = template.indexOf(END_MARK);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Marcadores de dados nao encontrados no template do dashboard.");
  }

  const before = template.slice(0, startIdx + START_MARK.length);
  const after = template.slice(endIdx);
  const html = before + JSON.stringify(report) + after;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf-8");
}
