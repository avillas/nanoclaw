#!/usr/bin/env bash
# ============================================================================
# NanoClaw Offices — Script de Instalacao
# Compativel com macOS e Linux
# ============================================================================
set -euo pipefail

# ----------------------------------------------------------------------------
# Cores (desabilita se terminal nao suporta)
# ----------------------------------------------------------------------------
if [[ -t 1 ]] && command -v tput &>/dev/null && [[ $(tput colors 2>/dev/null || echo 0) -ge 8 ]]; then
  GREEN=$(tput setaf 2)
  RED=$(tput setaf 1)
  YELLOW=$(tput setaf 3)
  CYAN=$(tput setaf 6)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  GREEN="" RED="" YELLOW="" CYAN="" BOLD="" RESET=""
fi

# ----------------------------------------------------------------------------
# Funcoes utilitarias
# ----------------------------------------------------------------------------
info()  { echo "${CYAN}[INFO]${RESET}  $*"; }
ok()    { echo "${GREEN}[OK]${RESET}    $*"; }
warn()  { echo "${YELLOW}[WARN]${RESET}  $*"; }
fail()  { echo "${RED}[FAIL]${RESET}  $*"; }
header(){ echo ""; echo "${BOLD}$*${RESET}"; echo "${BOLD}$(printf '%.0s-' $(seq 1 ${#1}))${RESET}"; }

# Contadores
PASS=0
WARNINGS=0
ERRORS=0

check_pass() { PASS=$((PASS + 1)); ok "$*"; }
check_warn() { WARNINGS=$((WARNINGS + 1)); warn "$*"; }
check_fail() { ERRORS=$((ERRORS + 1)); fail "$*"; }

# ----------------------------------------------------------------------------
# Detectar diretorio raiz do projeto
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Flag --target para instalar em outro local
TARGET_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_DIR="$2"
      shift 2
      ;;
    --target=*)
      TARGET_DIR="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Uso: $0 [--target /caminho/destino]"
      echo ""
      echo "Sem --target: valida a instalacao no diretorio atual."
      echo "Com --target: copia os arquivos para o destino e valida."
      exit 0
      ;;
    *)
      echo "Opcao desconhecida: $1"
      echo "Use --help para ver as opcoes."
      exit 1
      ;;
  esac
done

# ----------------------------------------------------------------------------
# Se --target foi fornecido, copiar arquivos
# ----------------------------------------------------------------------------
if [[ -n "$TARGET_DIR" ]]; then
  header "Copiando arquivos para $TARGET_DIR"

  if [[ -d "$TARGET_DIR/offices" ]]; then
    warn "Diretorio $TARGET_DIR/offices ja existe."
    read -rp "Sobrescrever? [y/N] " REPLY
    if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
      echo "Instalacao cancelada."
      exit 0
    fi
  fi

  mkdir -p "$TARGET_DIR"
  # Usa rsync se disponivel, senao cp -r
  if command -v rsync &>/dev/null; then
    rsync -a --exclude='.DS_Store' --exclude='docs/install.sh' "$SOURCE_ROOT/" "$TARGET_DIR/offices/"
    # Copia o script tambem
    mkdir -p "$TARGET_DIR/offices/docs"
    cp "$SCRIPT_DIR/install.sh" "$TARGET_DIR/offices/docs/install.sh"
  else
    cp -r "$SOURCE_ROOT" "$TARGET_DIR/offices"
    # Remove .DS_Store se existir
    find "$TARGET_DIR/offices" -name '.DS_Store' -delete 2>/dev/null || true
  fi

  chmod +x "$TARGET_DIR/offices/docs/install.sh"
  ok "Arquivos copiados para $TARGET_DIR/offices/"

  # Re-apontar para o destino para validacao
  SOURCE_ROOT="$TARGET_DIR/offices"
fi

# ============================================================================
# VALIDACAO
# ============================================================================
echo ""
echo "${BOLD}========================================${RESET}"
echo "${BOLD}  NanoClaw Offices — Validacao          ${RESET}"
echo "${BOLD}========================================${RESET}"
echo ""
info "Diretorio: $SOURCE_ROOT"
info "Sistema:   $(uname -s) $(uname -m)"
info "Bash:      ${BASH_VERSION}"
echo ""

# ----------------------------------------------------------------------------
# 1. Estrutura de diretorios
# ----------------------------------------------------------------------------
header "1. Estrutura de diretorios"

REQUIRED_DIRS=(
  "_template"
  "_template/agents"
  "_template/skills/example-skill"
  "shared/skills"
  "marketing"
  "marketing/agents"
  "marketing/skills"
  "marketing/workflows"
  "development"
  "development/agents"
  "development/skills"
  "development/workflows"
  "innovation"
  "innovation/agents"
  "innovation/skills"
  "innovation/workflows"
)

for dir in "${REQUIRED_DIRS[@]}"; do
  if [[ -d "$SOURCE_ROOT/$dir" ]]; then
    check_pass "$dir/"
  else
    check_fail "$dir/ — diretorio ausente"
  fi
done

# ----------------------------------------------------------------------------
# 2. Arquivos de configuracao dos escritorios (CLAUDE.md)
# ----------------------------------------------------------------------------
header "2. CLAUDE.md dos escritorios"

OFFICES=("marketing" "development" "innovation")
for office in "${OFFICES[@]}"; do
  f="$SOURCE_ROOT/$office/CLAUDE.md"
  if [[ -f "$f" ]]; then
    # Verificar se contem secoes essenciais
    has_team=$(grep -c "## Team" "$f" 2>/dev/null || echo 0)
    has_pipeline=$(grep -c "## Pipeline" "$f" 2>/dev/null || echo 0)
    has_cost=$(grep -c "## Cost controls" "$f" 2>/dev/null || echo 0)
    if [[ "$has_team" -gt 0 && "$has_pipeline" -gt 0 && "$has_cost" -gt 0 ]]; then
      check_pass "$office/CLAUDE.md — completo"
    else
      check_warn "$office/CLAUDE.md — existe mas faltam secoes (Team/Pipeline/Cost controls)"
    fi
  else
    check_fail "$office/CLAUDE.md — ausente"
  fi
done

# ----------------------------------------------------------------------------
# 3. Agentes
# ----------------------------------------------------------------------------
header "3. Agentes"

declare -A EXPECTED_AGENTS
EXPECTED_AGENTS[marketing]="ad-copywriter analytics-engineer brand-guardian campaign-validator carousel-publisher content-reviewer content-writer growth-hacker image-prompt-engineer instagram-strategist"
EXPECTED_AGENTS[development]="backend-developer database-architect devops-engineer engineering-manager frontend-developer product-manager product-reviewer qa-engineer security-engineer software-architect technical-writer ui-designer ux-architect"
EXPECTED_AGENTS[innovation]="business-case-builder competitive-intelligence-analyst innovation-reporter opportunity-validator technology-scout trend-researcher"

for office in "${OFFICES[@]}"; do
  agent_count=0
  missing_agents=()

  for agent in ${EXPECTED_AGENTS[$office]}; do
    f="$SOURCE_ROOT/$office/agents/$agent.md"
    if [[ -f "$f" ]]; then
      # Verificar frontmatter minimo
      has_name=$(head -10 "$f" | grep -c "^name:" 2>/dev/null || echo 0)
      has_skill=$(head -10 "$f" | grep -c "^skill:" 2>/dev/null || echo 0)
      has_model=$(head -10 "$f" | grep -c "^model:" 2>/dev/null || echo 0)
      if [[ "$has_name" -gt 0 && "$has_skill" -gt 0 && "$has_model" -gt 0 ]]; then
        agent_count=$((agent_count + 1))
      else
        check_warn "$office/agents/$agent.md — frontmatter incompleto (name/skill/model)"
        agent_count=$((agent_count + 1))
      fi
    else
      missing_agents+=("$agent")
    fi
  done

  expected_count=$(echo "${EXPECTED_AGENTS[$office]}" | wc -w | tr -d ' ')
  if [[ ${#missing_agents[@]} -eq 0 ]]; then
    check_pass "$office — $agent_count/$expected_count agentes"
  else
    check_fail "$office — faltam ${#missing_agents[@]} agente(s): ${missing_agents[*]}"
  fi
done

# ----------------------------------------------------------------------------
# 4. Skills por escritorio
# ----------------------------------------------------------------------------
header "4. Skills"

for office in "${OFFICES[@]}"; do
  skill_count=0
  skill_errors=0
  skill_dir="$SOURCE_ROOT/$office/skills"

  if [[ -d "$skill_dir" ]]; then
    while IFS= read -r -d '' skill_file; do
      has_name=$(head -5 "$skill_file" | grep -c "^name:" 2>/dev/null || echo 0)
      has_desc=$(head -5 "$skill_file" | grep -c "^description:" 2>/dev/null || echo 0)
      if [[ "$has_name" -gt 0 && "$has_desc" -gt 0 ]]; then
        skill_count=$((skill_count + 1))
      else
        skill_name=$(dirname "$skill_file" | xargs basename)
        check_warn "$office/skills/$skill_name/SKILL.md — frontmatter incompleto"
        skill_errors=$((skill_errors + 1))
        skill_count=$((skill_count + 1))
      fi
    done < <(find "$skill_dir" -name 'SKILL.md' -print0 2>/dev/null)
  fi

  if [[ $skill_errors -eq 0 ]]; then
    check_pass "$office — $skill_count skills"
  fi
done

# ----------------------------------------------------------------------------
# 5. Shared skills
# ----------------------------------------------------------------------------
header "5. Shared skills"

EXPECTED_SHARED=(
  "approval-request"
  "cost-check"
  "daily-report"
  "git-workflow"
  "handoff-to-office"
  "memory-gps"
  "pull-request"
  "quality-gate"
  "smart-model-switching"
  "web-research"
)

shared_ok=0
shared_missing=()
for skill in "${EXPECTED_SHARED[@]}"; do
  f="$SOURCE_ROOT/shared/skills/$skill/SKILL.md"
  if [[ -f "$f" ]]; then
    shared_ok=$((shared_ok + 1))
  else
    shared_missing+=("$skill")
  fi
done

if [[ ${#shared_missing[@]} -eq 0 ]]; then
  check_pass "shared — $shared_ok/$shared_ok skills"
else
  check_fail "shared — faltam ${#shared_missing[@]}: ${shared_missing[*]}"
fi

# ----------------------------------------------------------------------------
# 6. Workflows
# ----------------------------------------------------------------------------
header "6. Workflows"

for office in "${OFFICES[@]}"; do
  wf_dir="$SOURCE_ROOT/$office/workflows"
  wf_count=$(find "$wf_dir" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$wf_count" -gt 0 ]]; then
    check_pass "$office — $wf_count workflow(s)"
  else
    check_warn "$office — nenhum workflow encontrado"
  fi
done

# ----------------------------------------------------------------------------
# 7. Templates
# ----------------------------------------------------------------------------
header "7. Templates"

TEMPLATE_FILES=(
  "_template/CLAUDE.md.template"
  "_template/agents/example-agent.md.template"
  "_template/skills/example-skill/SKILL.md.template"
)

for tf in "${TEMPLATE_FILES[@]}"; do
  if [[ -f "$SOURCE_ROOT/$tf" ]]; then
    check_pass "$tf"
  else
    check_warn "$tf — template ausente"
  fi
done

# ----------------------------------------------------------------------------
# 8. Verificacoes de integridade
# ----------------------------------------------------------------------------
header "8. Integridade"

# Verificar se agentes referenciam skills que existem
broken_refs=0
for office in "${OFFICES[@]}"; do
  for agent_file in "$SOURCE_ROOT/$office/agents/"*.md; do
    [[ -f "$agent_file" ]] || continue
    agent_name=$(basename "$agent_file" .md)

    # Extrair skills do frontmatter
    skill_line=$(head -10 "$agent_file" | grep "^skill:" 2>/dev/null || true)
    if [[ -z "$skill_line" ]]; then continue; fi

    # Parsear lista de skills (separadas por virgula)
    skills_csv="${skill_line#skill: }"
    IFS=',' read -ra skill_list <<< "$skills_csv"

    for skill_ref in "${skill_list[@]}"; do
      skill_ref=$(echo "$skill_ref" | xargs) # trim
      # Procurar a skill no escritorio ou no shared
      if [[ -f "$SOURCE_ROOT/$office/skills/$skill_ref/SKILL.md" ]] || \
         [[ -f "$SOURCE_ROOT/shared/skills/$skill_ref/SKILL.md" ]]; then
        :
      else
        check_warn "$office/$agent_name — referencia skill '$skill_ref' nao encontrada"
        broken_refs=$((broken_refs + 1))
      fi
    done
  done
done

if [[ $broken_refs -eq 0 ]]; then
  check_pass "Todas as referencias de skills dos agentes sao validas"
fi

# Contar totais
total_agents=0
total_skills=0
for office in "${OFFICES[@]}"; do
  a=$(find "$SOURCE_ROOT/$office/agents" -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
  s=$(find "$SOURCE_ROOT/$office/skills" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')
  total_agents=$((total_agents + a))
  total_skills=$((total_skills + s))
done
shared_count=$(find "$SOURCE_ROOT/shared/skills" -name 'SKILL.md' 2>/dev/null | wc -l | tr -d ' ')

# ============================================================================
# RESULTADO
# ============================================================================
echo ""
echo "${BOLD}========================================${RESET}"
echo "${BOLD}  Resultado                             ${RESET}"
echo "${BOLD}========================================${RESET}"
echo ""
info "Escritorios:       ${#OFFICES[@]}"
info "Agentes:           $total_agents"
info "Skills:            $total_skills (escritorios) + $shared_count (shared)"
info "Templates:         ${#TEMPLATE_FILES[@]}"
echo ""
echo "  ${GREEN}Passou:${RESET}    $PASS"
echo "  ${YELLOW}Avisos:${RESET}    $WARNINGS"
echo "  ${RED}Falhas:${RESET}    $ERRORS"
echo ""

if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
  echo "${GREEN}${BOLD}Instalacao validada com sucesso.${RESET}"
  exit 0
elif [[ $ERRORS -eq 0 ]]; then
  echo "${YELLOW}${BOLD}Instalacao funcional com $WARNINGS aviso(s).${RESET}"
  exit 0
else
  echo "${RED}${BOLD}Instalacao com $ERRORS erro(s). Corrija os itens acima.${RESET}"
  exit 1
fi
