---
name: git-workflow
description: Git workflow rules for Bitbucket Cloud integration. Use whenever an agent interacts with Git — cloning, branching, committing, pushing, or preparing PRs. Auth is handled transparently by OneCLI proxy injection.
---

# Git Workflow

## Workspace

- **Bitbucket Cloud workspace:** `mariliadias`
- **URL pattern:** `https://bitbucket.org/mariliadias/<repo>.git`
- **Integration branch padrão: `development`.** TODO PR **deve** ter destination = `development`, **nunca** `master`. `master` é considerada branch de produção protegida — mexer nela só via merge de `development` feito por humano.
- **Branches de feature** são criadas a partir de `development` (não de master).
- Se o repo **não tem** branch `development` (raro; confirmar via API):
  ```bash
  curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>/refs/branches/development" \
    | jq -r '.name // "not-found"'
  ```
  Nesse caso, **pare e pergunte ao usuário** antes de prosseguir — não caia em `master` automaticamente.
- Alguns repos têm `mainbranch: master` registrado no Bitbucket (config histórica) mas ainda usam `development` como integration — checar existência da branch `development` é o que manda, não o `mainbranch` do API.

## Authentication (transparente — não precisa fazer nada)

OneCLI proxy intercepta requests pra `bitbucket.org` e `api.bitbucket.org` e injeta `Authorization: Basic <token>` automaticamente. Você usa as URLs HTTPS normais — nenhuma credencial em URL, env var, nem `.netrc`:

```bash
git clone https://bitbucket.org/mariliadias/myrepo.git
git push origin agent/foo/bar
```

Se receber 401, confirme que o secret está ativo:

```bash
curl -fsSL "$ONECLI_URL/secrets" 2>/dev/null \
  | jq '.data[] | select(.hostPattern | test("bitbucket.org"))'
```

## Identidade do commit

Defina por agente antes do primeiro commit (não dá pra OneCLI injetar):

```bash
git config user.email "agent-<slug>@mariliadias.bitbucket"
git config user.name "<Agent Display Name>"
```

Ex.: `backend-developer@mariliadias.bitbucket` / `Backend Developer`. Isso aparece no histórico do repo e no Bitbucket UI — útil pra atribuir mudanças ao agente correto.

## Convenção de branch

```
agent/<agent-slug>/<task-id>-<short-description>
```

Exemplos:
- `agent/backend-developer/PROJ-123-add-pagination`
- `agent/clickup-project-manager/sprint-92-report`
- `agent/frontend-developer/UX-45-fix-login-modal`

## Convenção de commit

```
type(scope): description

[body opcional explicando WHY]
```

Tipos: `feat` | `fix` | `refactor` | `test` | `docs` | `chore`

Ex.:
```
feat(auth): add OAuth callback handler

Bitbucket SSO now redirects to /auth/callback?code=...
Closes PROJ-123.
```

## Fluxo padrão por task

```bash
# 0. Confirmar que o repo tem branch development
REPO=myrepo
DEV_EXISTS=$(curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/$REPO/refs/branches/development" | jq -r '.name // "not-found"')
[ "$DEV_EXISTS" = "not-found" ] && { echo "repo $REPO não tem branch development — perguntar ao usuário"; exit 1; }

# 1. Clone (ou cd no já clonado)
git clone "https://bitbucket.org/mariliadias/$REPO.git"
cd "$REPO"

# 2. Branch a partir de development (sempre)
git checkout development
git pull
git checkout -b agent/<agent-slug>/<task-id>-<description>

# 3. Trabalhar — commits atômicos
git add <file>
git commit -m "feat(scope): ..."

# 4. Push
git push -u origin agent/<agent-slug>/<task-id>-<description>

# 5. Abrir PR com destination = development (ver skill /pull-request)
```

## NEVER

- ❌ PR target = `master` — **SEMPRE** `development`
- ❌ Push direto em `development` ou `master` — sempre via PR
- ❌ Criar feature branch a partir de `master` — sempre a partir de `development`
- ❌ `git push --force` — reescrever histórico compartilhado
- ❌ `git branch -D` em branch remota — não deletar branches alheias
- ❌ Hardcode de credencial em URL ou `.git/config` — OneCLI proxy faz isso
- ❌ Fallback silencioso pra `master` se `development` não existir — pergunte ao usuário

## ALWAYS

- ✅ Confirmar que `development` existe no repo (via API) antes de iniciar
- ✅ Checkout de `development` atualizado antes de criar feature branch
- ✅ Feature branch criada **a partir de development**
- ✅ Commits atômicos (uma mudança lógica por commit)
- ✅ Mensagem de commit no padrão `type(scope): description`
- ✅ PR aberto após task completa — **target sempre `development`**
- ✅ `git config user.email` setado pro slug do agente

## Permissões do token

Token tem escopos:
- `read/write:repository` — clone, push
- `read/write:pullrequest` — PRs
- `read/write:pipeline` — disparar/ver pipelines
- `read:user` / `read:workspace` — listagens

**Não tem** permissão pra: settings de workspace, gerenciar membros, deletar repos. Se uma operação pede isso, o agente reporta ao usuário em vez de tentar.
