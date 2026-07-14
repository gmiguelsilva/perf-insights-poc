# Perf Insights POC

Prova de conceito de um sistema de análise de performance e evolução de
desenvolvedores, QAs e analistas funcionais, a partir de sinais objetivos em
vez de opinião. Esta POC roda **fora do Salesforce** (sobre um repo
Next.js/TypeScript genérico) para validar o conceito antes de conectar em
Apex/LWC.

## O que esta POC prova

- Que dá pra extrair **métricas reais e automáticas de qualidade de código**
  direto do histórico do Git (sem depender de auto-relato).
- Que dá pra transformar isso em uma **tendência por pessoa ao longo do
  tempo** (está evoluindo ou piorando?), não uma foto isolada.
- Que o mesmo modelo de dados (pessoa → papel → iteração → métricas → score)
  se estende para QA e Funcional, papéis que não produzem código e por isso
  precisam de métricas próprias.

## O que é real vs. simulado

| Papel | Origem dos dados | Fonte |
|---|---|---|
| **Dev** | ✅ Real | `git log` + ESLint + análise de complexidade do repo [`gd-crm-poc`](https://github.com/gmiguelsilva/gd-crm-poc), rodados em cada commit via `git worktree` |
| **QA** | ⚠️ Simulado | Personas ilustrativas (`Camila Nunes`, `Bruno Alves`) com séries geradas por seed determinística, para provar o formato do dashboard |
| **Funcional** | ⚠️ Simulado | Personas ilustrativas (`Renata Ferraz`, `Diego Prado`), idem |

O repositório analisado (`gd-crm-poc`) tem um único contribuidor e nenhuma
issue/PR aberta — não há como extrair sinal real de QA ou Funcional dele.
Assim que houver um repo com múltiplos contribuidores, reviews de PR e
issues rotuladas, os coletores de QA/Funcional descritos no roadmap
substituem as personas por dados reais sem mudar o resto do pipeline.

O dashboard deixa isso explícito com badges "dados reais" / "dados
simulados" — a ideia é nunca misturar as duas fontes sem rótulo.

## Como as métricas viram um score (0–100)

**Dev** — por iteração (= 1 commit, tratado como "release" da POC):
- `issuesPerKloc` (erros + avisos do ESLint por 1000 linhas do snapshot inteiro) — peso 60%
- `avgComplexity` (heurística de AST: pontos de decisão por função) — peso 40%

**QA** (simulado) — por iteração:
- `escapedDefects` (defeitos que escaparam para produção, invertido) — 40%
- `bugsFound` (bugs pegos em revisão) — 30%
- `avgReviewTurnaroundHours` (agilidade de revisão, invertido) — 30%

**Funcional** (simulado) — por iteração:
- `reworkCausedPct` (retrabalho gerado por requisito ambíguo, invertido) — 40%
- `clarificationRequests` (pedidos de esclarecimento, invertido) — 30%
- `stakeholderApprovalDays` (tempo até aprovação, invertido) — 30%

Os pesos são um ponto de partida para discussão, não uma verdade absoluta —
o objetivo da POC é validar a mecânica (dado → score → tendência), não
travar os pesos definitivos.

## Como rodar

```bash
npm install
npm run analyze
```

Isso:
1. Lê o histórico de commits de `../gd-crm-poc` (ou do caminho em
   `PERF_INSIGHTS_REPO`).
2. Para cada commit, cria um `git worktree` isolado, aponta `node_modules`
   para a instalação já existente (via junction do Windows) e roda ESLint +
   a análise de complexidade sobre a árvore inteira naquele ponto no tempo.
3. Gera as personas sintéticas de QA/Funcional alinhadas no mesmo número de
   iterações.
4. Agrega tudo em `data/aggregated.json`.
5. Renderiza `dist/dashboard.html` — um arquivo HTML autocontido (sem
   dependências externas, funciona offline, respeita tema claro/escuro).

## Estrutura

```
src/
  collectors/gitCollector.ts     git log --numstat -> commits estruturados
  analyzers/complexity.ts        heurística de complexidade via AST do TypeScript
  analyzers/codeQuality.ts       orquestra worktree + ESLint + complexidade por commit
  synthetic/personas.ts          gera séries de QA/Funcional (seed determinística)
  aggregate.ts                   uma pessoa + papel + iteração -> score 0-100
  report/buildDashboard.ts       injeta o JSON agregado no template do dashboard
  index.ts                       orquestra o pipeline ponta a ponta
dashboard/template.html          dashboard estático (SVG + vanilla JS, sem libs externas)
data/aggregated.json             saída da última execução (gerado)
dist/dashboard.html              dashboard final (gerado)
```

## Limitações conhecidas (é uma POC)

- Só há um dev real no repo de origem — não dá pra comparar devs entre si
  ainda, só a evolução individual.
- A complexidade é uma heurística simples de AST, não uma métrica
  consolidada (ex: `escomplex`, SonarQube).
- QA e Funcional são inteiramente simulados — os pesos e faixas de
  normalização são chutes educados para provar o conceito visual.
- Cada iteração = 1 commit. Num cenário real isso seria por sprint/período
  de calendário.

## Roadmap para dados reais de QA e Funcional

- **QA**: GitHub Issues/PRs (`gh api`) — comentários de review, tempo de
  aprovação, issues rotuladas `bug`, defeitos reabertos após merge.
- **Funcional**: issues de requisito/`user story`, tempo entre abertura e
  primeira resposta do time, quantas vezes um PR foi reaberto por mudança de
  escopo.

## Roadmap para Salesforce

- Trocar o coletor de ESLint genérico por **Salesforce Code Analyzer**
  (PMD para Apex, ESLint para LWC) rodando por commit/deploy via Metadata
  API ou SFDX source format.
- Complexidade: usar as regras de complexidade ciclomática do PMD para Apex
  em vez da heurística de AST genérica.
- QA/Funcional: plugar em dados reais do sistema de tracking usado pelo time
  (Jira, Azure DevOps, etc.) em vez das personas simuladas.
