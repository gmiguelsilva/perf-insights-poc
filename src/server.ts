import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadTrackedConfig,
  resolveRepoPaths,
  saveTrackedConfig,
  type TrackedConfig,
} from "./config.js";
import { removeGitIdentity, removeGithubLogin, removePerson, upsertPerson } from "./peopleService.js";
import { discoverUnmatched } from "./discoverService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "config", "tracked.json");
const APP_HTML_PATH = path.join(PROJECT_ROOT, "ui", "app.html");
const DASHBOARD_PATH = path.join(PROJECT_ROOT, "dist", "dashboard.html");
const REPORT_PATH = path.join(PROJECT_ROOT, "data", "aggregated.json");

const PORT = Number(process.env.PORT ?? 4173);

function withConfig<T>(fn: (config: TrackedConfig) => T): T {
  const config = loadTrackedConfig(CONFIG_PATH);
  return fn(config);
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  sendJson(res, status, { ok: false, error: message });
}

async function handleAnalyze(url: URL, res: http.ServerResponse): Promise<void> {
  const args: string[] = [];
  const people = url.searchParams.get("people");
  const repos = url.searchParams.get("repos");
  if (people) args.push("--people", people);
  if (repos) args.push("--repos", repos);

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" });

  // Spawna o node diretamente sobre o CLI do tsx, em vez de "npm run" -
  // evita depender de npm.cmd no Windows (spawn direto de .cmd sem shell:true
  // falha com EINVAL) e some com a camada extra do shell.
  const tsxCli = path.join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(PROJECT_ROOT, "src", "index.ts");

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, [tsxCli, entry, ...args], { cwd: PROJECT_ROOT });
  } catch (err) {
    res.write(`\nErro ao iniciar analise: ${(err as Error).message}\n__DONE__ exit=1\n`);
    res.end();
    return;
  }

  child.stdout.on("data", (chunk) => res.write(chunk));
  child.stderr.on("data", (chunk) => res.write(chunk));
  child.on("close", (code) => {
    res.write(`\n__DONE__ exit=${code ?? 0}\n`);
    res.end();
  });
  child.on("error", (err) => {
    res.write(`\nErro ao iniciar analise: ${err.message}\n__DONE__ exit=1\n`);
    res.end();
  });
}

function repoExistsSummary(config: TrackedConfig) {
  const resolved = resolveRepoPaths(config, CONFIG_PATH);
  let report: { repos?: { id: string; github?: string; commitCount: number; prCount: number }[] } = {};
  if (fs.existsSync(REPORT_PATH)) {
    try {
      report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf-8"));
    } catch {
      report = {};
    }
  }
  return resolved.map((r) => {
    const summary = report.repos?.find((rs) => rs.id === r.id);
    return {
      id: r.id,
      path: r.path,
      github: r.github,
      exists: fs.existsSync(r.absolutePath),
      commitCount: summary?.commitCount,
      prCount: summary?.prCount,
    };
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const { pathname } = url;
    const method = req.method ?? "GET";

    if (method === "GET" && pathname === "/") {
      const html = fs.readFileSync(APP_HTML_PATH, "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (method === "GET" && pathname === "/dashboard") {
      if (!fs.existsSync(DASHBOARD_PATH)) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Dashboard ainda nao foi gerado - rode uma analise primeiro.");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(DASHBOARD_PATH, "utf-8"));
      return;
    }

    if (method === "GET" && pathname === "/api/people") {
      return withConfig((config) => sendJson(res, 200, { people: config.people }));
    }

    if (method === "POST" && pathname === "/api/people") {
      const body = await readJsonBody(req);
      return withConfig((config) => {
        try {
          const result = upsertPerson(config, {
            personId: String(body.personId ?? ""),
            name: body.name ? String(body.name) : undefined,
            emails: Array.isArray(body.emails) ? body.emails.map(String) : undefined,
            githubLogins: Array.isArray(body.githubLogins) ? body.githubLogins.map(String) : undefined,
            gitName: body.gitName ? String(body.gitName) : undefined,
          });
          saveTrackedConfig(CONFIG_PATH, config);
          sendJson(res, 200, { ok: true, ...result });
        } catch (err) {
          sendError(res, 400, (err as Error).message);
        }
      });
    }

    if (method === "DELETE" && pathname === "/api/people") {
      const id = url.searchParams.get("id");
      if (!id) return sendError(res, 400, "parametro id e obrigatorio");
      return withConfig((config) => {
        const removed = removePerson(config, id);
        if (removed) saveTrackedConfig(CONFIG_PATH, config);
        sendJson(res, 200, { ok: removed });
      });
    }

    if (method === "DELETE" && pathname === "/api/people/identity") {
      const id = url.searchParams.get("id");
      const email = url.searchParams.get("email");
      if (!id || !email) return sendError(res, 400, "parametros id e email sao obrigatorios");
      return withConfig((config) => {
        const removed = removeGitIdentity(config, id, email);
        if (removed) saveTrackedConfig(CONFIG_PATH, config);
        sendJson(res, 200, { ok: removed });
      });
    }

    if (method === "DELETE" && pathname === "/api/people/github") {
      const id = url.searchParams.get("id");
      const login = url.searchParams.get("login");
      if (!id || !login) return sendError(res, 400, "parametros id e login sao obrigatorios");
      return withConfig((config) => {
        const removed = removeGithubLogin(config, id, login);
        if (removed) saveTrackedConfig(CONFIG_PATH, config);
        sendJson(res, 200, { ok: removed });
      });
    }

    if (method === "GET" && pathname === "/api/repos") {
      return withConfig((config) => sendJson(res, 200, { repos: repoExistsSummary(config) }));
    }

    if (method === "GET" && pathname === "/api/discover") {
      return withConfig((config) => {
        const repos = resolveRepoPaths(config, CONFIG_PATH);
        const result = discoverUnmatched(config, repos);
        sendJson(res, 200, result);
      });
    }

    if (method === "GET" && pathname === "/api/report") {
      if (!fs.existsSync(REPORT_PATH)) return sendJson(res, 200, { people: [], repos: [], unmatchedIdentities: [] });
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(fs.readFileSync(REPORT_PATH, "utf-8"));
      return;
    }

    if (method === "POST" && pathname === "/api/analyze") {
      await handleAnalyze(url, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (err) {
    sendError(res, 500, (err as Error).message);
  }
});

server.listen(PORT, () => {
  console.log(`\nPerf Insights - painel local rodando em http://localhost:${PORT}\n`);
});
