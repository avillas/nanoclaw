---
name: git-workflow
description: Git workflow rules for Bitbucket Cloud integration. Use whenever an agent interacts with Git — cloning, branching, committing, pushing, or preparing PRs. Auth is handled transparently by OneCLI proxy injection.
---

# Git Workflow

## Workspace

- **Bitbucket Cloud workspace:** `mariliadias`
- **URL pattern:** `https://bitbucket.org/mariliadias/<repo>.git`
- **Branch principal varia por repo:** alguns usam `development`, outros `master`. **Sempre confirme antes** de criar branch:
  ```bash
  MAIN_BRANCH=$(curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/<repo>" \
    | jq -r '.mainbranch.name')
  ```
  Repos conhecidos atualmente:
  - `development` → megaserver, msdescarga, megaproxygo, ...
  - `master` → msdesmembra, msbingo, ms_log, jconfig, ...
- **Nunca** push direto na main branch — sempre via PR.

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
# 0. Descobrir a main branch do repo
REPO=myrepo
MAIN_BRANCH=$(curl -s "https://api.bitbucket.org/2.0/repositories/mariliadias/$REPO" | jq -r '.mainbranch.name')

# 1. Clone (ou cd no já clonado)
git clone "https://bitbucket.org/mariliadias/$REPO.git"
cd "$REPO"

# 2. Branch a partir da main branch correta
git checkout "$MAIN_BRANCH"
git pull
git checkout -b agent/<agent-slug>/<task-id>-<description>

# 3. Trabalhar — commits atômicos
git add <file>
git commit -m "feat(scope): ..."

# 4. Push
git push -u origin agent/<agent-slug>/<task-id>-<description>

# 5. Abrir PR com destination = $MAIN_BRANCH (ver skill /pull-request)
```

## NEVER

- ❌ Push direto na main branch (`development` ou `master` conforme repo) — sempre via PR
- ❌ `git push --force` — reescrever histórico compartilhado
- ❌ `git branch -D` em branch remota — não deletar branches alheias
- ❌ Hardcode de credencial em URL ou `.git/config` — OneCLI proxy faz isso
- ❌ Assumir que toda main branch chama `develop` ou `main` — checar via API

## ALWAYS

- ✅ Descobrir `mainbranch` antes de iniciar (via API)
- ✅ Branch criada a partir da main branch correta e atualizada
- ✅ Commits atômicos (uma mudança lógica por commit)
- ✅ Mensagem de commit no padrão `type(scope): description`
- ✅ PR aberto após task completa (target = main branch detectada)
- ✅ `git config user.email` setado pro slug do agente

## Permissões do token

Token tem escopos:
- `read/write:repository` — clone, push
- `read/write:pullrequest` — PRs
- `read/write:pipeline` — disparar/ver pipelines
- `read:user` / `read:workspace` — listagens

**Não tem** permissão pra: settings de workspace, gerenciar membros, deletar repos. Se uma operação pede isso, o agente reporta ao usuário em vez de tentar.
