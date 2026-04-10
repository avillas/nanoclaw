#!/usr/bin/env bash
# ============================================================================
# Fase 8: Validacao Completa e Go-Live
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
DASHBOARD_DIR="${DASHBOARD_DIR:-$HOME/openclaw-dashboard}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/08-validate-$(date +%Y%m%d_%H%M%S).log"
DASHBOARD_PORT="${DASHBOARD_PORT:-3000}"
CHECK_ONLY="${1:-}"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }

PASS=0; WARN=0; FAIL=0
check_pass() { echo -e "${GREEN}[✓]${NC} $*" | tee -a "${LOG_FILE}"; ((PASS++)); }
check_warn() { echo -e "${YELLOW}[△]${NC} $*" | tee -a "${LOG_FILE}"; ((WARN++)); }
check_fail() { echo -e "${RED}[✗]${NC} $*" | tee -a "${LOG_FILE}"; ((FAIL++)); }

echo ""
echo "============================================================"
echo "  Fase 8: Validacao e Go-Live"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "OpenClaw: ${OPENCLAW_DIR}"

# === OPENCLAW CLI ============================================================
log "=== OpenClaw CLI ==="

if command -v openclaw &>/dev/null; then
  OC_VER=$(openclaw --version 2>/dev/null || echo "?")
  check_pass "OpenClaw CLI: ${OC_VER}"
else
  check_fail "Comando 'openclaw' nao encontrado"
fi

echo ""

# === STATE DIR ===============================================================
log "=== State Dir ==="

if [[ -f "${OPENCLAW_DIR}/openclaw.json" ]]; then
  check_pass "openclaw.json presente"
elif [[ -f "${OPENCLAW_DIR}/clawdbot.json" ]]; then
  check_pass "clawdbot.json presente (formato legado)"
else
  check_fail "Config principal nao encontrada"
fi

if [[ -d "${OPENCLAW_DIR}/workspace" ]]; then
  check_pass "workspace/ existe"
  for f in IDENTITY.md SOUL.md MEMORY.md; do
    if [[ -f "${OPENCLAW_DIR}/workspace/${f}" ]]; then
      check_pass "workspace/${f}"
    else
      check_warn "workspace/${f} nao encontrado"
    fi
  done
else
  check_fail "workspace/ nao existe"
fi

if [[ -f "${OPENCLAW_DIR}/auth-profiles.json" ]]; then
  check_pass "auth-profiles.json presente"
else
  check_warn "auth-profiles.json nao encontrado"
fi

echo ""

# === OFFICES =================================================================
log "=== Offices ==="

OFFICES_PATH="${OPENCLAW_DIR}/workspace/offices"
for office in marketing development innovation; do
  if [[ -d "${OFFICES_PATH}/${office}" ]]; then
    AGENT_COUNT=0
    [[ -d "${OFFICES_PATH}/${office}/agents" ]] && AGENT_COUNT=$(ls -d "${OFFICES_PATH}/${office}/agents/"*/ 2>/dev/null | wc -l || echo "0")
    check_pass "Office ${office}: ${AGENT_COUNT} agentes"
  else
    check_fail "Office ${office}: nao encontrado"
  fi
done

if [[ -d "${OFFICES_PATH}/shared/skills" ]]; then
  check_pass "Shared skills presente"
else
  check_warn "Shared skills nao encontrado"
fi

echo ""

# === CANAIS ==================================================================
log "=== Canais ==="

OC_CONFIG="${OPENCLAW_DIR}/openclaw.json"
[[ ! -f "${OC_CONFIG}" ]] && OC_CONFIG="${OPENCLAW_DIR}/clawdbot.json"

if [[ -f "${OC_CONFIG}" ]]; then
  for channel in telegram slack discord; do
    if node -e "
      const c = JSON.parse(require('fs').readFileSync('${OC_CONFIG}','utf-8'));
      process.exit(c.channels && c.channels['${channel}'] ? 0 : 1);
    " 2>/dev/null; then
      check_pass "${channel^}: configurado em openclaw.json"
    else
      check_warn "${channel^}: nao configurado"
    fi
  done
else
  check_fail "Config nao encontrada para verificar canais"
fi

echo ""

# === TAREFAS AGENDADAS =======================================================
log "=== Tarefas Agendadas ==="

JOBS_FILE="${OPENCLAW_DIR}/cron/jobs.json"
if [[ -f "${JOBS_FILE}" ]]; then
  JOB_COUNT=$(node -e "
    const j = JSON.parse(require('fs').readFileSync('${JOBS_FILE}','utf-8'));
    console.log((j.jobs||[]).length);
  " 2>/dev/null || echo "0")
  check_pass "cron/jobs.json: ${JOB_COUNT} tarefas"
else
  check_warn "cron/jobs.json nao encontrado"
fi

echo ""

# === SESSIONS ================================================================
log "=== Sessions ==="

SESSIONS_FILE="${OPENCLAW_DIR}/agents/main/sessions/sessions.json"
if [[ -f "${SESSIONS_FILE}" ]]; then
  SESSION_COUNT=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('${SESSIONS_FILE}','utf-8'));
    console.log(Object.keys(s.sessions||{}).length);
  " 2>/dev/null || echo "0")
  check_pass "sessions.json: ${SESSION_COUNT} sessoes"
else
  check_warn "sessions.json nao encontrado"
fi

echo ""

# === DADOS MIGRADOS ==========================================================
log "=== Dados Migrados ==="

REF_DIR="${OPENCLAW_DIR}/workspace/.migration-ref"
if [[ -f "${REF_DIR}/nanoclaw.db" ]]; then
  check_pass "Banco NanoClaw preservado como referencia"
else
  check_warn "Banco NanoClaw nao encontrado em referencia"
fi

if [[ -d "${REF_DIR}/groups" ]]; then
  check_pass "Grupos originais preservados"
fi

if [[ -d "${REF_DIR}/csv" ]]; then
  CSV_COUNT=$(ls "${REF_DIR}/csv/"*.csv 2>/dev/null | wc -l || echo "0")
  check_pass "CSVs de dados: ${CSV_COUNT} arquivos"
fi

echo ""

# === DASHBOARD ===============================================================
log "=== Dashboard ==="

if [[ -d "${DASHBOARD_DIR}" ]]; then
  if [[ -d "${DASHBOARD_DIR}/node_modules" ]]; then
    check_pass "Dashboard instalado em ${DASHBOARD_DIR}"
  else
    check_warn "Dashboard presente mas dependencias nao instaladas"
  fi
else
  check_warn "Dashboard nao encontrado em ${DASHBOARD_DIR}"
fi

if command -v pm2 &>/dev/null; then
  if pm2 list 2>/dev/null | grep -q "openclaw-dashboard"; then
    check_pass "Dashboard registrado no PM2"
  else
    check_warn "Dashboard nao registrado no PM2"
  fi
fi

if curl -sf "http://localhost:${DASHBOARD_PORT}" > /dev/null 2>&1; then
  check_pass "Dashboard HTTP acessivel na porta ${DASHBOARD_PORT}"
else
  check_warn "Dashboard nao acessivel na porta ${DASHBOARD_PORT}"
fi

echo ""

# === INFRAESTRUTURA ==========================================================
log "=== Infraestrutura ==="

NODE_V=$(node --version 2>/dev/null || echo "?")
check_pass "Node.js: ${NODE_V}"

if docker info &>/dev/null 2>&1; then
  check_pass "Docker disponivel"
else
  check_warn "Docker nao acessivel"
fi

if systemctl --user is-enabled openclaw &>/dev/null 2>&1; then
  check_pass "Servico systemd habilitado"
  if systemctl --user is-active openclaw &>/dev/null 2>&1; then
    check_pass "Servico systemd ativo"
  else
    check_warn "Servico systemd habilitado mas nao ativo"
  fi
else
  check_warn "Servico systemd nao configurado"
fi

echo ""

# === RELATORIO FINAL =========================================================
echo "============================================================"
echo "  RELATORIO DE VALIDACAO"
echo "============================================================"
echo ""
echo -e "  ${GREEN}Passou:${NC}  ${PASS}"
echo -e "  ${YELLOW}Avisos:${NC}  ${WARN}"
echo -e "  ${RED}Falhas:${NC}  ${FAIL}"
echo ""

if [[ ${FAIL} -eq 0 ]]; then
  echo -e "${GREEN}============================================================${NC}"
  echo -e "${GREEN}  SISTEMA PRONTO PARA GO-LIVE${NC}"
  echo -e "${GREEN}============================================================${NC}"
  echo ""
  if [[ "${CHECK_ONLY}" != "--check-only" ]]; then
    echo "Proximos passos:"
    echo "  1. Iniciar OpenClaw:   systemctl --user start openclaw"
    echo "  2. Monitorar:          journalctl --user -u openclaw -f"
    echo "  3. Dashboard:          http://localhost:${DASHBOARD_PORT}"
    echo "     (remoto: ssh -N -L ${DASHBOARD_PORT}:localhost:${DASHBOARD_PORT} user@host)"
    echo "  4. Testar Telegram:    enviar mensagem no grupo"
    echo "  5. Observar por 30 min antes de confirmar sucesso"
  fi
elif [[ ${FAIL} -le 3 ]]; then
  echo -e "${YELLOW}  SISTEMA PARCIALMENTE PRONTO - CORRIGIR FALHAS${NC}"
else
  echo -e "${RED}  MIGRACAO INCOMPLETA - ${FAIL} PROBLEMAS CRITICOS${NC}"
fi

echo ""
log "Fim: $(date)"
log "Log: ${LOG_FILE}"

exit ${FAIL}
