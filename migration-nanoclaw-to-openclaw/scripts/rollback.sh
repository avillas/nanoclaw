#!/usr/bin/env bash
# ============================================================================
# Rollback da Migracao NanoClaw -> OpenClaw
# Restaura o OpenClaw ao estado anterior a migracao
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"

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
BACKUP_DIR=$(ls -td "${OPENCLAW_DIR}"/backups/pre-migration-* 2>/dev/null | head -1)

if [[ -z "${BACKUP_DIR}" ]]; then
  fail "Nenhum backup de pre-migracao encontrado em ${OPENCLAW_DIR}/backups/"
  exit 1
fi

log "Backup encontrado: ${BACKUP_DIR}"
echo ""
echo -e "${RED}ATENCAO: Este script vai restaurar o OpenClaw ao estado${NC}"
echo -e "${RED}anterior a migracao. Todas as alteracoes da migracao serao perdidas.${NC}"
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

# 2. Restaurar banco de dados
if [[ -f "${BACKUP_DIR}/database-backup.db" ]]; then
  log "Restaurando banco de dados..."
  OC_DB=""
  for candidate in "${OPENCLAW_DIR}/store/openclaw.db" "${OPENCLAW_DIR}/store/data.db" "${OPENCLAW_DIR}/store/nanoclaw.db"; do
    if [[ -f "${candidate}" ]]; then
      OC_DB="${candidate}"
      break
    fi
  done
  if [[ -n "${OC_DB}" ]]; then
    cp "${BACKUP_DIR}/database-backup.db" "${OC_DB}"
    ok "Banco restaurado"
  fi
fi

# 3. Restaurar grupos
if [[ -d "${BACKUP_DIR}/groups-backup" ]]; then
  log "Restaurando grupos..."
  rm -rf "${OPENCLAW_DIR}/groups"
  cp -r "${BACKUP_DIR}/groups-backup" "${OPENCLAW_DIR}/groups"
  ok "Grupos restaurados"
fi

# 4. Restaurar .env
if [[ -f "${BACKUP_DIR}/.env" ]]; then
  log "Restaurando .env..."
  cp "${BACKUP_DIR}/.env" "${OPENCLAW_DIR}/.env"
  ok ".env restaurado"
fi

# 5. Restaurar git state
if [[ -f "${BACKUP_DIR}/git-sha.txt" ]]; then
  log "Restaurando estado do git..."
  cd "${OPENCLAW_DIR}"
  SHA=$(cat "${BACKUP_DIR}/git-sha.txt")
  CURRENT_BRANCH=$(git branch --show-current)

  # Se estamos em branch de migracao, voltar para a anterior
  if [[ "${CURRENT_BRANCH}" == migration/* ]]; then
    git checkout main 2>/dev/null || git checkout master 2>/dev/null || true
  fi

  # Resetar para o SHA do backup
  git reset --hard "${SHA}" 2>/dev/null || warn "Nao foi possivel resetar para ${SHA}"

  # Restaurar stash
  git stash pop 2>/dev/null || true

  ok "Estado do git restaurado para ${SHA}"
fi

# 6. Reinstalar dependencias
log "Reinstalando dependencias..."
cd "${OPENCLAW_DIR}"
npm install 2>/dev/null || true
npm run build 2>/dev/null || true
ok "Dependencias reinstaladas"

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
echo "Verifique o estado: ./08-validate-and-golive.sh --check-only"
