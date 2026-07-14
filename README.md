# Perf Insights POC

Prova de conceito de um sistema de análise de performance e evolução de
desenvolvedores — com arquitetura pronta para múltiplos repositórios por
pessoa (commits **e** PRs). QA e Funcional ficam para uma próxima fase (ver
"Escopo desta fase" abaixo). Roda **fora do Salesforce** (sobre repos
Next.js/TypeScript genéricos) para validar o conceito antes de conectar em
Apex/LWC.

## Escopo desta fase: só Dev, mas multi-repo de verdade

Um dev raramente commita em um único repositório. Esta versão assume isso
desde o desenho:

- **Um dev pode ter identidades Git diferentes em repositórios diferentes**
  (nomes/emails distintos) — o sistema resolve isso por um mapeamento
  explícito em `config/tracked.json`, não por adivinhação.
- **Um dev pode ter commits em um repo e PRs em outro** — commits e PRs são
  coletados por repositório e depois unidos numa única linha do tempo por
  pessoa.
- **Repos diferentes têm baselines de qualidade diferentes** (um repo legado
  é naturalmente mais complexo que um greenfield) — cada evento é comparado
  contra a **própria média histórica do repo onde aconteceu**, não contra um
  número absoluto fixo, para não penalizar quem trabalha em código mais
  antigo.
- **Selecionar pessoas e repositórios** é de primeira classe: por flag de
  CLI na coleta (`--people`, `--repos`) e por checkboxes no próprio
  dashboard (filtra o gráfico/tabela sem precisar rodar de novo).

QA e Funcional foram deliberadamente deixados de fora desta rodada — a
versão anterior tinha personas simuladas para provar o layout visual, mas
elas não sobreviveram à mudança de modelo (de "1 commit = 1 iteração" para
"linha do tempo cronológica entre repos"). Ficam para quando plugarmos
fontes reais (issues/reviews) — ver roadmap no fim.

## Como funciona

```
config/tracked.json          quem é rastreado, com quais identidades, em quais repos
        │
        ▼
gitCollector (por repo)  ──► commits com personId resolvido
        │
        ▼
codeQuality (git worktree + ESLint + complexidade AST) ──► saúde do código a cada commit
        │
        ▼
githubPrCollector (gh api, por repo com "github" configurado) ──► PRs com personId resolvido
        │
        ▼
repoBaseline  ──► média/desvio-padrão de cada repo (issues/KLOC, complexidade, tempo de merge, churn de review)
        │
        ▼
timeline  ──► funde commits + PRs de todos os repos de uma pessoa, ordenado por data,
              signal do evento = 50 + desvio relativo ao baseline do próprio repo,
              score = média móvel dos últimos eventos
        │
        ▼
dashboard (dist/dashboard.html) ──► filtro por pessoa/repo, linha do tempo, tabela de eventos
```

### O que é real hoje

O único repositório configurado (`gd-crm-poc`) tem 1 contribuidor e nenhum
PR — então a demo atual roda com dados 100% reais, mas ainda não exercita a
parte de "múltiplos repositórios" nem a de PRs de fato (o coletor de PR
roda, só não encontra nada para trazer). Isso foi uma escolha deliberada
para esta rodada: construir a arquitetura certa antes de ter dados ricos o
bastante para preenchê-la — ver conversa no histórico do projeto.

## Como o score é calculado

Cada **evento** (commit ou PR mergeado) recebe um **signal 0–100**:

- **Commit**: combina `issuesPerKloc` (erros+avisos do ESLint por 1000
  linhas do snapshot inteiro, peso 60%) e `avgComplexity` (heurística de AST,
  peso 40%), como desvio-padrão em relação à média **daquele repositório**.
  `signal = 50` = exatamente na média histórica do repo.
- **PR**: combina tempo de merge (peso 50%) e nº de reviews com
  "changes requested" (peso 50%), mesma lógica de desvio em relação à média
  do repo. Só é calculado quando o repo já tem PRs mergeados suficientes
  para ter uma média própria confiável (≥ 2).

O **score** exibido é a média móvel dos últimos 5 eventos daquela pessoa,
na ordem cronológica real — mesmo que os eventos venham de repositórios
diferentes. É isso que responde "essa pessoa está evoluindo?" sem depender
de todo mundo estar no mesmo repositório ou no mesmo ritmo de commits.

## Como rodar

```bash
npm install
npm run analyze                                  # roda tudo, conforme config/tracked.json
npm run analyze -- --people miguel-silva         # só essa pessoa
npm run analyze -- --repos gd-crm-poc            # só esse repositório
```

Isso gera `data/aggregated.json` (dados brutos) e `dist/dashboard.html`
(dashboard autocontido, sem dependências externas, funciona offline,
respeita tema claro/escuro).

## Configuração (`config/tracked.json`)

```json
{
  "people": [
    {
      "personId": "miguel-silva",
      "name": "Miguel Silva",
      "gitIdentities": [{ "name": "miguelsilvag", "email": "..." }],
      "githubLogins": ["gmiguelsilva"]
    }
  ],
  "repos": [
    { "id": "gd-crm-poc", "path": "../../gd-crm-poc", "github": "gmiguelsilva/gd-crm-poc" }
  ]
}
```

- `gitIdentities`: uma pessoa pode ter várias entradas (nomes/emails
  diferentes por repositório). A resolução tenta email exato primeiro,
  depois nome.
- `githubLogins`: usado para atribuir PRs/reviews a uma pessoa.
- `repos[].github`: opcional. Sem ele, o repositório é analisado só pelo
  histórico local do Git (sem coleta de PR).
- Commits de autores não mapeados aparecem no aviso `unmatchedIdentities`
  no rodapé do dashboard — sinal de que o config precisa de um novo
  `gitIdentities`, não de um erro silencioso.

## Estrutura

```
config/tracked.json               pessoas, identidades git, repositórios rastreados
src/
  config.ts                       carrega config, resolve identidade, filtros de CLI
  collectors/gitCollector.ts       git log --numstat -> commits com personId resolvido
  collectors/githubPrCollector.ts  gh api -> PRs com personId resolvido (tolerante a repo sem PR)
  analyzers/complexity.ts         heurística de complexidade via AST do TypeScript
  analyzers/codeQuality.ts        orquestra git worktree + ESLint + complexidade por commit
  analyzers/repoBaseline.ts       média/desvio-padrão por repo -> signal 0-100 normalizado
  timeline.ts                     funde commits+PRs de todos os repos por pessoa, calcula score
  report/buildDashboard.ts        injeta o JSON agregado no template do dashboard
  index.ts                        orquestra o pipeline ponta a ponta
  synthetic/                      (legado) personas de QA/Funcional da fase anterior - não usado hoje
dashboard/template.html           dashboard estático (SVG + vanilla JS, sem libs externas)
data/aggregated.json              saída da última execução (gerado)
dist/dashboard.html               dashboard final (gerado)
```

## Limitações conhecidas (é uma POC)

- Só há 1 pessoa e 1 repositório reais até agora — o multi-repo e o PR
  collector estão prontos, mas ainda não foram exercitados com dados ricos.
- A complexidade é uma heurística simples de AST, não uma métrica
  consolidada (ex: `escomplex`, SonarQube).
- O baseline por repo (z-score) fica instável com poucos commits/PRs — com
  amostras pequenas, quase tudo tende a `signal ≈ 50` (pouco desvio-padrão
  para comparar). Fica mais informativo à medida que o histórico cresce.
- Roda `git worktree` + ESLint para **cada commit do histórico inteiro**
  toda vez que analisa um repo — funciona bem para os repos pequenos desta
  POC, mas não escala para um repositório com milhares de commits sem
  amostragem/cache incremental.

## Roadmap

**QA e Funcional (próxima fase)**: reconectar ao novo modelo de linha do
tempo — QA via GitHub Issues/PRs (comentários de review, issues `bug`,
defeitos reabertos), Funcional via issues de requisito/user story (tempo até
primeira resposta, reabertura por mudança de escopo). O código legado em
`src/synthetic/` mostra a ideia original (personas simuladas), mas o
schema de dados mudou.

**Salesforce**: trocar ESLint/heurística de AST por Salesforce Code
Analyzer (PMD para Apex, ESLint para LWC) rodando por commit/deploy via
Metadata API ou SFDX source format; complexidade ciclomática via regras do
PMD em vez da heurística genérica.
