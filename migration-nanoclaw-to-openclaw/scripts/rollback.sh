#!/usr/bin/env bash
# ============================================================================
# Rollback da Migracao NanoClaw -> OpenClaw
# Restaura o OpenClaw ao estado anterior a migracao
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
DASHBOARD_DIR="${DASHBOARD_DIR:-$HOME/openclaw-dashboard}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

echo ""
echo "============================================================"
echo -e "  ${RED}ROLLBACK: Restaurar OpenClaw${NC}"
echo "============================================================"
echo ""

# Encontrar backup mais recente
BACKUP_DIR=$(ls -td "${OPENCLAW_DIR}"/.backups/pre-migration-* 2>/dev/null | head -1)

if [[ -z "${BACKUP_DIR}" ]]; then
  fail "Nenhum backup de pre-migracao encontrado em ${OPENCLAW_DIR}/.backups/"
  exit 1
fi

log "Backup encontrado: ${BACKUP_DIR}"
echo ""
echo -e "${RED}ATENCAO: Todas as alteracoes da migracao serao perdidas.${NC}"
echo ""
read -p "Deseja continuar com o rollback? (s/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  echo "Rollback cancelado."
  exit 0
fi

# 1. Parar servicos
log "Parando servicos..."
systemctl --user stop openclaw 2>/dev/null || true
if command -v pm2 &>/dev/null; then
  pm2 delete openclaw-dashboard 2>/dev/null || true
fi
ok "Servicos parados"

# 2. Restaurar config
if [[ -f "${BACKUP_DIR}/openclaw.json" ]]; then
  cp "${BACKUP_DIR}/openclaw.json" "${OPENCLAW_DIR}/openclaw.json"
  ok "openclaw.json restaurado"
elif [[ -f "${BACKUP_DIR}/clawdbot.json" ]]; then
  cp "${BACKUP_DIR}/clawdbot.json" "${OPENCLAW_DIR}/clawdbot.json"
  ok "clawdbot.json restaurado"
fi

# 3. Restaurar workspace
if [[ -d "${BACKUP_DIR}/workspace-backup" ]]; then
  rm -rf "${OPENCLAW_DIR}/workspace"
  cp -r "${BACKUP_DIR}/workspace-backup" "${OPENCLAW_DIR}/workspace"
  ok "Workspace restaurado"
fi

# 4. Restaurar auth
if [[ -f "${BACKUP_DIR}/auth-profiles.json" ]]; then
  cp "${BACKUP_DIR}/auth-profiles.json" "${OPENCLAW_DIR}/auth-profiles.json"
  ok "auth-profiles.json restaurado"
fi

# 5. Restaurar cron
if [[ -d "${BACKUP_DIR}/cron-backup" ]]; then
  rm -rf "${OPENCLAW_DIR}/cron"
  cp -r "${BACKUP_DIR}/cron-backup" "${OPENCLAW_DIR}/cron"
  ok "Cron restaurado"
fi

# 6. Restaurar agents/sessions
if [[ -d "${BACKUP_DIR}/agents-backup" ]]; then
  rm -rf "${OPENCLAW_DIR}/agents"
  cp -r "${BACKUP_DIR}/agents-backup" "${OPENCLAW_DIR}/agents"
  ok "Agents restaurados"
fi

# 7. Reiniciar servico
log "Reiniciando OpenClaw..."
systemctl --user start openclaw 2>/dev/null || true
ok "Servico reiniciado"

echo ""
echo "============================================================"
echo -e "${GREEN}  ROLLBACK CONCLUIDO${NC}"
echo "  Estado restaurado de: ${BACKUP_DIR}"
echo "============================================================"
echo ""
echo "Verifique: ./08-validate-and-golive.sh --check-only"
