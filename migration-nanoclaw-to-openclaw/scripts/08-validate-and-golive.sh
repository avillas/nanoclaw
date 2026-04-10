#!/usr/bin/env bash
# ============================================================================
# Fase 8: Validacao Completa e Go-Live
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/08-validate-$(date +%Y%m%d_%H%M%S).log"
DASHBOARD_PORT="${DASHBOARD_PORT:-3000}"
CHECK_ONLY="${1:-}"  # Passar --check-only para modo verificacao

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[✓]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[△]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[✗]${NC} $*" | tee -a "${LOG_FILE}"; }

PASS=0
WARN=0
FAIL=0

check_pass() { ok "$*"; ((PASS++)); }
check_warn() { warn "$*"; ((WARN++)); }
check_fail() { fail "$*"; ((FAIL++)); }

echo ""
echo "============================================================"
echo "  Fase 8: Validacao e Go-Live"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "OpenClaw: ${OPENCLAW_DIR}"

# === VALIDACOES ESTRUTURAIS ==================================================
log "=== Validacoes Estruturais ==="

# 1. OpenClaw existe e tem package.json
if [[ -f "${OPENCLAW_DIR}/package.json" ]]; then
  check_pass "package.json presente"
else
  check_fail "package.json nao encontrado"
fi

# 2. Build compilado
if [[ -d "${OPENCLAW_DIR}/dist" ]]; then
  check_pass "Build compilado (dist/ presente)"
else
  check_fail "Build nao compilado (dist/ ausente)"
fi

# 3. Offices
for office in marketing development innovation; do
  if [[ -d "${OPENCLAW_DIR}/offices/${office}" ]]; then
    if [[ -f "${OPENCLAW_DIR}/offices/${office}/CLAUDE.md" ]]; then
      AGENT_COUNT=$(ls -d "${OPENCLAW_DIR}/offices/${office}/agents/"*/ 2>/dev/null | wc -l || echo "0")
      check_pass "Office ${office}: ${AGENT_COUNT} agentes"
    else
      check_warn "Office ${office}: sem CLAUDE.md"
    fi
  else
    check_fail "Office ${office}: nao encontrado"
  fi
done

# 4. Shared skills
if [[ -d "${OPENCLAW_DIR}/offices/shared/skills" ]]; then
  check_pass "Shared skills presente"
else
  check_warn "Shared skills nao encontrado"
fi

# 5. Dashboard
if [[ -d "${OPENCLAW_DIR}/offices/dashboard" ]]; then
  if [[ -d "${OPENCLAW_DIR}/offices/dashboard/node_modules" ]]; then
    check_pass "Dashboard instalado"
  else
    check_warn "Dashboard presente mas dependencias nao instaladas"
  fi
else
  check_fail "Dashboard nao encontrado"
fi

echo ""

# === VALIDACOES DO BANCO DE DADOS ============================================
log "=== Validacoes do Banco de Dados ==="

OC_DB=""
for candidate in "${OPENCLAW_DIR}/store/openclaw.db" "${OPENCLAW_DIR}/store/data.db" "${OPENCLAW_DIR}/store/nanoclaw.db"; do
  if [[ -f "${candidate}" ]]; then
    OC_DB="${candidate}"
    break
  fi
done

if [[ -n "${OC_DB}" ]]; then
  check_pass "Banco de dados encontrado: $(basename ${OC_DB})"

  # Verificar integridade
  INTEGRITY=$(sqlite3 "${OC_DB}" "PRAGMA integrity_check;" 2>/dev/null)
  if [[ "${INTEGRITY}" == "ok" ]]; then
    check_pass "Integridade do banco OK"
  else
    check_fail "Banco corrompido: ${INTEGRITY}"
  fi

  # Verificar tabelas essenciais
  for tbl in chats messages registered_groups scheduled_tasks agent_costs pipeline_executions; do
    if sqlite3 "${OC_DB}" "SELECT COUNT(*) FROM ${tbl};" &>/dev/null; then
      COUNT=$(sqlite3 "${OC_DB}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null)
      check_pass "Tabela ${tbl}: ${COUNT} registros"
    else
      check_fail "Tabela ${tbl} nao existe"
    fi
  done
else
  check_fail "Banco de dados nao encontrado"
fi

echo ""

# === VALIDACOES DE GRUPOS ====================================================
log "=== Validacoes de Grupos ==="

if [[ -f "${OPENCLAW_DIR}/groups/main/CLAUDE.md" ]]; then
  check_pass "Grupo main configurado"
else
  check_fail "Grupo main sem CLAUDE.md"
fi

if [[ -f "${OPENCLAW_DIR}/groups/global/CLAUDE.md" ]]; then
  check_pass "Grupo global configurado"
else
  check_warn "Grupo global sem CLAUDE.md"
fi

GROUP_COUNT=$(ls -d "${OPENCLAW_DIR}"/groups/*/ 2>/dev/null | wc -l || echo "0")
check_pass "Total de grupos: ${GROUP_COUNT}"

echo ""

# === VALIDACOES DE CANAIS ====================================================
log "=== Validacoes de Canais ==="

OC_ENV="${OPENCLAW_DIR}/.env"
if [[ -f "${OC_ENV}" ]]; then
  # Telegram
  if grep -q "^TELEGRAM_BOT_TOKEN=" "${OC_ENV}" 2>/dev/null; then
    check_pass "Telegram: token configurado"
  else
    check_warn "Telegram: token nao configurado"
  fi

  # Slack
  if grep -q "^SLACK_BOT_TOKEN=" "${OC_ENV}" 2>/dev/null; then
    check_pass "Slack: token configurado"
  else
    check_warn "Slack: token nao configurado"
  fi

  # Discord
  if grep -q "^DISCORD_BOT_TOKEN=" "${OC_ENV}" 2>/dev/null; then
    check_pass "Discord: token configurado"
  else
    check_warn "Discord: token nao configurado"
  fi

  # Gmail
  if grep -q "^GMAIL_CLIENT_ID=" "${OC_ENV}" 2>/dev/null; then
    check_pass "Gmail: credenciais configuradas"
  else
    check_warn "Gmail: credenciais nao configuradas"
  fi
else
  check_fail "Arquivo .env nao encontrado"
fi

echo ""

# === VALIDACOES DE CONTAINER =================================================
log "=== Validacoes de Container ==="

# Docker/Podman
if docker info &>/dev/null 2>&1; then
  check_pass "Docker disponivel"

  # Verificar imagem
  IMG_NAME=$(grep "^CONTAINER_IMAGE=" "${OC_ENV}" 2>/dev/null | cut -d= -f2- || echo "nanoclaw-agent:latest")
  if docker image inspect "${IMG_NAME}" &>/dev/null 2>&1; then
    check_pass "Imagem container: ${IMG_NAME}"
  else
    check_warn "Imagem ${IMG_NAME} nao encontrada - executar: ./container/build.sh"
  fi
elif podman info &>/dev/null 2>&1; then
  check_pass "Podman disponivel"
else
  check_fail "Nenhum container runtime disponivel"
fi

echo ""

# === VALIDACOES DE SERVICO ===================================================
log "=== Validacoes de Servico ==="

# systemd
if systemctl --user is-active openclaw &>/dev/null 2>&1; then
  check_pass "Servico systemd: ativo"
elif systemctl --user is-enabled openclaw &>/dev/null 2>&1; then
  check_warn "Servico systemd: habilitado mas nao ativo"
else
  check_warn "Servico systemd nao configurado"
fi

# Dashboard via PM2
if command -v pm2 &>/dev/null; then
  if pm2 list 2>/dev/null | grep -q "openclaw-dashboard"; then
    DASH_STATUS=$(pm2 list 2>/dev/null | grep "openclaw-dashboard" | awk '{print $12}' || echo "?")
    if [[ "${DASH_STATUS}" == "online" ]]; then
      check_pass "Dashboard PM2: online"
    else
      check_warn "Dashboard PM2: ${DASH_STATUS}"
    fi
  else
    check_warn "Dashboard nao registrado no PM2"
  fi
fi

# Dashboard HTTP
if curl -sf "http://localhost:${DASHBOARD_PORT}" > /dev/null 2>&1; then
  check_pass "Dashboard HTTP: acessivel na porta ${DASHBOARD_PORT}"
else
  check_warn "Dashboard HTTP: nao acessivel na porta ${DASHBOARD_PORT}"
fi

echo ""

# === CONFIGURAR SYSTEMD (se nao estiver no modo check-only) ==================
if [[ "${CHECK_ONLY}" != "--check-only" ]]; then
  log "=== Configurando servico systemd ==="

  SYSTEMD_DIR="${HOME}/.config/systemd/user"
  mkdir -p "${SYSTEMD_DIR}"

  cat > "${SYSTEMD_DIR}/openclaw.service" << EOF
[Unit]
Description=OpenClaw AI Assistant
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=${OPENCLAW_DIR}
ExecStart=$(which node) ${OPENCLAW_DIR}/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable openclaw 2>/dev/null || true

  ok "Servico systemd configurado"
  log "Para iniciar: systemctl --user start openclaw"
  log "Para ver logs: journalctl --user -u openclaw -f"
fi

# === REBUILDAR CONTAINER (se necessario) =====================================
if [[ "${CHECK_ONLY}" != "--check-only" ]]; then
  log "=== Verificando container image ==="

  if [[ -f "${OPENCLAW_DIR}/container/build.sh" ]]; then
    IMG_NAME=$(grep "^CONTAINER_IMAGE=" "${OC_ENV}" 2>/dev/null | cut -d= -f2- || echo "nanoclaw-agent:latest")
    if ! docker image inspect "${IMG_NAME}" &>/dev/null 2>&1; then
      log "Construindo imagem de container..."
      cd "${OPENCLAW_DIR}"
      bash container/build.sh >> "${LOG_FILE}" 2>&1 && ok "Imagem construida" || warn "Falha ao construir imagem"
    fi
  fi
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

TOTAL=$((PASS + WARN + FAIL))
if [[ ${FAIL} -eq 0 ]]; then
  echo -e "${GREEN}============================================================${NC}"
  echo -e "${GREEN}  SISTEMA PRONTO PARA GO-LIVE${NC}"
  echo -e "${GREEN}============================================================${NC}"
  echo ""
  if [[ "${CHECK_ONLY}" != "--check-only" ]]; then
    echo "Proximos passos:"
    echo "  1. Iniciar servico:    systemctl --user start openclaw"
    echo "  2. Monitorar logs:     journalctl --user -u openclaw -f"
    echo "  3. Verificar dashboard: http://localhost:${DASHBOARD_PORT}"
    echo "  4. Enviar mensagem teste no Telegram"
    echo "  5. Monitorar por 30 minutos antes de confirmar sucesso"
  fi
elif [[ ${FAIL} -le 3 ]]; then
  echo -e "${YELLOW}============================================================${NC}"
  echo -e "${YELLOW}  SISTEMA PARCIALMENTE PRONTO - CORRIGIR FALHAS${NC}"
  echo -e "${YELLOW}============================================================${NC}"
else
  echo -e "${RED}============================================================${NC}"
  echo -e "${RED}  MIGRACAO INCOMPLETA - ${FAIL} PROBLEMAS CRITICOS${NC}"
  echo -e "${RED}============================================================${NC}"
fi

echo ""
log "Fim: $(date)"
log "Log completo: ${LOG_FILE}"

exit ${FAIL}
