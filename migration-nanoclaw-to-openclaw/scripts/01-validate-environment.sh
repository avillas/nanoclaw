#!/usr/bin/env bash
# ============================================================================
# Fase 1: Validacao e Preparacao do Ambiente de Destino
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

# --- Configuracao -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
NANOCLAW_DIR="${NANOCLAW_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-${OPENCLAW_DIR}/.backups/pre-migration-$(date +%Y%m%d_%H%M%S)}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/01-validate-$(date +%Y%m%d_%H%M%S).log"
MIN_DISK_GB="${MIN_DISK_GB:-5}"
REMOTE_HOST="${REMOTE_HOST:-}"

mkdir -p "${LOG_DIR}"

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

echo ""
echo "============================================================"
echo "  Fase 1: Validacao do Ambiente"
echo "  Migracao NanoClaw -> OpenClaw"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "NanoClaw: ${NANOCLAW_DIR}"
log "OpenClaw state dir: ${OPENCLAW_DIR}"
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

DB_PATH=""
for candidate in "${NANOCLAW_DIR}/store/messages.db" "${NANOCLAW_DIR}/store/nanoclaw.db" "${NANOCLAW_DIR}/store/data.db"; do
  if [[ -f "${candidate}" ]]; then
    DB_PATH="${candidate}"
    break
  fi
done
if [[ -n "${DB_PATH}" ]]; then
  DB_SIZE=$(du -h "${DB_PATH}" | cut -f1)
  ok "Banco de dados encontrado (${DB_SIZE})"
else
  warn "Banco de dados SQLite nao encontrado em store/"
fi

echo ""

# --- 1.2 Verificar conectividade com destino ---------------------------------
log "=== Verificando destino ==="

if [[ -n "${REMOTE_HOST}" ]]; then
  if ssh -o ConnectTimeout=10 "${REMOTE_HOST}" "echo ok" >> "${LOG_FILE}" 2>&1; then
    ok "Conexao SSH com ${REMOTE_HOST}"
  else
    die "Nao foi possivel conectar via SSH em ${REMOTE_HOST}"
  fi
else
  ok "Migracao local (mesmo host)"
fi

# --- 1.3 Verificar OpenClaw no destino ---------------------------------------
log "=== Verificando OpenClaw ==="

# OpenClaw e um CLI global, nao um projeto Node. Verificar o binario e o state dir.
if run_on_target "command -v openclaw" &>/dev/null 2>&1; then
  OC_VERSION=$(run_on_target "openclaw --version 2>/dev/null" || echo "desconhecida")
  ok "OpenClaw CLI encontrado (${OC_VERSION})"
else
  fail "Comando 'openclaw' nao encontrado no PATH"
  warn "Instale com: npm install -g openclaw  (ou execute a Fase 0)"
  ((ERRORS++))
fi

# Verificar state dir (config principal)
if run_on_target "[[ -f '${OPENCLAW_DIR}/openclaw.json' ]]" 2>/dev/null; then
  ok "Config encontrada: ${OPENCLAW_DIR}/openclaw.json"
elif run_on_target "[[ -f '${OPENCLAW_DIR}/clawdbot.json' ]]" 2>/dev/null; then
  ok "Config encontrada: ${OPENCLAW_DIR}/clawdbot.json (formato legado)"
else
  fail "Nenhum openclaw.json ou clawdbot.json em ${OPENCLAW_DIR}"
  warn "O OpenClaw precisa ser inicializado. Execute: openclaw"
  ((ERRORS++))
fi

# Verificar workspace
if run_on_target "[[ -d '${OPENCLAW_DIR}/workspace' ]]" 2>/dev/null; then
  WORKSPACE_FILES=$(run_on_target "ls '${OPENCLAW_DIR}/workspace/'*.md 2>/dev/null | wc -l" || echo "0")
  ok "Workspace encontrado (${WORKSPACE_FILES} arquivos .md)"
else
  warn "Diretorio workspace/ nao encontrado em ${OPENCLAW_DIR}"
fi

# Verificar se esta rodando
if run_on_target "systemctl --user is-active openclaw 2>/dev/null" 2>/dev/null | grep -q "active"; then
  ok "OpenClaw esta rodando (systemd)"
elif run_on_target "pgrep -f 'openclaw' >/dev/null 2>&1" 2>/dev/null; then
  ok "OpenClaw esta rodando (processo)"
else
  warn "OpenClaw nao parece estar rodando"
fi

echo ""

# --- 1.4 Pre-requisitos no destino -------------------------------------------
log "=== Verificando pre-requisitos ==="

NODE_VERSION=$(run_on_target "node --version 2>/dev/null" || echo "nao instalado")
if [[ "${NODE_VERSION}" =~ ^v(2[2-9]|[3-9][0-9]) ]]; then
  ok "Node.js: ${NODE_VERSION}"
else
  fail "Node.js >= 22.14 necessario (encontrado: ${NODE_VERSION})"
  ((ERRORS++))
fi

NPM_VERSION=$(run_on_target "npm --version 2>/dev/null" || echo "nao instalado")
ok "npm: v${NPM_VERSION}"

if run_on_target "docker --version >/dev/null 2>&1"; then
  ok "Docker: $(run_on_target 'docker --version 2>/dev/null' | head -1)"
elif run_on_target "podman --version >/dev/null 2>&1"; then
  ok "Podman: $(run_on_target 'podman --version 2>/dev/null' | head -1)"
else
  fail "Docker ou Podman nao encontrado"
  ((ERRORS++))
fi

if run_on_target "sqlite3 --version >/dev/null 2>&1"; then
  ok "SQLite: $(run_on_target 'sqlite3 --version 2>/dev/null' | head -1)"
else
  warn "sqlite3 CLI nao encontrado (pode usar better-sqlite3 do Node)"
fi

if run_on_target "git --version >/dev/null 2>&1"; then
  ok "Git: $(run_on_target 'git --version 2>/dev/null')"
else
  fail "Git nao encontrado"
  ((ERRORS++))
fi

echo ""

# --- 1.5 Espaco em disco ----------------------------------------------------
log "=== Verificando espaco em disco ==="

AVAIL_KB=$(run_on_target "df -k '$HOME' 2>/dev/null | tail -1 | awk '{print \$4}'" || echo "0")
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

# Backup do config
run_on_target "cp '${OPENCLAW_DIR}/openclaw.json' '${BACKUP_DIR}/' 2>/dev/null || cp '${OPENCLAW_DIR}/clawdbot.json' '${BACKUP_DIR}/' 2>/dev/null" || true

# Backup do workspace
run_on_target "cp -r '${OPENCLAW_DIR}/workspace' '${BACKUP_DIR}/workspace-backup' 2>/dev/null" || true

# Backup do auth
run_on_target "cp '${OPENCLAW_DIR}/auth-profiles.json' '${BACKUP_DIR}/' 2>/dev/null" || true

# Backup do cron
run_on_target "cp -r '${OPENCLAW_DIR}/cron' '${BACKUP_DIR}/cron-backup' 2>/dev/null" || true

# Backup dos agents/sessions
run_on_target "cp -r '${OPENCLAW_DIR}/agents' '${BACKUP_DIR}/agents-backup' 2>/dev/null" || true

# Snapshot do estado
run_on_target "ls -la '${OPENCLAW_DIR}/' > '${BACKUP_DIR}/state-snapshot.txt' 2>/dev/null" || true
run_on_target "date > '${BACKUP_DIR}/backup-timestamp.txt'" || true

ok "Backup criado em ${BACKUP_DIR}"

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
