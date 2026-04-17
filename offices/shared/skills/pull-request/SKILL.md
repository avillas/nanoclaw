---
name: pull-request
description: Create and manage pull requests on Bitbucket Cloud via REST API v2. Use after pushing a branch to open a PR, or to comment, list, approve, decline, or merge existing PRs. Auth is handled by OneCLI proxy.
---

# Pull Request (Bitbucket Cloud)

## Workspace

- **Workspace slug:** `mariliadias`
- **Base URL:** `https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/`
- **Auth:** transparente via OneCLI proxy (Basic Auth com `Authorization` injetado)

## Template de descrição (obrigatório)

```markdown
## What
[1-2 frases — o que muda funcionalmente]

## Why
[link/ID da task — ex.: PROJ-123, Sprint 92 ticket]

## Changes
- `path/to/file.ts` — adicionado X
- `path/to/other.ts` — refatorado Y

## How to test
1. checkout da branch
2. npm install && npm test
3. cenário manual: ...

## Checklist
- [ ] segue convenção de commit
- [ ] testes adicionados/atualizados
- [ ] sem secrets/debug logs
- [ ] docs atualizadas (se aplicável)
- [ ] CI passou
```

## Operações via REST API v2

### Criar PR

```bash
curl -s -X POST \
  "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "feat(auth): add OAuth callback handler",
    "description": "## What\n...",
    "source": { "branch": { "name": "agent/backend-developer/PROJ-123-oauth-callback" } },
    "destination": { "branch": { "name": "development" } },
    "close_source_branch": true,
    "reviewers": []
  }' | jq '.id, .links.html.href'
```

Sem `-H "Authorization: ..."` — o proxy injeta.

### Listar PRs abertos

```bash
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests?state=OPEN" \
  | jq '.values[] | {id, title, source: .source.branch.name, author: .author.display_name}'
```

### Comentar em um PR

```bash
curl -s -X POST \
  "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/comments" \
  -H "Content-Type: application/json" \
  -d '{ "content": { "raw": "Revisado. LGTM exceto pelo erro em X." } }'
```

Comentário inline em arquivo/linha:

```bash
curl -s -X POST \
  "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/comments" \
  -H "Content-Type: application/json" \
  -d '{
    "content": { "raw": "Considerar usar Map em vez de objeto aqui" },
    "inline": { "path": "src/foo.ts", "to": 42 }
  }'
```

### Diff e arquivos modificados

```bash
# Patch completo
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/diff"

# Lista de arquivos
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/diffstat" \
  | jq '.values[] | {path: .new.path, status, lines_added, lines_removed}'
```

### Aprovar / desaprovar

```bash
# Aprovar
curl -s -X POST "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/approve"

# Desaprovar (remove approval)
curl -s -X DELETE "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/approve"
```

### Merge

```bash
curl -s -X POST \
  "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/pullrequests/<pr-id>/merge" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "pullrequest_merge_parameters",
    "merge_strategy": "squash",
    "close_source_branch": true,
    "message": "feat(auth): add OAuth callback handler (#42)"
  }'
```

**Atenção:** merge geralmente requer aprovação humana — só execute `merge` se o usuário pediu explicitamente.

### Status checks (CI)

```bash
curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/commit/<sha>/statuses" \
  | jq '.values[] | {state, name, url}'
```

## Regras

- **Target: SEMPRE `development`.** Nunca `master` nem `main`. `master` é protegida — só recebe merge de `development` feito por humano. Se o repo não tem branch `development`, **pare e pergunte** ao usuário antes de prosseguir (não caia silenciosamente em `master`).
- **Um PR por task** — se a task gerou múltiplas mudanças não relacionadas, abra PRs separados.
- **Title:** mesmo padrão do commit (`type(scope): description`).
- **Reviewers:** opcional; agentes não auto-aprovam sem o humano.
- **Merge:** só com aprovação humana explícita.
- **`close_source_branch: true`** por padrão — não acumular branches mortas.

## Tratamento de erro comum

| HTTP | Causa | Ação |
|------|-------|------|
| 401 | Token inválido/expirado | Pedir ao usuário pra rotacionar e atualizar secret no OneCLI |
| 403 | Falta permissão (escopo) | Verificar se token tem `write:pullrequest:bitbucket` |
| 404 | Repo ou PR não existe | Confirmar slug do workspace e nome do repo |
| 409 | Conflito (PR já existe pra essa branch) | Listar PRs abertos da branch antes de criar |
