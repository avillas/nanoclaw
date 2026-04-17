---
name: codebase-mapper
description: Operational playbook for the Codebase Mapper agent — how to discover projects, read their CLAUDE.md via Bitbucket REST API, extract stack/deps/structure, detect cross-project dependencies, cache the map under /workspace/global/codebase-maps/, and produce a concise summary for the downstream pipeline.
---

# Codebase Mapper — Playbook

## Localização do workspace

- **Bitbucket Cloud workspace:** `mariliadias`
- **Auth:** transparente via OneCLI proxy (header `Authorization` injetado em `api.bitbucket.org` e `bitbucket.org`)
- **Main branch:** varia por repo — **sempre** descobrir via API antes de consultar `src/`

## Cache global

**Pasta:** `/workspace/global/codebase-maps/`  
**Um arquivo por projeto:** `<repo-slug>.md` (match exato com o slug do repo no Bitbucket)  
**Index:** `index.md` com entrada de uma linha por projeto mapeado

Política de re-mapeamento:
1. Ao entrar em ação, para cada projeto afetado, leia `/workspace/global/codebase-maps/<slug>.md` (se existir)
2. Extraia `last_mapped_sha` do frontmatter
3. Busque o HEAD atual da main branch (`GET /repositories/.../refs/branches/<main>` → `.target.hash`)
4. Se os SHAs baterem → **reuse o mapa existente**, só atualize `last_accessed` no frontmatter
5. Se divergirem → **remapeie**, preservando `created:` original, atualizando `last_mapped_sha`, `last_mapped_at`, `updated:`

## Boot (toda invocação)

```bash
# 1. Identificar quais projetos estão envolvidos na demanda
#    Entradas possíveis:
#    - O usuário cita nome de repo(s) explicitamente
#    - A demanda menciona "gestor lotérico", "prognext", etc. (match contra index)
#    - Dependência cross-project força incluir outros projetos

# 2. Listar todos os repos do workspace pra ter certeza dos slugs válidos
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias?pagelen=100&fields=values.slug,values.mainbranch,values.description" \
  | jq '.values[] | {slug, main: .mainbranch.name, desc: .description}'

# 3. Pra cada projeto afetado, fetch o sha da main branch
MAIN_BRANCH=$(curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<slug>" | jq -r '.mainbranch.name')
HEAD_SHA=$(curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<slug>/refs/branches/$MAIN_BRANCH" | jq -r '.target.hash')
```

## Inspeção do projeto

### 1. CLAUDE.md do repo (fonte primária)

```bash
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<slug>/src/<main-branch>/CLAUDE.md"
```

Se existe: é a **fonte de verdade** — descreve stack, layout, convenções, dependências declaradas, como rodar, como testar. Extraia essas infos diretamente.

Se não existe: cair no fluxo de inferência (abaixo). Ao final, sugerir ao usuário/time que o projeto precisa de um `CLAUDE.md`.

### 2. Árvore raiz

```bash
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<slug>/src/<main-branch>/?pagelen=100" \
  | jq '.values[] | {path, type, size}'
```

Identificar arquivos-sinal:

| Arquivo | Stack inferida | Ler conteúdo |
|---------|----------------|--------------|
| `package.json` | Node.js / JS / TS | sim — `dependencies`, `devDependencies`, `scripts`, `engines` |
| `tsconfig.json` | TypeScript | sim — target, module |
| `go.mod` | Go | sim — `module`, `require` |
| `go.sum` | Go | não (só confirma) |
| `pom.xml` | Java/Maven | sim — group, artifact, dependencies |
| `build.gradle` / `build.gradle.kts` | Java/Kotlin/Gradle | sim — dependencies |
| `requirements.txt` | Python pip | sim — lista de libs |
| `pyproject.toml` | Python moderno | sim — `dependencies`, `tool.*` |
| `Pipfile` | Python pipenv | sim |
| `composer.json` | PHP | sim |
| `Gemfile` | Ruby | sim |
| `Cargo.toml` | Rust | sim |
| `Dockerfile` | container | sim — base image, exposed ports |
| `docker-compose.yml` | multi-serviço | sim — services e suas relações |
| `bitbucket-pipelines.yml` | CI Bitbucket | sim — steps de build/deploy |
| `.github/workflows/` | CI GitHub (raro aqui) | listar |
| `.env.example` | config esperada | sim — lista de env vars, inclusive URLs de outros serviços |
| `README.md` | humano-readable | resumir |

### 2.5. Design surface (obrigatório para projetos com UI)

Se o projeto é frontend ou tem UI, extrair o estado atual do design system. É o insumo que o **UX Architect e o UI Designer** consomem pra propor features consistentes com o que já existe.

**Arquivos-sinal de design system:**

| Arquivo | O que extrair |
|---------|---------------|
| `tailwind.config.*` | `theme.extend.colors`, `fontFamily`, `spacing`, `borderRadius`, breakpoints |
| `tailwind.css` / `globals.css` / `app.css` | CSS variables (`--color-*`, `--font-*`) |
| `src/theme/` ou `src/styles/` | arquivos de tema, tokens exportados |
| `src/design-system/` / `packages/ui/` | catálogo de componentes (listar arquivos e props de cada) |
| `src/components/` | inventário de componentes existentes (nome + função inferida do nome) |
| `src/pages/` ou `src/app/` (Next.js) / `src/routes/` | inventário de páginas/rotas existentes |
| `.storybook/` | indica que há Storybook — listar stories |
| `figma.config` / `.figmarc` | referência ao Figma se documentada |
| `public/` + `src/assets/` | logos, ícones, fonts locais |

**Como extrair:**

```bash
# Ler tailwind config (se existir)
curl -s ".../src/<main>/tailwind.config.js" 2>/dev/null
curl -s ".../src/<main>/tailwind.config.ts" 2>/dev/null

# CSS variables do globals.css
curl -s ".../src/<main>/src/styles/globals.css" 2>/dev/null | grep -E '^\s*--[a-z-]+:'

# Listar componentes (top-level of components/)
curl -s ".../src/<main>/src/components/?pagelen=100" 2>/dev/null \
  | jq '.values[] | .path' -r

# Listar páginas
curl -s ".../src/<main>/src/pages/?pagelen=100" 2>/dev/null
curl -s ".../src/<main>/src/app/?pagelen=100" 2>/dev/null  # Next.js app router
```

**Output no mapa (seção Design Surface):**

```yaml
design_surface:
  design_system_location: src/design-system | null
  tokens:
    colors:
      primary: "#1e40af"
      secondary: "#64748b"
      accent: "#10b981"
      surface: ...
    typography:
      font_families: [Inter, JetBrains Mono]
      scale: [xs, sm, base, lg, xl, 2xl, 3xl]
    spacing: [0, 1, 2, 4, 8, 12, 16, 24, 32]
    border_radius: [none, sm, md, lg, full]
    breakpoints: [sm:640, md:768, lg:1024, xl:1280]
  components_catalog:
    - Button (variants: primary, secondary, ghost)
    - Card
    - Modal
    - DataTable
  pages_inventory:
    - /login
    - /dashboard
    - /reports
    - /settings
  storybook: true | false
  style_frameworks: [tailwind, css-modules]
```

Se o projeto **não tem** design system codificado (só CSS ad-hoc), registre `design_system_location: null` e liste as cores/fonts observadas no CSS como "ad-hoc". Isso sinaliza ao UX/UI que precisam propor formalização.

### 3. Estrutura de pastas

Listar top-level e classificar:

```bash
curl -s ".../src/<main>/?pagelen=100" | jq -r '.values[] | select(.type=="commit_directory") | .path'
```

Convenções comuns:
- Go: `cmd/`, `internal/`, `pkg/`, `api/`, `proto/`, `scripts/`, `migrations/`
- Node backend: `src/`, `routes/`, `controllers/`, `services/`, `models/`, `migrations/`
- Node frontend: `src/`, `pages/`, `components/`, `hooks/`, `public/`, `api/`
- Java: `src/main/java/`, `src/main/resources/`, `src/test/`
- Python: `<pkg>/`, `tests/`, `migrations/`

Registrar a listagem top-level literal + uma classificação curta ("parece Node backend com Express + migrations").

### 4. Dependências cross-project

**Estratégia 1 — declarada no CLAUDE.md do repo:**

Procurar no texto seções tipo `## Dependencies`, `## Serviços externos`, `## Integrações` ou menções explícitas a outros repos do workspace (`gestor-loterico-microservice`, etc.).

**Estratégia 2 — inferir do código/config:**

```bash
# Procurar URLs de serviços internos no .env.example
curl -s ".../src/<main>/.env.example" 2>/dev/null | grep -iE "_URL=|_HOST=|_ENDPOINT="

# Procurar referências a outros slugs conhecidos no código
for other_slug in $(ls /workspace/global/codebase-maps/*.md 2>/dev/null | xargs -I{} basename {} .md); do
  [ "$other_slug" = "index" ] && continue
  # Busca leve via API search (se disponível) ou fetch de arquivos suspeitos
done
```

**Formato no mapa:**

```yaml
dependencies:
  internal_cross_project:
    - target: gestor-loterico-microservice
      kind: HTTP_API
      endpoint_prefix: /api/v1
      evidence: "env var MICROSERVICE_URL em .env.example"
  external_services:
    - name: Stripe
      kind: billing
      evidence: "stripe@15.x em package.json"
```

## Template do mapa

Shape obrigatório em `/workspace/global/codebase-maps/<slug>.md`:

```markdown
---
slug: <repo-slug>
title: <Nome legível do projeto>
type: codebase-map
created: YYYY-MM-DD
updated: YYYY-MM-DD
last_accessed: YYYY-MM-DD
last_mapped_at: YYYY-MM-DD HH:MM UTC
last_mapped_sha: <sha do HEAD quando mapeado>
last_mapped_branch: <main branch name>
main_branch: master | development
stack:
  language: [typescript, go, ...]
  framework: [express, next, ...]
  runtime: [node 22, go 1.23, ...]
role: [frontend | microservice | library | monorepo | greenfield | ...]
has_ui: true | false
dependencies:
  internal_cross_project:
    - target: <other-slug>
      kind: HTTP_API | SHARED_LIB | DB_SHARED | ...
      evidence: <where we found it>
  external_services: []
  major_libs: []
design_surface:
  design_system_location: <path> | null
  tokens:
    colors: {}
    typography: {}
    spacing: []
    border_radius: []
    breakpoints: []
  components_catalog: []
  pages_inventory: []
  storybook: true | false
  style_frameworks: []
entry_points: []
ci: [bitbucket-pipelines | github | none]
tags: []
---

# <Nome>

## Resumo

<3-5 linhas copiadas/condensadas do CLAUDE.md do repo, ou inferidas se não existir>

## Stack

- **Linguagem:** ...
- **Framework:** ...
- **Runtime:** ...
- **Banco/infra:** ...

## Layout

```
<top-level tree relevante>
```

Breve explicação de cada pasta importante.

## Pontos de entrada

- `cmd/server/main.go` — binário HTTP
- `src/cli.ts` — CLI do projeto
- ...

## Design surface

_Preenchido se `has_ui: true`. Consumido primariamente pelo UX Architect e UI Designer antes de propor features._

### Design system

Local: `src/design-system/` (ou `null` se não existir)

**Tokens de cor:**
- `primary: #1e40af`
- `secondary: #64748b`
- (…)

**Tipografia:** Inter (sans), JetBrains Mono (mono). Scale: xs → 3xl.

**Espaçamento / radius / breakpoints:** (listagem observada)

### Catálogo de componentes

- `Button` (variants: primary, secondary, ghost)
- `Card`
- `Modal`
- (…)

### Inventário de páginas/rotas

- `/login`
- `/dashboard`
- (…)

### Frameworks de estilo

- Tailwind 3.x / CSS Modules / styled-components

### Gaps observados

- (Ex.: "não tem variante de erro em Button", "Modal não é responsivo em mobile")

## Dependências cross-project

- `[[codebase-maps/outro-slug]]` — consumidor de X via HTTP em /api/v1
- ...

## Bibliotecas / serviços externos relevantes

- `@aws-sdk/client-s3` — upload de arquivos
- Stripe API — billing
- ...

## Testes

- Framework: jest | go test | pytest | ...
- Localização: `tests/` | `*_test.go` | ...
- Comando: `npm test` | `go test ./...` | ...

## CI

- Pipeline: `bitbucket-pipelines.yml` / none
- Etapas: build → test → deploy

## Convenções do projeto

<Copiar de CLAUDE.md ou observar do código>

## Pontos de atenção pro pipeline

<Algo não-óbvio que um developer novo precisa saber ao mexer aqui — ex.: "mudanças em X exigem regenerar Y", "migrations devem seguir ordem Z">

## Histórico de mapeamentos

- YYYY-MM-DD HH:MM — sha <short> — <motivo: primeira vez, cache invalidado, diff significativo>
```

## Index global

`/workspace/global/codebase-maps/index.md`:

```markdown
---
title: Codebase Maps Index
type: index
updated: YYYY-MM-DD
---

# Codebase Maps

Mapas de código de todos os projetos relevantes do workspace Bitbucket `mariliadias`. Cada entrada aponta pro arquivo `<slug>.md` com detalhes.

## Projetos mapeados

| Slug | Role | Stack | Deps críticas | Último mapeamento |
|------|------|-------|---------------|-------------------|
| [[codebase-maps/gestor-loterico-front]] | frontend | Next.js 14 | [[codebase-maps/gestor-loterico-microservice]] | 2026-04-17 |
| ...  | ...  | ...   | ...           | ...               |

## Grupos de projetos relacionados

### Gestor Lotérico
- `gestor-loterico-front` — UI
- `gestor-loterico-microservice` — backend
- `gestor-loterico-db` — schema e migrations (se separado)

### Prognext
- ...
```

Atualizar em toda mapeamento/re-mapeamento.

## Entrega ao pipeline

Devolva ao orquestrador um **resumo curto** (≤25 linhas) organizado em duas partes:

```markdown
## Codebase Map — <demanda>

**Projetos primários:** gestor-loterico-front, gestor-loterico-microservice
**Stack:** front = Next.js 14 / TS; micro = Go 1.23 / chi

### Pra UX/UI (design surface)

- **Design system:** `gestor-loterico-front/src/design-system/` (Tailwind + tokens próprios)
- **Paleta:** primary #1e40af, secondary #64748b, accent #10b981
- **Tipografia:** Inter + JetBrains Mono, scale xs→3xl
- **Componentes existentes:** Button (3 variants), Card, Modal, DataTable, Toast
- **Páginas existentes:** /login, /dashboard, /relatorios, /configuracoes
- **Padrão de novas páginas:** usar Layout + Card + Breadcrumb do design system
- **Gaps:** Modal não é responsivo em mobile; sem variante de erro em Button

### Pra Software Architect / Developers

**Mudança vai tocar:**
- `gestor-loterico-front/src/pages/relatorios.tsx` — adicionar botão
- `gestor-loterico-microservice/internal/report/handler.go` — novo endpoint
- Contrato HTTP entre os dois em `/api/v1/report/download`

**Dependências cross-project relevantes:**
- front → micro via `MICROSERVICE_URL` (env var)

**Pontos de atenção:**
- micro tem migrations gerenciadas por golang-migrate — se precisar de nova tabela, EM deve coordenar com DB Architect
- CI do front usa `npm test` sem cobertura mínima configurada

**Mapas completos:**
- [[codebase-maps/gestor-loterico-front]]
- [[codebase-maps/gestor-loterico-microservice]]
```

A primeira parte alimenta o UX Architect e o UI Designer. A segunda parte alimenta o Software Architect em diante.

## Checklist antes de entregar

- [ ] Todos os projetos primários da demanda foram identificados (se incerto, flagrar ao usuário)
- [ ] Cada projeto tem mapa em `/workspace/global/codebase-maps/<slug>.md` com `last_mapped_sha` = HEAD atual
- [ ] Dependências cross-project estão no frontmatter + seção do mapa
- [ ] Index global atualizado
- [ ] Resumo ao pipeline tem pontos de atenção concretos, não genéricos
- [ ] Nenhuma inferência sem evidência (tudo com `evidence:` apontando ao arquivo)
