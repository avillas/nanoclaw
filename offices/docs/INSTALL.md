# NanoClaw Offices — Guia de Instalacao

## Pre-requisitos

- Git
- Node.js 20+ e npm 10+
- Bash 4+ (macOS: `brew install bash` se necessario)
- Claude Code CLI ou acesso ao Cowork com suporte a CLAUDE.md
- Container runtime: Docker Engine ou Apple Container (macOS 26+)

## Estrutura

```
offices/
├── _template/                  # Templates para criar novos escritorios
│   ├── CLAUDE.md.template
│   ├── agents/
│   └── skills/
├── shared/skills/              # 10 skills compartilhadas entre escritorios
├── marketing/                  # Escritorio de Marketing (10 agentes)
│   ├── CLAUDE.md
│   ├── agents/
│   ├── skills/
│   └── workflows/
├── development/                # Escritorio de Desenvolvimento (13 agentes)
│   ├── CLAUDE.md
│   ├── agents/
│   ├── skills/
│   └── workflows/
├── innovation/                 # Escritorio de Inovacao (6 agentes)
│   ├── CLAUDE.md
│   ├── agents/
│   ├── skills/
│   └── workflows/
├── dashboard/                  # Mission Control Dashboard (Next.js 16)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── lib/                # offices-reader, offices-writer, telegram-manager
│       ├── components/modals/  # create-agent, create-office, telegram-config
│       └── app/api/            # dashboard, offices, agents, pipelines, telegram
└── docs/
    ├── INSTALL.md
    └── install.sh
```

## Instalacao rapida

```bash
cd /caminho/do/seu/projeto
chmod +x offices/docs/install.sh
./offices/docs/install.sh
```

O script valida a estrutura, verifica arquivos ausentes e reporta o status da instalacao.

Para instalar em um diretorio diferente:

```bash
./offices/docs/install.sh --target /caminho/destino
```

## Instalacao manual

Se preferir instalar manualmente, copie a pasta `offices/` inteira para a raiz do seu projeto. A unica exigencia e que a estrutura de pastas seja mantida como esta.

## Como funciona

Cada escritorio e uma pasta independente com tres componentes:

**CLAUDE.md** — Arquivo principal carregado na inicializacao da sessao. Define a equipe, pipeline, regras de modelo, limites de custo e padroes de qualidade. Quando um agente e invocado dentro de um escritorio, ele le este arquivo para entender seu contexto.

**agents/** — Um arquivo `.md` por agente. O frontmatter define nome, escritorio, skills vinculadas, modelo, posicao no pipeline e conexoes (receives_from / delivers_to). O corpo define identidade, missao, regras operacionais, entregaveis e criterios de escalacao de modelo.

**skills/** — Uma pasta por skill, cada uma com um `SKILL.md`. O frontmatter define nome e descricao (usada para decidir quando carregar a skill). O corpo define quando usar, processo, formato de saida e diretrizes.

**workflows/** — Arquivo de pipeline que documenta os estagios, gates e regras de iteracao do escritorio.

**shared/skills/** — Skills compartilhadas por todos os escritorios (quality-gate, git-workflow, handoff-to-office, etc.).

## Escritorios disponiveis

### Marketing (10 agentes)

Pipeline: Content Writer → Content Reviewer → Instagram Strategist → Growth Hacker → Image Prompt Engineer → Brand Guardian → Campaign Validator → Carousel Publisher → Analytics Engineer

Orcamento: $10/day, $175/month

### Development (13 agentes)

Pipeline: Product Manager → Product Reviewer → UX Architect → UI Designer → Software Architect → Engineering Manager → [Frontend | Backend | DB Architect] (paralelo) → QA Engineer → Security Engineer → DevOps Engineer → Technical Writer

Orcamento: $10/day, $350/month

### Innovation (6 agentes)

Pipeline: Trend Researcher → Competitive Intelligence → Technology Scout → Business Case Builder → Opportunity Validator → Innovation Reporter → (handoff para Development)

Orcamento: $10/day, $20/month

## Skills compartilhadas

| Skill | Funcao |
|-------|--------|
| quality-gate | Framework de revisao e scoring de entregaveis |
| git-workflow | Regras de branch, commit e PR para Bitbucket |
| pull-request | Criacao e formatacao de PRs |
| handoff-to-office | Delegacao de tarefas entre escritorios |
| memory-gps | Busca e escrita na memoria persistente |
| web-research | Pesquisa web com limites de rate |
| daily-report | Relatorio diario de atividades |
| cost-check | Verificacao de orcamento antes de executar |
| approval-request | Solicitacao de aprovacao ao usuario |
| smart-model-switching | Selecao automatica de modelo por complexidade |

## Hierarquia de modelos

```
Ollama llama3.2:3b    → classificacao, tags, filtragem (sem entregavel)
Ollama qwen3:8b       → resumos, extracao estruturada, triagem
Haiku                  → formatacao, metricas, validacao, testes, docs
Sonnet (padrao)        → criacao de conteudo, codigo, design, analise
Opus (raro, justificar)→ decisoes arquiteturais complexas, estrategia
```

Regra: 80% das tarefas devem rodar em Haiku ou Sonnet. Opus < 5%.

## Criar um novo escritorio

**Forma recomendada:** Use o Mission Control Dashboard. Acesse `/offices`, clique em "New Office" e preencha o wizard de 4 passos. O Dashboard gera toda a estrutura de pastas, `CLAUDE.md` e `SOUL.md` automaticamente.

**Forma manual:**

1. Copie o template:
   ```bash
   cp -r offices/_template offices/nome-do-escritorio
   ```

2. Renomeie os arquivos `.template` removendo a extensao

3. Edite `CLAUDE.md` preenchendo: nome, missao, equipe, pipeline, modelo padrao, orcamento

4. Crie agentes em `agents/` seguindo o template (frontmatter + secoes)

5. Crie skills em `skills/` seguindo o template (frontmatter + secoes)

6. Crie o workflow em `workflows/` documentando os estagios e gates

## Container Runtime (Docker ou Apple Container)

O NanoClaw executa cada agente em um container isolado. O Mission Control Dashboard detecta automaticamente qual runtime esta disponivel no sistema.

### Runtimes suportados

| Runtime | Plataforma | Requisito | Como detecta |
|---------|-----------|-----------|-------------|
| Docker | Linux, macOS, Windows (WSL) | Docker Engine instalado, socket acessivel | Tenta `docker.sock` |
| Apple Container | macOS 26+ (Apple Silicon) | CLI `container` instalado | Tenta `container --version` |

### Ordem de deteccao

1. Se `CONTAINER_RUNTIME` esta definido no `.env`, usa o runtime especificado
2. Tenta Apple Container CLI (nativo no macOS 26+)
3. Tenta Docker via socket
4. Se nenhum disponivel, o Dashboard opera em modo mock (dados de demonstracao)

### Configuracao — Docker (Linux / macOS pre-26)

Instale Docker Engine seguindo a documentacao oficial para seu sistema. Certifique-se de que o socket esta acessivel:

```bash
# Linux (padrao)
ls -la /var/run/docker.sock

# macOS com Docker Desktop
ls -la ~/.docker/run/docker.sock
```

No `.env` do Dashboard:

```bash
CONTAINER_RUNTIME=docker
DOCKER_SOCKET=/var/run/docker.sock
```

### Configuracao — Apple Container (macOS 26+)

Apple Container e o runtime nativo do macOS 26 para containers Linux. Cada container roda em uma VM leve via Virtualization.framework.

Instalacao:

```bash
# Via Homebrew (quando disponivel)
brew install container

# Ou via GitHub releases
# https://github.com/apple/container/releases
```

Verifique a instalacao:

```bash
container --version
container list
```

No `.env` do Dashboard:

```bash
CONTAINER_RUNTIME=apple-container
# Opcional: caminho customizado do CLI
# APPLE_CONTAINER_CLI=/usr/local/bin/container
```

### Diferencas entre runtimes

Para os agentes do NanoClaw, ambos os runtimes sao equivalentes em funcionalidade. A principal diferenca e arquitetural:

- **Docker**: containers compartilham o kernel do host. Isolamento via cgroups/namespaces.
- **Apple Container**: cada container roda em sua propria VM leve. Isolamento completo via hypervisor.

O Dashboard abstrai essas diferencas — a mesma interface funciona com qualquer runtime. Os agentes nao precisam saber qual runtime esta em uso.

### Labels de container

Para que o Dashboard identifique containers do NanoClaw, use as labels:

```bash
# Docker
docker run --label com.nanoclaw.office=marketing --label com.nanoclaw.agent=content-writer ...

# Apple Container
container run --label com.nanoclaw.office=development --label com.nanoclaw.agent=backend-developer ...
```

O Dashboard filtra containers que contem `nanoclaw` no nome ou que possuem a label `com.nanoclaw.office`.

## Mission Control Dashboard

O Mission Control e o painel de monitoramento do NanoClaw. Mostra o status dos escritorios, agentes, pipelines, atividade e custos em tempo real. Roda como aplicacao Next.js dentro da pasta `offices/dashboard/`.

### Pre-requisitos

- Node.js 20+
- npm 10+
- Container runtime funcionando (Docker ou Apple Container — ver secao anterior)
- NanoClaw instalado e com pelo menos um `npx tsx setup/index.ts` executado (para gerar o `store/messages.db`)

### Instalacao

```bash
cd offices/dashboard
npm install
```

Se `better-sqlite3` falhar na compilacao, instale as dependencias de build:

```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt install build-essential python3

# Depois tente novamente
npm install
```

### Configuracao

Crie o arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Edite o `.env` com seus valores:

```bash
# URL do dashboard (nao altere se for rodar local na porta 3000)
NEXTAUTH_URL=http://localhost:3000

# Chave secreta para sessoes JWT — gere uma chave aleatoria:
# openssl rand -base64 32
NEXTAUTH_SECRET=<sua-chave-secreta-aqui>

# Credenciais de acesso ao dashboard
ADMIN_EMAIL=admin@nanoclaw.local
ADMIN_PASSWORD=<sua-senha-aqui>

# Caminho para o banco SQLite do NanoClaw (relativo a pasta dashboard/)
NANOCLAW_DB_PATH=../store/messages.db

# Runtime de containers — deixe comentado para auto-detectar
# CONTAINER_RUNTIME=docker

# Socket do Docker (Linux padrao)
DOCKER_SOCKET=/var/run/docker.sock

# Caminho raiz da instalacao NanoClaw (relativo a pasta dashboard/)
NANOCLAW_ROOT=..
```

**Importante:** O `NEXTAUTH_SECRET` deve ter no minimo 32 caracteres. Use `openssl rand -base64 32` para gerar.

### Executar em desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:3000`. Faca login com o email e senha definidos no `.env`.

### Build para producao

```bash
npm run build
npm start
```

O dashboard roda na porta 3000 por padrao. Para alterar:

```bash
PORT=8080 npm start
```

### O que o Dashboard mostra

| Pagina | Rota | Descricao |
|--------|------|-----------|
| Dashboard | `/dashboard` | KPIs gerais, cards dos escritorios com barras de orcamento, contagem de containers |
| Offices | `/offices` | Lista dos escritorios com status, contagem de agentes e botao para criar novos escritorios |
| Office Detail | `/offices/[slug]` | Agentes do escritorio, pipeline, status de container, status do Telegram e botao para criar agentes |
| Agents | `/agents` | Tabela de todos os agentes com filtros por escritorio/status e botao para criar novos agentes |
| Pipelines | `/pipelines` | Execucoes de pipeline com progresso, stages e quality gates |
| Activity | `/activity` | Timeline de eventos com mensagens do SQLite e acoes dos agentes |
| Costs | `/costs` | Consumo diario/mensal por escritorio com alertas de orcamento |
| Telegram | `/telegram` | Configuracao global do bot e vinculacao de grupos por escritorio |

### Criar agentes pelo Dashboard

O Mission Control permite criar novos agentes diretamente pela interface, sem precisar editar arquivos `.md` manualmente.

**Como usar:**
1. Acesse a pagina Agents (`/agents`) ou a pagina de detalhe de um escritorio (`/offices/[slug]`)
2. Clique no botao "New Agent"
3. Preencha o wizard de 4 passos:
   - **Basics** — nome, escritorio, modelo padrao, skill vinculada, posicao no pipeline
   - **Identity** — identidade e missao do agente
   - **Rules** — regras operacionais, entregaveis, criterios de conclusao, escalacao de modelo
   - **Review** — revisar e confirmar

O Dashboard gera automaticamente o arquivo `.md` do agente no diretorio `agents/` do escritorio selecionado, seguindo o padrao de frontmatter + secoes (Identity, Mission, Operating Rules, Deliverables, Completion Criteria, Model Escalation). O cache de dados e invalidado apos a criacao.

**API:** `POST /api/agents` com o payload JSON do agente. Metadados (lista de escritorios e skills disponiveis) em `GET /api/agents/meta`.

### Criar escritorios pelo Dashboard

Novos escritorios podem ser criados diretamente pela interface, gerando toda a estrutura de pastas necessaria.

**Como usar:**
1. Acesse a pagina Offices (`/offices`)
2. Clique no botao "New Office"
3. Preencha o wizard de 4 passos:
   - **Basics** — nome, missao, modelo padrao, orcamento diario e mensal
   - **Soul (parte 1)** — quem somos, como pensamos, como nos comunicamos, nossos valores
   - **Soul (parte 2)** — como raciocinamos, o que nao toleramos, relacao com o usuario, estilo de entrega
   - **Review** — preview da estrutura de arquivos e confirmacao

O Dashboard cria automaticamente:
- Diretorio do escritorio com subpastas (`agents/`, `skills/`, `workflows/`)
- `CLAUDE.md` com configuracao completa (missao, pipeline inicial, modelo, orcamento)
- `SOUL.md` com a personalidade do escritorio

O escritorio aparece imediatamente na sidebar e em todas as paginas do Dashboard gracas a descoberta dinamica via filesystem.

**API:** `POST /api/offices` com o payload JSON do escritorio.

### Configurar Telegram pelo Dashboard

O NanoClaw utiliza um **bot unico** do Telegram que atende todos os escritorios. O bot e adicionado a grupos distintos — cada grupo corresponde a um escritorio. A depender do grupo de origem da mensagem, o bot responde com o contexto do escritorio correto.

A configuracao e feita em duas etapas no Dashboard:

**Etapa 1 — Configurar o bot (global):**
1. Acesse a pagina Telegram (`/telegram`) no menu lateral
2. Clique em "Configurar Bot" e cole o token do @BotFather
3. Valide o token e salve

**Etapa 2 — Vincular grupos (por escritorio):**
1. Na mesma pagina Telegram, clique em "Vincular Grupo" no card do escritorio
2. Selecione um grupo detectado automaticamente ou insira o ID manualmente
3. O Dashboard registra o grupo no NanoClaw e reinicia o servico

Ou, acesse a pagina de detalhe do escritorio (`/offices/[slug]`) e clique em "Vincular Grupo" no card de Telegram.

**Indicador na sidebar:** Cada escritorio exibe um icone de Telegram na sidebar — verde se conectado, apagado se nao configurado.

**O que o Dashboard faz nos bastidores:**
1. Valida o token contra `https://api.telegram.org/bot<token>/getMe`
2. Salva `TELEGRAM_BOT_TOKEN` (unico) no `.env` do NanoClaw
3. Salva `TELEGRAM_GROUP_ID_<OFFICE>` no `.env` para cada escritorio vinculado
4. Sincroniza `.env` para `data/env/env`
5. Executa `npx tsx setup/index.ts --step register` com os parametros do grupo
6. Reinicia o processo via PM2

**API:** `POST /api/telegram` com actions: `test-token`, `save-token`, `get-chats`, `link-group`. Status em `GET /api/telegram`.

### Integracao com o NanoClaw

O Dashboard se conecta a tres fontes de dados:

**Filesystem (arquivos .md)** — Le configuracoes de escritorios (`CLAUDE.md`), agentes (`agents/*.md`), personalidade (`SOUL.md`) e pipelines (`workflows/*.md`) diretamente do disco. Isso significa que o Dashboard sempre reflete o estado real da instalacao — escritorios, agentes, orcamentos e pipelines sao lidos dos mesmos arquivos que os agentes usam. As leituras sao cacheadas por 30 segundos para performance. Novos escritorios e agentes criados pelo Dashboard geram os `.md` correspondentes e invalidam o cache imediatamente.

**SQLite** (`store/messages.db`) — Le mensagens trocadas entre agentes e grupos registrados. Aberto em modo somente-leitura, sem risco de corromper dados do NanoClaw. Se o arquivo nao existir, o Dashboard opera normalmente sem dados de atividade.

**Container Runtime** — Lista containers do NanoClaw, coleta metricas de CPU/memoria/rede. Filtra por containers que contenham `nanoclaw` no nome ou que tenham a label `com.nanoclaw.office`. Se nenhum runtime estiver disponivel, opera sem dados de container.

### Auto-refresh

O Dashboard atualiza dados automaticamente:

- KPIs e escritorios: a cada 15 segundos
- Agentes e containers: a cada 10 segundos
- Pipelines: a cada 5 segundos
- Activity: a cada 10 segundos

### Rodar junto com o NanoClaw

Para que o Dashboard suba automaticamente junto com o NanoClaw:

**macOS (launchd):**

Crie `~/Library/LaunchAgents/com.nanoclaw.dashboard.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.nanoclaw.dashboard</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>node_modules/.bin/next</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/caminho/para/offices/dashboard</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>3000</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/caminho/para/offices/dashboard/logs/dashboard.log</string>
  <key>StandardErrorPath</key>
  <string>/caminho/para/offices/dashboard/logs/dashboard-error.log</string>
</dict>
</plist>
```

Ative o servico:

```bash
mkdir -p offices/dashboard/logs
launchctl load ~/Library/LaunchAgents/com.nanoclaw.dashboard.plist
```

Para parar: `launchctl unload ~/Library/LaunchAgents/com.nanoclaw.dashboard.plist`

**Linux (systemd):**

Crie `~/.config/systemd/user/nanoclaw-dashboard.service`:

```ini
[Unit]
Description=NanoClaw Mission Control Dashboard
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/caminho/para/offices/dashboard
ExecStart=/usr/bin/node node_modules/.bin/next start
Environment=PORT=3000
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Ative o servico:

```bash
mkdir -p offices/dashboard/logs
systemctl --user daemon-reload
systemctl --user enable nanoclaw-dashboard
systemctl --user start nanoclaw-dashboard
```

Para ver logs: `journalctl --user -u nanoclaw-dashboard -f`

**Alternativa rapida (sem servico):**

Se preferir subir manualmente junto com o NanoClaw, adicione ao seu script de startup:

```bash
#!/bin/bash
# start-nanoclaw.sh

# Sobe o NanoClaw
cd /caminho/para/nanoclaw
npm start &

# Sobe o Dashboard
cd /caminho/para/offices/dashboard
npm run build && npm start &

echo "NanoClaw + Dashboard rodando"
echo "Dashboard: http://localhost:3000"
```

### Troubleshooting do Dashboard

**Tela de login aparece mas nao aceita credenciais:**
- Verifique se `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` estao corretos
- Confirme que `NEXTAUTH_SECRET` tem pelo menos 32 caracteres
- Limpe cookies do navegador e tente novamente

**Dashboard mostra dados mock (nao conecta ao SQLite):**
- Verifique se `NANOCLAW_DB_PATH` aponta para o arquivo correto
- Confirme que o `store/messages.db` existe: `ls -la ../store/messages.db`
- O dashboard abre o SQLite em modo somente-leitura — permissoes de leitura sao suficientes

**Dashboard nao detecta containers:**
- Verifique se o container runtime esta rodando: `docker ps` ou `container list`
- Confirme que o socket esta acessivel: `ls -la /var/run/docker.sock`
- Verifique se os containers tem `nanoclaw` no nome ou a label `com.nanoclaw.office`
- Veja qual runtime foi detectado em `http://localhost:3000/api/runtime`

**Erro de build com better-sqlite3:**
- Instale ferramentas de compilacao: `xcode-select --install` (macOS) ou `sudo apt install build-essential python3` (Linux)
- Se usar nvm, certifique-se de que o node-gyp usa a mesma versao: `npm rebuild better-sqlite3`

**Porta 3000 ja em uso:**
- Use outra porta: `PORT=8080 npm run dev`
- Ou encerre o processo: `lsof -i :3000` e `kill <PID>`

## Configuracao do Bot de Telegram

O NanoClaw utiliza um **bot unico** do Telegram que atende todos os escritorios. O bot e adicionado a grupos distintos e, a depender do grupo de origem da mensagem, responde com o contexto do escritorio correto. Isso garante isolamento de contexto sem a complexidade de manter multiplos bots.

**Forma recomendada:** Use o Mission Control Dashboard. Acesse a pagina Telegram (`/telegram`), configure o token do bot e vincule um grupo a cada escritorio. Veja a secao "Configurar Telegram pelo Dashboard" acima.

A configuracao manual abaixo continua disponivel para casos onde o Dashboard nao esta acessivel.

### Pre-requisitos

- NanoClaw instalado e funcional (`/setup` ja executado)
- Canal Telegram basico ja configurado (`/add-telegram` ja executado)
- Node.js 20+
- Acesso ao Telegram via @BotFather

### Passo 1 — Criar o bot no BotFather

Abra o Telegram, procure `@BotFather` e crie um unico bot:

1. Envie `/newbot` e siga as instrucoes
2. Escolha um nome descritivo (ex: `NanoClaw Bot`) e um username (ex: `seuprojeto_nanoclaw_bot`)
3. O BotFather retornara um token no formato `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. Guarde este token.

### Passo 2 — Configurar privacidade de grupo

Ainda no @BotFather:

```
/mybots → selecionar o bot → Bot Settings → Group Privacy → Turn off
```

Isso permite que o bot receba todas as mensagens dos grupos (nao apenas @mencoes). Obrigatorio para o funcionamento correto.

### Passo 3 — Criar grupos no Telegram

Crie um grupo por escritorio e adicione o **mesmo bot** a todos:

| Grupo | Descricao |
|-------|-----------|
| NanoClaw Marketing | Demandas de campanha, aprovacoes, relatorios |
| NanoClaw Development | Demandas de desenvolvimento, handoffs da inovacao |
| NanoClaw Innovation | Relatorios de pesquisa, aprovacoes de oportunidades |

Adicione o bot a cada grupo e envie uma mensagem qualquer para que o bot registre o chat. O ID do chat sera necessario no proximo passo. Formato:
- Grupo: `tg:-1001234567890` (numero negativo)

### Passo 4 — Configurar variaveis de ambiente

Adicione o token unico e os group IDs ao `.env` do NanoClaw:

```bash
# Telegram — bot unico, multiplos grupos
TELEGRAM_BOT_TOKEN=<token-do-bot>

TELEGRAM_GROUP_ID_MARKETING=tg:<chat-id-marketing>
TELEGRAM_GROUP_ID_DEVELOPMENT=tg:<chat-id-development>
TELEGRAM_GROUP_ID_INNOVATION=tg:<chat-id-innovation>
```

Sincronize com o container:

```bash
mkdir -p data/env && cp .env data/env/env
```

### Passo 5 — Registrar os chats

Registre cada grupo como canal do escritorio correspondente. Adapte os comandos abaixo com os chat IDs obtidos no Passo 3:

```bash
# Marketing — canal principal (responde a todas as mensagens)
npx tsx setup/index.ts --step register -- \
  --jid "tg:<chat-id-marketing>" \
  --name "Marketing Office" \
  --folder "telegram_marketing" \
  --trigger "@marketing" \
  --channel telegram \
  --no-trigger-required \
  --is-main

# Development — canal principal
npx tsx setup/index.ts --step register -- \
  --jid "tg:<chat-id-dev>" \
  --name "Development Office" \
  --folder "telegram_development" \
  --trigger "@dev" \
  --channel telegram \
  --no-trigger-required \
  --is-main

# Innovation — canal principal
npx tsx setup/index.ts --step register -- \
  --jid "tg:<chat-id-innovation>" \
  --name "Innovation Office" \
  --folder "telegram_innovation" \
  --trigger "@innovation" \
  --channel telegram \
  --no-trigger-required \
  --is-main
```

### Passo 6 — Build e restart

```bash
npm run build

# macOS
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Linux
systemctl --user restart nanoclaw
```

### Passo 7 — Verificar conexao

Envie uma mensagem de teste em cada grupo:
- No grupo Marketing: qualquer mensagem de campanha
- No grupo Development: qualquer demanda de feature
- No grupo Innovation: qualquer pergunta de pesquisa

O bot deve responder em 3-5 segundos. Se nao responder, verifique os logs:

```bash
tail -f logs/nanoclaw.log
```

### Configuracao de Swarm (agentes com identidade visual)

Para que cada agente do escritorio apareca com sua propria identidade no grupo do Telegram (ex: Content Writer, Brand Guardian, Software Architect), use a skill `/add-telegram-swarm` apos o Telegram basico estar funcionando.

Para cada escritorio, crie bots adicionais (pool bots) que representarao os agentes:

**Marketing (exemplo com 5 pool bots):**

| Bot pool | Username | Representa |
|----------|----------|-----------|
| Pool 1 | `seuprojeto_mkt_agent1_bot` | Content Writer |
| Pool 2 | `seuprojeto_mkt_agent2_bot` | Content Reviewer |
| Pool 3 | `seuprojeto_mkt_agent3_bot` | Instagram Strategist |
| Pool 4 | `seuprojeto_mkt_agent4_bot` | Brand Guardian |
| Pool 5 | `seuprojeto_mkt_agent5_bot` | Campaign Validator |

Repita para Development e Innovation. 3-5 pool bots por escritorio e suficiente — o round-robin reutiliza bots quando ha mais agentes que pool bots.

Para cada pool bot:
1. Crie com @BotFather (`/newbot`)
2. Desabilite Group Privacy (`Bot Settings → Group Privacy → Turn off`)
3. Adicione ao grupo do escritorio
4. Adicione o token no `.env` seguindo o padrao do skill `/add-telegram-swarm`

Os subagentes usam `send_message` com o parametro `sender` correspondente ao nome do agente (ex: `sender: "Content Writer"`), e o NanoClaw automaticamente renomeia o pool bot para exibir aquela identidade.

### Troubleshooting

**Bot nao responde:**
- Verifique se o token esta correto no `.env` e em `data/env/env`
- Confirme que o chat esta registrado: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'tg:%'"`
- Verifique se o servico esta rodando

**Bot so responde a @mencoes no grupo:**
- Group Privacy esta habilitado — desabilite via BotFather e re-adicione o bot ao grupo

**Obter chat ID manualmente:**
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | jq '.result[-1].message.chat.id'
```

### Limites de rate do Telegram

- Broadcast: 30 mensagens/segundo
- Por chat individual: 1 mensagem/segundo
- Em grupos: 20 mensagens/minuto

Os rate limits definidos nos CLAUDE.md dos escritorios (minimo 5s entre API calls) ja respeitam esses limites.

## Convencoes

- Nomes de arquivo: kebab-case (`content-writer.md`, `quality-gate/SKILL.md`)
- Frontmatter: YAML com campos obrigatorios (name, office, skill, model, pipeline_position)
- Commits: `type(scope): description` (feat, fix, refactor, test, docs, chore)
- Branches: `agent/{agent-name}/{task-id}-{description}`
- Contexto na inicializacao: maximo 8KB (apenas CLAUDE.md + identidade do agente)
