---
name: dream
description: Nightly consolidation of working memory into long-term memories. Reads last 24h of daily notes + SQLite messages, classifies memorable vs transitory, promotes memorable facts to journal/memories/ with provenance, and writes a dream log. Triggered by the scheduled "dream" task at 03:00 BRT, or manually via /dream.
---

# Dream (consolidação noturna de memória)

Você é o processo de **sonho**. Sua função é transformar o traço efêmero das últimas 24h em memória durável, separando o memorável do transitório e detectando padrões proativamente. Corre automático às 03:00 BRT e pode ser invocado manualmente com `/dream`.

## Input — o que ler

Ordem obrigatória (barato → mais caro):

1. **`/workspace/global/journal/.dream-config.json`** — flags de execução (silenciar resumo matinal, etc.)
2. **`/workspace/global/journal/daily/$(date -d yesterday +%F).md`** — daily note de ontem (a fonte primária)
3. **`/workspace/global/journal/dreams/`** — listar últimos 3 sonhos pra saber o que já foi consolidado (evita duplicar)
4. **`/workspace/global/journal/memories/`** — memórias existentes (para merge, não duplicação). Use `ls` + frontmatter; só leia o conteúdo dos arquivos potencialmente relevantes ao traço de ontem.
5. **SQLite `messages` das últimas 24h** — só se precisar detalhe que não está na daily:
   ```bash
   sqlite3 /workspace/project/store/messages.db "
     SELECT timestamp, chat_jid, sender_jid, content
     FROM messages
     WHERE timestamp >= datetime('now', '-1 day')
       AND bot_message = 0
     ORDER BY timestamp ASC
     LIMIT 500;
   "
   ```

**Limite duro:** máx 500 mensagens + máx 200 memórias existentes escaneadas. Se exceder, amostre inteligentemente (últimos N + keyword match).

## Classificação — regras explícitas

Para cada fato/evento do traço, decida:

### Memorável (promove para `memories/`)

- **Decisão tomada** com razão registrada ("optamos por X porque Y")
- **Fato novo sobre entidade** (pessoa, empresa, produto) — preferência, data, contato, relação
- **Marco de projeto** — milestone alcançado, bloqueio resolvido, pivot
- **Padrão recorrente** — tema/assunto que apareceu ≥3x em janelas distintas (cross-check com `memories/` + últimos 7 dias de daily)
- **Sinal explícito** do usuário ("lembre disso", "importante", "nunca esqueça")
- **Descoberta útil** — workaround, comando mágico, insight de debug que o agente provavelmente vai precisar de novo

### Transitório (NÃO promove — fica só na daily)

- Perguntas isoladas de conhecimento puro (cálculo, definição, trivia)
- Ack/confirmação/status
- Erros resolvidos sem aprendizado genérico
- Duplicata exata de memória existente (mas atualize `last_accessed` e `confidence` dela)
- Small talk

### Quando em dúvida

Proativo > conservador. Prefira promover — o purge semanal corrige excesso. Mas **sempre com proveniência**. Sem proveniência → não promove.

## Output — memórias

Toda memória promovida vira `/workspace/global/journal/memories/<slug>.md` com este shape:

```markdown
---
title: <Título legível curto>
type: fact | decision | entity | pattern | discovery
confidence: high | medium | low
created: YYYY-MM-DD
last_accessed: YYYY-MM-DD
sources:
  - [[daily/YYYY-MM-DD]]
  - message_id: <id>  (opcional, quando aplicável)
tags: [tag1, tag2]
---

# <Título>

## Fato

<1-3 frases — o núcleo da memória, auto-contido>

## Contexto

<Por quê isso importa, quando se aplica, com quem>

## Relacionados

- [[memories/outro-slug]]
- [[projects/projeto-slug]]
```

**Merge em vez de duplicar:** se já existe memória com mesmo conceito, **atualize-a** — adicione a nova fonte em `sources:`, atualize `last_accessed`, reforce `confidence` se o novo traço corrobora, ou baixe `confidence` e adicione nota se contradiz.

**Slug:** substantivo-ou-conceito curto, sem hífens verbosos. Ex.: `preferencia-cafe`, `projeto-vault-decisao`, `cliente-acme`.

## Detecção proativa de padrões

Parte diferencial deste sonho: além do que está explícito, procure padrões ativamente.

- **Re-aparição** — um termo (pessoa, termo técnico, projeto) aparece em ≥3 dailies recentes sem página dedicada → crie `memories/<termo>.md` tipo `pattern`.
- **Deriva de decisão** — se a daily de ontem decidiu algo que contradiz memória existente → não sobrescreva; crie entrada em dreams/ apontando os dois lados pra revisão humana.
- **Projetos implícitos** — trabalho recorrente sem `projects/<slug>.md` correspondente → proponha criar (marque em dreams/, não crie sozinho se não há nome claro).
- **Stale memory** — memória antiga com `last_accessed` velho mas traço recente relacionado → atualize.

## Dream log (obrigatório)

Escreva `/workspace/global/journal/dreams/$(date +%F).md`:

```markdown
---
date: YYYY-MM-DD
reviewed_range: YYYY-MM-DD 00:00 → YYYY-MM-DD 23:59 BRT
sources_scanned:
  - daily/YYYY-MM-DD.md
  - messages (count: N)
promoted: N
updated: N
transitory: N
patterns_detected: N
---

# Sonho de YYYY-MM-DD

## Promovido (novo memorável)

- [[memories/slug-1]] — <1 linha do fato>
- [[memories/slug-2]] — <1 linha>

## Atualizado

- [[memories/slug-existente]] — <o que mudou>
- [[projects/slug-projeto]] — <o que mudou>

## Transitório (descartado)

<Resumo de 1-2 frases do que foi ruído — não liste item por item>

## Padrões detectados

- <Padrão observado> → ação tomada ou proposta

## Anomalias / contradições

<Se encontrou conflito entre fontes ou entre memória nova e existente, registre aqui pra revisão humana>
```

## Resumo matinal (opcional)

Se `/workspace/global/journal/.dream-config.json` tem `morning_summary: true`:

Use `mcp__nanoclaw__send_message` com o `chat_jid` de `summary_target_jid` para enviar **resumo curto** (não o dream log inteiro):

```
🌙 Sonho de YYYY-MM-DD
• Consolidei N memórias novas: [slug-1, slug-2]
• Atualizei M memórias/projetos
• Detectei K padrões: [...]
• Anomalias: [... se houver]
```

Se `morning_summary: false` → pule o send_message, só escreva o dream log em disco.

Se o config não existir ou estiver corrompido: default `morning_summary: true`.

## Limites e safeguards

- **Nunca** promova fato sem `sources:` — alucina-proof
- **Nunca** modifique daily notes passadas — são imutáveis
- **Nunca** delete memórias — isso é trabalho do `/purge`
- **Nunca** escreva em `/workspace/global/CLAUDE.md`
- **Quota por noite:** máx 20 novas memórias. Se excede, priorize por confidence alta + sinal explícito; resto vai pra dreams/ como "proposto, não criado" para revisão humana.
- **Idempotente:** rodar `/dream` duas vezes no mesmo dia não duplica entradas (cheque dreams/<data>.md antes).

## Checklist de fim

- [ ] Li config, daily de ontem e últimos 3 sonhos?
- [ ] Classifiquei todos os fatos não-triviais como memorável/transitório?
- [ ] Todas as memórias promovidas têm `sources:`?
- [ ] Atualizei memórias existentes em vez de duplicar?
- [ ] Escrevi `dreams/$(date +%F).md` com contagens?
- [ ] Respeitei config pra resumo matinal?
- [ ] Não passei de 20 novas memórias?
