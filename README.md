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
- **Adicionar/remover um dev do time é um clique num painel (`npm run ui`)
  ou um comando** (`npm run people -- add/remove/list`), nunca uma edição
  manual de JSON — e `npm run discover` (ou a aba "Descobrir" do painel)
  acha identidades de commit/PR que ainda não batem com ninguém cadastrado.

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

A análise de código (`git worktree` + ESLint) fica em cache por commit em
`data/cache/<repo>.json` (fora do Git) — a primeira rodada de um
repositório é cara, as próximas só analisam commits novos. Numa rodada
local de teste, `gd-crm-poc` (7 commits) caiu de ~90s para ~4s na segunda
execução.

## Painel visual (`npm run ui`)

```bash
npm run ui
# abre http://localhost:4173
```

Um painel local (servidor Node + tela no navegador, sem dependências de
frontend) com três abas:

- **Pessoas** — lista quem está cadastrado, com chips removíveis por
  identidade (git e GitHub) e um botão "Remover pessoa"; formulário de
  "+ Adicionar pessoa" pra cadastrar sem tocar em JSON.
- **Descobrir** — roda a mesma varredura do `npm run discover`, mas em vez
  de imprimir comando pra copiar, cada identidade não mapeada vira uma linha
  com um seletor (pessoa existente ou "+ nova pessoa") e um botão
  "Vincular" — um clique em vez de copiar/colar.
- **Análise** — checkboxes de pessoas/repositórios + botão "Rodar análise",
  com a saída do processo (o mesmo `npm run analyze`) transmitida ao vivo
  num painel estilo terminal.
- **Dashboard** — a mesma linha do tempo de evolução (gráfico, stat tiles,
  tabela de eventos), só que como uma aba do próprio painel, com o mesmo
  visual "minimal futurista" das outras abas - não abre em outra janela nem
  muda de estilo. Lê direto de `/api/report` (o mesmo `data/aggregated.json`
  da última análise).

O `dist/dashboard.html` gerado por `npm run analyze` continua existindo à
parte (útil pra mandar pra alguém como arquivo único, sem precisar do
servidor rodando) - só não é mais o caminho usado dentro do painel.

Tudo isso conversa com o mesmo `config/tracked.json` e os mesmos scripts
(`src/peopleService.ts`, `src/discoverService.ts`, `src/index.ts`) usados
pela CLI — a tela é só mais uma forma de acionar o mesmo motor, não um
caminho paralelo. `npm run people` e `npm run discover` continuam
funcionando normalmente pra quem preferir terminal.

## Adicionar ou remover um dev

Pelo painel (`npm run ui` → aba **Pessoas**) ou por linha de comando —
editar `config/tracked.json` na mão funciona, mas erra fácil (duplicar id,
esquecer um email, JSON inválido). Os comandos abaixo cuidam disso:

```bash
# ver quem está cadastrado
npm run people -- list

# cadastrar alguém novo
npm run people -- add --id joao-souza --name "João Souza" --email joao@empresa.com --github joaosouza

# a mesma pessoa commitando com outro email (comum: pessoal vs. corporativo,
# ou noreply do GitHub) - roda de novo com o mesmo --id, só adiciona a identidade
npm run people -- add --id joao-souza --email 12345+joaosouza@users.noreply.github.com --git-name joaosouza

# tirar alguém (ex.: saiu do time) - o histórico de commits dele continua
# no Git, só passa a aparecer como "identidade não mapeada" nas próximas execuções
npm run people -- remove --id joao-souza
```

**Não sabe todas as identidades git de alguém?** É comum não saber de cara —
o mesmo dev aparece com nome/email diferentes em cada repositório. Para
isso existe:

```bash
npm run discover
```

Ele varre todos os repositórios configurados, lista quem commitou (e quem
abriu PR, se o repo tem GitHub configurado) e que **ainda não bate com
ninguém** em `config/tracked.json` — com sugestão de comando pronto pra
copiar e colar: se o nome for parecido com alguém já cadastrado, sugere
adicionar como mais uma identidade dessa pessoa; senão, sugere cadastrar
como pessoa nova. Rode isso sempre que adicionar um repositório novo ou
sentir que alguém "sumiu" do dashboard.

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
ui/app.html                       painel visual (SPA estática, servida pelo server.ts)
src/
  server.ts                       servidor HTTP local (npm run ui) - API + painel
  peopleService.ts                add/remove pessoa e identidades - usado por CLI e painel
  discoverService.ts              varredura de identidades não mapeadas - usado por CLI e painel
  config.ts                       carrega/salva config, resolve identidade, filtros de CLI
  cache.ts                        cache incremental de análise de código por commit (data/cache/)
  cli/people.ts                    npm run people -- list/add/remove (fino sobre peopleService)
  cli/discover.ts                  npm run discover (fino sobre discoverService)
  collectors/gitCollector.ts       git log --numstat -> commits com personId resolvido
  collectors/githubPrCollector.ts  gh api -> PRs com personId resolvido (tolerante a repo sem PR)
  analyzers/complexity.ts         heurística de complexidade via AST do TypeScript
  analyzers/codeQuality.ts        orquestra git worktree + ESLint + complexidade por commit (com cache)
  analyzers/repoBaseline.ts       média/desvio-padrão por repo -> signal 0-100 normalizado
  timeline.ts                     funde commits+PRs de todos os repos por pessoa, calcula score
  report/buildDashboard.ts        injeta o JSON agregado no template do dashboard
  index.ts                        orquestra o pipeline ponta a ponta
  synthetic/                      (legado) personas de QA/Funcional da fase anterior - não usado hoje
dashboard/template.html           dashboard estático (SVG + vanilla JS, sem libs externas)
data/aggregated.json              saída da última execução (gerado)
data/cache/                       cache de análise por commit, por repo (gerado, fora do Git)
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
- O cache acelera reprocessamento (commits já vistos não rodam ESLint de
  novo), mas a primeira análise de um repositório grande ainda percorre o
  histórico inteiro uma vez — não há amostragem/janela de tempo ainda.
- `npm run discover` sugere correspondências por similaridade de nome
  (Levenshtein) — funciona bem pra "Joao Silva" vs "joaosilva", mas não
  identifica automaticamente, por exemplo, um apelido completamente
  diferente do nome cadastrado; nesse caso o cadastro manual continua
  necessário.

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
