---
name: clickup-project-manager
description: Playbook of the ClickUp Project Manager agent — how to authenticate, query the ClickUp REST API, manage a library of report templates, generate PDFs, upload to S3, schedule recurring reports, and surface process improvements. Load on every invocation of the clickup-project-manager agent.
---

# ClickUp Project Manager — Operational Playbook

## Boot sequence (obrigatório em toda invocação)

```bash
# 1. Carrega config do grupo corrente — workspace ID e info contextual.
#    O TOKEN não está mais aqui — é injetado pelo OneCLI proxy.
CLICKUP_CONFIG=""
for candidate in /workspace/group/clickup.md /workspace/global/clickup.md; do
  [ -f "$candidate" ] && CLICKUP_CONFIG="$candidate" && break
done

# 2. Extrai workspace ID
CLICKUP_WORKSPACE=$(grep -A2 '^## Workspace' "$CLICKUP_CONFIG" 2>/dev/null \
  | grep 'ID:' | sed 's/.*ID:\*\* *//' | tr -d ' ')

# 3. Carrega biblioteca de templates
ls /workspace/global/report-templates/*.md 2>/dev/null
```

**Token gerenciado pelo OneCLI vault** (secret `ClickUp`, host pattern `api.clickup.com`). Toda chamada `curl https://api.clickup.com/...` recebe o header `Authorization` injetado automaticamente pelo proxy — você nunca vê ou manipula o token.

Se um curl falhar com 401, confirme via shell que o secret está ativo:

```bash
curl -fsSL "$ONECLI_URL/secrets" 2>/dev/null | jq '.data[] | select(.hostPattern=="api.clickup.com")'
```

Se faltar workspace ID, peça ao usuário ou descubra via `GET /api/v2/team` (qualquer chamada autenticada lista os teams visíveis).

## ClickUp API v2 — endpoints essenciais

Base URL: `https://api.clickup.com/api/v2/`  
Auth: **automática via OneCLI proxy** — não passe `-H "Authorization: ..."` nos curls (vai bater contra o header injetado).  
Rate limit: **100 req/min por token** — pause 600ms entre chamadas em loops.

### Discovery

```bash
# Spaces do workspace
curl -s "https://api.clickup.com/api/v2/team/$CLICKUP_WORKSPACE/space" | jq '.spaces[] | {id, name}'

# Folders de um space
curl -s "https://api.clickup.com/api/v2/space/$SPACE_ID/folder" | jq '.folders[] | {id, name}'

# Lists de um folder (ou folderless em um space)
curl -s "https://api.clickup.com/api/v2/folder/$FOLDER_ID/list"
curl -s "https://api.clickup.com/api/v2/space/$SPACE_ID/list"  # folderless

# Members de um workspace
curl -s "https://api.clickup.com/api/v2/team/$CLICKUP_WORKSPACE"
```

### Tasks

```bash
# Tasks de um list com filtros
curl -s "https://api.clickup.com/api/v2/list/$LIST_ID/task?\
archived=false&subtasks=true&include_closed=false&\
statuses[]=in+progress&statuses[]=review&\
assignees[]=$USER_ID&\
due_date_gt=$(date -d '7 days ago' +%s000)&\
page=0"

# Detalhe de uma task (incluindo campos customizados)
curl -s "https://api.clickup.com/api/v2/task/$TASK_ID?custom_fields=true&include_subtasks=true"

# Time tracking
curl -s "https://api.clickup.com/api/v2/team/$CLICKUP_WORKSPACE/time_entries?\
start_date=$(date -d '1 month ago' +%s000)&end_date=$(date +%s000)&assignee=$USER_ID"
```

### Custom fields e statuses

Statuses variam por list — cheque `GET /list/{list_id}` para enumerar. Custom fields vêm em `custom_fields: [{id, name, type, value}]` dentro da task.

## Biblioteca de templates

**Localização:** `/workspace/global/report-templates/<slug>.md`  
**Slug:** minúsculo-com-hífens, ex.: `sprint-status-semanal`, `time-tracking-pessoal`, `burndown-projeto-x`.

### Shape obrigatório

```markdown
---
title: <Título legível>
slug: <slug>
created: YYYY-MM-DD
updated: YYYY-MM-DD
requested_by: [user1, user2]
last_run: YYYY-MM-DD HH:MM BRT
run_count: N
learned_from: [[daily/YYYY-MM-DD]]
clickup_scope:
  workspace: "<id>"
  spaces: ["<id>", ...]
  lists: ["<id>", ...]
  filters:
    statuses: [...]
    assignees: [...]
schedule_suggestions:
  - cron: "0 12 * * 5"
    tz: "America/Sao_Paulo"
    description: "Toda sexta 09:00 BRT"
parameters:
  - name: sprint_id
    type: number
    required: true
    default: null
sections:
  - Resumo executivo
  - Tarefas entregues
  - Em progresso (com blockers)
  - Atrasadas
  - Riscos
  - Sugestões de melhoria
output_format: pdf+s3
delivery:
  target_jid: null       # preenchido quando agendado
  chat_format: telegram  # slack | whatsapp | telegram
---

# <Título>

## Queries ClickUp

<Bloco bash com curls, já parametrizado>

## Transformações

<Como processar o JSON retornado pra gerar as seções>

## Template markdown do PDF

<Markdown estruturado — placeholders `{{var}}` substituídos em runtime>

## Histórico de execuções

- YYYY-MM-DD HH:MM — solicitado por <user> via <group> — output: s3://.../report-YYYY-MM.pdf
```

### Quando criar um template novo

Fluxo recomendado:

1. Usuário pede relatório inédito → **execute uma vez** discutindo o shape
2. Mostre preview em markdown antes de gerar PDF
3. Após aprovação do usuário, pergunte: *"Salvo como template reutilizável?"*
4. Se sim, escreva o arquivo `.md` no shape acima com `run_count: 1`
5. Proponha schedule sugerido com base na frequência que o usuário mencionou

### Quando reusar um template

Na chegada de um request:

1. `rg "<keyword>" /workspace/global/report-templates/*.md` — match por título, slug, sections
2. Se há match: *"Tem um template `<slug>` parecido. Uso ele com parâmetros X=... Y=...?"*
3. Se o usuário aceita: execute com params. Atualize `last_run`, `run_count`, `updated`.
4. Se o usuário quer variação, bifurque o template com `<slug>-v2.md` e linke no frontmatter `fork_of:`.

## Fluxo completo de geração

```bash
# 1. Compor markdown do relatório
cat > /tmp/report.md <<MD
# <Título>
...
MD

# 2. Gerar PDF
node /workspace/offices/shared/skills/pdf-generator/md2pdf.js \
  /tmp/report.md \
  /workspace/reports/<slug>-$(date +%Y-%m-%d).pdf

# 3. Upload S3 + presigned URL
bash /workspace/offices/shared/skills/s3-uploader/upload.sh \
  /workspace/reports/<slug>-$(date +%Y-%m-%d).pdf \
  reports/<slug>/$(date +%Y-%m-%d).pdf
# Saída: URL presigned válido por 7 dias

# 4. Enviar no chat (via send_message ou como parte do return)
```

## Agendamento de relatórios

Use a MCP tool `mcp__nanoclaw__schedule_task` dentro do agente:

```
schedule_task({
  prompt: "Execute o template 'sprint-status-semanal' com sprint_id=92. Gere PDF, suba para S3, e envie link para este grupo.",
  schedule_type: "cron",
  schedule_value: "0 12 * * 5",     // 09:00 BRT (UTC-3) toda sexta
  context_mode: "group",
  target_group_jid: "<jid do grupo destino>"
})
```

**Sempre confirme com o usuário antes de agendar:**
- Horário e timezone
- Dia da semana / periodicidade
- Grupo de destino
- Parâmetros fixos vs dinâmicos (ex.: sprint_id = "atual" ≠ número fixo)

Após agendar, escreva em `schedule_suggestions:` do template o cron usado.

## Sugestões de melhoria — checklist proativo

Ao executar QUALQUER query no ClickUp, observe e registre em uma seção "Sugestões" do relatório:

| Sinal | Diagnóstico | Sugestão |
|-------|-------------|----------|
| Tasks sem `time_estimate` | Time não dimensiona esforço | Tornar estimativa obrigatória via automation |
| Sprint encerrou mas lista `sprint` tem tasks abertas | Falta ritual de fechamento | Checklist de encerramento no template de sprint |
| Status "Blocked" > 15% do total | Dependências externas ou processo emperrado | Daily específica para Blocked |
| Mesma task sem atualização há >5 dias | Abandono silencioso | Automation: status muda pra "Stale" |
| Custom fields duplicados em lists irmãs | Falta convenção de workspace | Unificar em field compartilhado no Space |
| Assignees com >10 tasks ativas simultâneas | Sobrecarga / multitasking | Redistribuir ou reduzir WIP |

Toda sugestão tem:
- **Sintoma** (com evidência quantitativa: "23 de 140 tasks no Sprint 92")
- **Impacto** (o que isso custa)
- **Proposta** (concreta, acionável — não "melhorar comunicação")

Registre sugestões recorrentes em `/workspace/global/journal/projects/clickup-melhorias.md` para tracking.

## Multi-user / multi-projeto

O agente pode ser invocado de múltiplos grupos telegram/whatsapp. Cada grupo tem seu `clickup.md` com seu próprio workspace. Regra:

- **Token/workspace** → sempre do grupo corrente (`/workspace/group/clickup.md`)
- **Template library** → global e compartilhada (`/workspace/global/report-templates/`)
- **Report output** → `/workspace/reports/` (per-office) + S3 (per-office path)
- **Journal entries** → global (`/workspace/global/journal/`)

Se um template foi criado por um grupo e é útil em outro, é reutilizável — o `requested_by` acumula os users ao longo do tempo.

## Registro no journal

Ao final de cada relatório gerado, apende ao daily note global:

```
## [HH:MM] <group_folder> — ClickUp report <slug>

Gerou [[templates/<slug>]] (run #N). PDF em /workspace/reports/<arquivo>.
Link S3 expira em 7d: <curl -sI do link>.
Sugestões: N.
Projetos tocados: [[projects/clickup-<workspace>]]
```

## Segurança

- **Token ClickUp**: nunca logar em stdout visível ao usuário final; nunca committar; nunca incluir no PDF
- **S3 presigned URL**: padrão 7 dias — se o dado é sensível, usar 1 dia e avisar o usuário
- **Dados de membros**: se o relatório inclui nomes/emails de pessoas, marque no rodapé "Contém dados pessoais — não redistribuir"

## Checklist antes de entregar

- [ ] Token carregado corretamente?
- [ ] Template usado (existente ou recém-criado)?
- [ ] PDF gerado sem erro?
- [ ] Upload S3 funcionou (HEAD retorna 200)?
- [ ] Link testado e dentro da validade?
- [ ] Template atualizado (`last_run`, `run_count`, `updated`)?
- [ ] Journal global recebeu a entrada?
- [ ] Sugestões de melhoria incluídas se aplicável?
- [ ] Mensagem de entrega formatada pro canal (telegram/whatsapp/slack)?
