#!/usr/bin/env bash
# ============================================================================
# Fase 1: Validacao e Preparacao do Ambiente de Destino
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

# --- Configuracao -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

# Valores padrao (sobrescreva em config.env)
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/openclaw}"
NANOCLAW_DIR="${NANOCLAW_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${OPENCLAW_DIR}/backups/pre-migration-$(date +%Y%m%d_%H%M%S)}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/01-validate-$(date +%Y%m%d_%H%M%S).log"
MIN_DISK_GB="${MIN_DISK_GB:-5}"
REMOTE_HOST="${REMOTE_HOST:-}"  # Deixe vazio para migracao local

mkdir -p "${LOG_DIR}"

# --- Funcoes utilitarias ----------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }
die()  { fail "$*"; exit 1; }

run_on_target() {
  if [[ -n "${REMOTE_HOST}" ]]; then
    ssh "${REMOTE_HOST}" "$@"
  else
    eval "$@"
  fi
}

check() {
  local desc="$1"; shift
  if "$@" >> "${LOG_FILE}" 2>&1; then
    ok "${desc}"
    return 0
  else
    fail "${desc}"
    return 1
  fi
}

# --- Cabecalho --------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Fase 1: Validacao do Ambiente de Destino"
echo "  Migracao NanoClaw -> OpenClaw"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "NanoClaw: ${NANOCLAW_DIR}"
log "OpenClaw: ${OPENCLAW_DIR}"
log "Destino: ${REMOTE_HOST:-local}"
log "Log: ${LOG_FILE}"
echo ""

ERRORS=0

# --- 1.1 Verificar NanoClaw (origem) ----------------------------------------
log "=== Verificando NanoClaw (origem) ==="

if [[ -f "${NANOCLAW_DIR}/package.json" ]]; then
  NANO_VERSION=$(node -e "console.log(require('${NANOCLAW_DIR}/package.json').version)" 2>/dev/null || echo "desconhecida")
  ok "NanoClaw encontrado (v${NANO_VERSION})"
else
  die "NanoClaw nao encontrado em ${NANOCLAW_DIR}"
fi

if [[ -d "${NANOCLAW_DIR}/offices" ]]; then
  OFFICE_COUNT=$(ls -d "${NANOCLAW_DIR}"/offices/*/agents 2>/dev/null | wc -l || echo "0")
  ok "Offices encontrados: ${OFFICE_COUNT}"
else
  warn "Diretorio offices/ nao encontrado"
fi

if [[ -d "${NANOCLAW_DIR}/groups" ]]; then
  GROUP_COUNT=$(ls -d "${NANOCLAW_DIR}"/groups/*/ 2>/dev/null | wc -l || echo "0")
  ok "Grupos encontrados: ${GROUP_COUNT}"
else
  warn "Diretorio groups/ nao encontrado"
fi

DB_PATH="${NANOCLAW_DIR}/store/nanoclaw.db"
if [[ -f "${DB_PATH}" ]]; then
  DB_SIZE=$(du -h "${DB_PATH}" | cut -f1)
  ok "Banco de dados encontrado (${DB_SIZE})"
else
  DB_PATH="${NANOCLAW_DIR}/store/data.db"
  if [[ -f "${DB_PATH}" ]]; then
    DB_SIZE=$(du -h "${DB_PATH}" | cut -f1)
    ok "Banco de dados encontrado (${DB_SIZE})"
  else
    warn "Banco de dados SQLite nao encontrado em store/"
  fi
fi

echo ""

# --- 1.2 Verificar conectividade com destino ---------------------------------
log "=== Verificando destino ==="

if [[ -n "${REMOTE_HOST}" ]]; then
  if check "Conexao SSH com ${REMOTE_HOST}" ssh -o ConnectTimeout=10 "${REMOTE_HOST}" "echo ok"; then
    :
  else
    die "Nao foi possivel conectar via SSH em ${REMOTE_HOST}"
    ((ERRORS++))
  fi
else
  ok "Migracao local (mesmo host)"
fi

# --- 1.3 Verificar OpenClaw no destino ---------------------------------------
log "=== Verificando OpenClaw ==="

if run_on_target "[[ -f '${OPENCLAW_DIR}/package.json' ]]" 2>/dev/null; then
  OC_VERSION=$(run_on_target "node -e \"console.log(require('${OPENCLAW_DIR}/package.json').version)\"" 2>/dev/null || echo "desconhecida")
  ok "OpenClaw encontrado (v${OC_VERSION})"
else
  fail "OpenClaw nao encontrado em ${OPENCLAW_DIR}"
  ((ERRORS++))
fi

# Verificar se esta rodando
if run_on_target "systemctl --user is-active openclaw 2>/dev/null || pgrep -f 'openclaw.*index' >/dev/null 2>&1" 2>/dev/null; then
  ok "OpenClaw esta rodando"
else
  warn "OpenClaw nao parece estar rodando (pode nao ser problema se ainda nao foi iniciado)"
fi

echo ""

# --- 1.4 Pre-requisitos no destino -------------------------------------------
log "=== Verificando pre-requisitos ==="

# Node.js
NODE_VERSION=$(run_on_target "node --version 2>/dev/null" || echo "nao instalado")
if [[ "${NODE_VERSION}" =~ ^v(2[0-9]|[3-9][0-9]) ]]; then
  ok "Node.js: ${NODE_VERSION}"
else
  fail "Node.js >= 20 necessario (encontrado: ${NODE_VERSION})"
  ((ERRORS++))
fi

# npm
NPM_VERSION=$(run_on_target "npm --version 2>/dev/null" || echo "nao instalado")
ok "npm: v${NPM_VERSION}"

# Container runtime
if run_on_target "docker --version >/dev/null 2>&1"; then
  DOCKER_VERSION=$(run_on_target "docker --version 2>/dev/null" | head -1)
  ok "Docker: ${DOCKER_VERSION}"
elif run_on_target "podman --version >/dev/null 2>&1"; then
  PODMAN_VERSION=$(run_on_target "podman --version 2>/dev/null" | head -1)
  ok "Podman: ${PODMAN_VERSION}"
else
  fail "Docker ou Podman nao encontrado"
  ((ERRORS++))
fi

# SQLite
if run_on_target "sqlite3 --version >/dev/null 2>&1"; then
  SQLITE_VERSION=$(run_on_target "sqlite3 --version 2>/dev/null" | head -1)
  ok "SQLite: ${SQLITE_VERSION}"
else
  warn "sqlite3 CLI nao encontrado (pode usar better-sqlite3 do Node)"
fi

# Git
if run_on_target "git --version >/dev/null 2>&1"; then
  GIT_VERSION=$(run_on_target "git --version 2>/dev/null")
  ok "Git: ${GIT_VERSION}"
else
  fail "Git nao encontrado"
  ((ERRORS++))
fi

echo ""

# --- 1.5 Espaco em disco ----------------------------------------------------
log "=== Verificando espaco em disco ==="

AVAIL_KB=$(run_on_target "df -k '${OPENCLAW_DIR}' 2>/dev/null | tail -1 | awk '{print \$4}'" || echo "0")
AVAIL_GB=$((AVAIL_KB / 1024 / 1024))
if [[ ${AVAIL_GB} -ge ${MIN_DISK_GB} ]]; then
  ok "Espaco disponivel: ${AVAIL_GB}GB (minimo: ${MIN_DISK_GB}GB)"
else
  fail "Espaco insuficiente: ${AVAIL_GB}GB (minimo: ${MIN_DISK_GB}GB)"
  ((ERRORS++))
fi

echo ""

# --- 1.6 Criar backup do OpenClaw -------------------------------------------
log "=== Criando backup do OpenClaw ==="

run_on_target "mkdir -p '${BACKUP_DIR}'"

# Backup do banco de dados
OC_DB=$(run_on_target "find '${OPENCLAW_DIR}' -name '*.db' -path '*/store/*' 2>/dev/null | head -1" || echo "")
if [[ -n "${OC_DB}" ]]; then
  run_on_target "cp '${OC_DB}' '${BACKUP_DIR}/database-backup.db'"
  ok "Banco de dados salvo em ${BACKUP_DIR}/database-backup.db"
fi

# Backup de configuracoes
run_on_target "cp '${OPENCLAW_DIR}/package.json' '${BACKUP_DIR}/' 2>/dev/null" || true
run_on_target "cp '${OPENCLAW_DIR}/.env' '${BACKUP_DIR}/' 2>/dev/null" || true
run_on_target "cp -r '${OPENCLAW_DIR}/groups' '${BACKUP_DIR}/groups-backup' 2>/dev/null" || true

# Snapshot do git
run_on_target "cd '${OPENCLAW_DIR}' && git stash 2>/dev/null && git log --oneline -5 > '${BACKUP_DIR}/git-state.txt' && git rev-parse HEAD > '${BACKUP_DIR}/git-sha.txt'" 2>/dev/null || true

ok "Backup criado em ${BACKUP_DIR}"

echo ""

# --- 1.7 Criar diretorio de trabalho ----------------------------------------
log "=== Preparando diretorio de migracao ==="

MIGRATION_WORK_DIR="${OPENCLAW_DIR}/migration-work"
run_on_target "mkdir -p '${MIGRATION_WORK_DIR}'"
ok "Diretorio de trabalho: ${MIGRATION_WORK_DIR}"

echo ""

# --- Resultado ---------------------------------------------------------------
echo "============================================================"
if [[ ${ERRORS} -eq 0 ]]; then
  echo -e "${GREEN}  VALIDACAO CONCLUIDA COM SUCESSO${NC}"
  echo "  Ambiente pronto para migracao."
else
  echo -e "${RED}  VALIDACAO CONCLUIDA COM ${ERRORS} ERRO(S)${NC}"
  echo "  Corrija os erros acima antes de prosseguir."
fi
echo "============================================================"
echo ""
log "Fim: $(date)"
log "Log completo: ${LOG_FILE}"

exit ${ERRORS}
