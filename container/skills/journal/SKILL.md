---
name: journal
description: Shared global journal — working memory across groups and sessions. Use at the START of every non-trivial invocation (read today's daily note + relevant projects) and at the END (append a checkpoint). Also use when the user asks "o que fiz ontem", "estado do projeto X", or references past work.
---

# Journal (memória global compartilhada)

Existe um **vault Obsidian global** em `/workspace/global/` montado em todos os grupos. É a memória de trabalho compartilhada entre agentes e sessões. Sem ele, cada invocação começa do zero mesmo quando o contexto já foi construído antes.

## Quando ler

**Sempre que a tarefa não for trivial**, antes de agir:

1. Leia `/workspace/global/journal/daily/$(date +%F).md` se existir — contexto do que já rolou hoje.
2. Se hoje está vazio, leia o arquivo mais recente em `/workspace/global/journal/daily/` — continuidade da última sessão.
3. Leia `/workspace/global/journal/index.md` para ver projetos ativos.
4. Se a requisição menciona algum projeto/tópico, leia `/workspace/global/journal/projects/<slug>.md`.

Trivial = responder uma pergunta isolada de fato (cálculo, definição, etc.). Não-trivial = qualquer coisa que envolva estado, pessoas, decisões anteriores ou trabalho em progresso.

## Quando escrever

**Ao FINAL da invocação**, se você fez algo relevante, apenda um checkpoint:

### Daily note

Em `/workspace/global/journal/daily/YYYY-MM-DD.md` (crie se não existir), apende:

```markdown
## [HH:MM] <group_folder> — <resumo de uma linha>

O que o usuário pediu. O que você fez. O que descobriu ou decidiu.
Projetos tocados: [[projects/slug-1]], [[projects/slug-2]]
```

Formato do cabeçalho é **obrigatório** — começa com `## [HH:MM]` (24h) seguido do folder do grupo e um resumo curto. Isso permite `rg '^## \[' journal/daily/*.md` indexar tudo cronologicamente.

### Project note (se aplicável)

Se o trabalho toca um projeto/tópico recorrente, atualize `/workspace/global/journal/projects/<slug>.md`:

```markdown
---
title: <Nome do Projeto>
status: active | paused | done
owner: <group_folder que lidera>
last_touched: YYYY-MM-DD
created: YYYY-MM-DD
---

# <Nome>

## Contexto

<1-3 parágrafos vivos — atualize conforme evolui, não acumule tudo>

## Decisões

- [[2026-04-16]] — decidido X porque Y
- [[2026-04-10]] — optado por Z em vez de W

## TODO

- [ ] próximo passo
- [x] passo feito

## Referências

- [[entidade]], [[outro-projeto]]
```

Se criar um projeto novo, **também** adicione uma linha em `/workspace/global/journal/index.md` na seção "Projetos ativos":

```markdown
- [[projects/slug]] — frase de estado (ex: "config inicial em progresso")
```

## Granularidade — o que merece checkpoint

| Tipo de invocação | Checkpoint? |
|-------------------|-------------|
| Pergunta isolada de conhecimento | **Não** |
| "Que horas são?", "cálculo", "defina X" | **Não** |
| Mudou arquivo, executou comando, criou tarefa agendada | **Sim** |
| Teve decisão/preferência nova do usuário | **Sim** |
| Pesquisa com findings úteis no futuro | **Sim** |
| Continuação de trabalho em projeto | **Sim** (atualize o project note) |

Quando em dúvida: escreva. Vale mais entradas rasas do que buracos.

## Concorrência

Múltiplos agentes podem escrever ao mesmo tempo. Use `>>` (append), não sobrescreva com `cat > file`. Para atualização de project note ou index, leia → modifique → escreva; se achar conflito óbvio (seu estado diverge do esperado), mencione no checkpoint em vez de sobrescrever.

## Limites

- **Não** modifique `/workspace/global/CLAUDE.md` — é instrução global, só main atualiza sob pedido explícito.
- **Não** edite daily notes de dias passados — são imutáveis. Se precisar corrigir, apende nota em hoje referenciando `[[YYYY-MM-DD]]`.
- **Não** gere entradas ruidosas por tarefas triviais.
- **Não** use links markdown `[](foo.md)`; sempre wikilinks `[[foo]]`.

## Checklist de fim de invocação

- [ ] Fiz algo relevante? Se sim, continuo.
- [ ] Apendei entrada em `journal/daily/YYYY-MM-DD.md` com cabeçalho `## [HH:MM] <group> — ...`?
- [ ] Se tocou projeto existente: atualizei `projects/<slug>.md` (last_touched + decisão/todo)?
- [ ] Se projeto novo: criei `projects/<slug>.md` E adicionei em `journal/index.md`?
- [ ] Todos os links internos são wikilinks `[[...]]`?
