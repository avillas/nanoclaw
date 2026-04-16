---
name: wiki
description: Maintain the Obsidian-style LLM Wiki inside a group's vault. Use when the user asks to ingest a source, query the wiki, lint it, or mentions "wiki", "vault", "nota", "knowledge base".
---

# Wiki (modo vault Obsidian)

O grupo hospeda um **vault Obsidian** como memória complementar ao `CLAUDE.md`. Você é o mantenedor disciplinado do vault, seguindo o padrão LLM Wiki do Karpathy.

## Layout do vault

A raiz do vault é o próprio folder do grupo (`/workspace/group/`). Dentro dela:

| Caminho | Dono | Propósito |
|---------|------|-----------|
| `sources/` | usuário | Fontes brutas imutáveis. Você **lê mas nunca edita**. |
| `wiki/` | você | Páginas markdown derivadas (entities, concepts, notes). |
| `wiki/index.md` | você | Catálogo de tudo. Atualizar em cada ingest. |
| `wiki/log.md` | você | Append-only cronológico de todas as operações. |
| `attachments/` | ambos | Imagens e binários referenciados por `![[arquivo]]`. |
| `.obsidian/` | Obsidian | Config do app. Não mexer. |
| `CLAUDE.md` | você | Schema/memória do agente. |

## Convenções Obsidian (obrigatórias)

1. **Wikilinks, sempre.** `[[page-name]]` — nunca `[texto](link.md)` para links internos.
2. **Aliases** quando o nome é longo: `[[concepts/feynman-technique|técnica de Feynman]]`.
3. **Embeds** para incluir outro arquivo inline: `![[diagrama.png]]` ou `![[concept#heading]]`.
4. **Slugs** em minúsculas com hífens: `andrej-karpathy.md`, `llm-wiki.md`. Sem espaços nem acentos no nome do arquivo.
5. **Frontmatter YAML** em toda página criada:
   ```yaml
   ---
   title: Título legível
   type: entity | concept | note | summary
   tags: [tag1, tag2]
   sources: [[sources/arquivo-fonte]]
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---
   ```
6. **Backlinks implícitos:** toda página que referencia outra usa `[[...]]`. Obsidian constrói o grafo automaticamente — não mantenha seções "backlinks" manuais.
7. **Tags inline** com `#tag` quando útil, ou em `tags:` no frontmatter.

## Organização de `wiki/`

- `wiki/entities/` — pessoas, organizações, lugares, produtos
- `wiki/concepts/` — ideias, métodos, frameworks, termos técnicos
- `wiki/notes/` — sínteses, comparações, respostas filed, deep-dives

Crie subpastas novas se o domínio crescer. Mantenha filenames únicos globalmente para `[[shortest-path]]` funcionar.

## Operações

### Ingest — adicionar uma fonte

Quando o usuário envia URL/arquivo/mídia e pede para ingerir:

1. **Baixar / salvar** a fonte bruta em `sources/` com slug (`2026-04-16-titulo.md` ou `.pdf`).
   - URL de webpage: use `agent-browser open <url>` + extract; não use `WebFetch` (retorna resumo, não texto completo).
   - URL de PDF: `curl -sLo sources/nome.pdf "<url>"`, depois `pdftotext` se disponível.
   - Imagem: mover para `attachments/`, criar `sources/nome.md` com `![[nome.png]]` + contexto.
   - Áudio: transcrever para `sources/nome.md`.
2. **Ler integralmente** e discutir takeaways com o usuário antes de escrever.
3. **Criar/atualizar** páginas em `wiki/`:
   - Resumo em `wiki/notes/<slug>.md` com frontmatter `sources: [[sources/<fonte>]]`.
   - Uma página por entidade mencionada (`wiki/entities/<slug>.md`). Se já existir, **atualizar** com o novo contexto.
   - Uma página por conceito novo em `wiki/concepts/<slug>.md`.
   - Cross-references: toda menção a entidade/conceito vira `[[slug]]`.
4. **Atualizar `wiki/index.md`** — adicionar a nova página na seção apropriada com resumo de uma linha.
5. **Apendar em `wiki/log.md`**:
   ```
   ## [YYYY-MM-DD] ingest | <título da fonte>

   Fonte: [[sources/<slug>]]
   Páginas tocadas: [[pagina-1]], [[pagina-2]], ...
   Takeaway: <uma frase>
   ```
6. **Flagrar contradições** com fontes/páginas existentes — registrar na página afetada com `> [!warning] Contradição com [[outra-page]]`.

### Disciplina de ingest múltiplo

**Se o usuário mandar várias fontes de uma vez, processe UMA POR UMA.** Para cada: baixar → ler → discutir → escrever todas as páginas → atualizar index/log → só então passar para a próxima. Nunca leia todas em batch e depois escreva — gera páginas rasas e genéricas.

### Query — responder pelo vault

1. **Ler `wiki/index.md` primeiro** para localizar páginas relevantes.
2. Ler as páginas, seguir wikilinks conforme necessário.
3. Responder **com citações**: toda afirmação não-trivial linka `[[page]]` ou `[[sources/fonte]]`.
4. Se a resposta compõe conhecimento novo útil, ofereça **filed** — criar `wiki/notes/<slug>.md` e atualizar index/log com operação `query`.

### Lint — health check

Rodar quando pedido ou no cron agendado:

- **Contradições** — buscar `> [!warning]` e páginas com frontmatter `updated` mais novo que fontes conflitantes.
- **Órfãos** — páginas sem backlinks. Grep: `rg -l '\[\[.*\]\]' wiki/` e comparar com `ls wiki/**/*.md`.
- **Páginas faltando** — conceitos/entidades mencionados em wikilinks `[[foo]]` que não têm arquivo correspondente (broken links).
- **Stale** — páginas com `updated` > 90 dias sem revisão apesar de novas fontes relacionadas.
- **Gaps** — entidades/conceitos mencionados em várias fontes sem página dedicada.

Reportar findings para o usuário e oferecer fixes.

## Checklist antes de qualquer escrita no vault

- [ ] A fonte está em `sources/` com slug e frontmatter?
- [ ] Existe entrada em `wiki/index.md` para cada página nova?
- [ ] Existe entrada em `wiki/log.md` para esta operação?
- [ ] Todos os links internos usam `[[...]]` (não `[](.)`)?
- [ ] Frontmatter YAML completo (title, type, sources, created, updated)?
- [ ] Nenhum broken wikilink introduzido?

## Limites

- **Não** modifique arquivos em `sources/` — são imutáveis.
- **Não** crie páginas `wiki/*.md` sem entrada correspondente em `index.md` e `log.md`.
- **Não** use links markdown `[texto](arquivo.md)` internamente — sempre `[[arquivo]]`.
- **Não** batch-leia múltiplas fontes antes de escrever; processe sequencialmente.
