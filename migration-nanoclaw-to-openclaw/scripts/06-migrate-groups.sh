#!/usr/bin/env bash
# ============================================================================
# Fase 6: Migracao de Grupos e Memoria
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# NanoClaw: groups/{nome}/CLAUDE.md (um dir por grupo, cada um com memoria)
# OpenClaw: workspace/SOUL.md + MEMORY.md (compartilhado) +
#           agents/<id>/sessions/sessions.json (historico por grupo)
#           workspace/memory/YYYY-MM-DD.md (memoria diaria)
#
# Este script:
#   1. Consolida CLAUDE.md dos grupos em workspace/MEMORY.md
#   2. Cria entradas de memoria diaria a partir dos dados
#   3. Garante que grupos estejam em sessions.json
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/06-migrate-groups-$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }

echo ""
echo "============================================================"
echo "  Fase 6: Migracao de Grupos e Memoria"
echo "============================================================"
echo ""
log "Inicio: $(date)"

GROUPS_SRC="${EXPORT_DIR}/groups"
if [[ ! -d "${GROUPS_SRC}" ]]; then
  warn "Diretorio de grupos nao encontrado em ${GROUPS_SRC}"
  exit 0
fi

# --- 6.1 Migrar global e main para workspace --------------------------------
log "=== Migrando memoria global e principal ==="

# global/CLAUDE.md -> ja foi para SOUL.md na fase 3
# main/CLAUDE.md -> ja foi para MEMORY.md na fase 3
# Verificar se foram migrados

if grep -q "nanoclaw\|NanoClaw\|Migrado" "${OPENCLAW_DIR}/workspace/SOUL.md" 2>/dev/null; then
  ok "SOUL.md ja contem dados migrados do global"
else
  if [[ -f "${GROUPS_SRC}/global/CLAUDE.md" ]]; then
    echo "" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
    echo "<!-- Migrado de NanoClaw groups/global/CLAUDE.md -->" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
    cat "${GROUPS_SRC}/global/CLAUDE.md" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
    ok "Global -> SOUL.md"
  fi
fi

if grep -q "nanoclaw\|NanoClaw\|Migrado" "${OPENCLAW_DIR}/workspace/MEMORY.md" 2>/dev/null; then
  ok "MEMORY.md ja contem dados migrados do main"
else
  if [[ -f "${GROUPS_SRC}/main/CLAUDE.md" ]]; then
    echo "" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
    echo "<!-- Migrado de NanoClaw groups/main/CLAUDE.md -->" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
    cat "${GROUPS_SRC}/main/CLAUDE.md" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
    ok "Main -> MEMORY.md"
  fi
fi

# --- 6.2 Migrar grupos individuais como notas de memoria ---------------------
log "=== Migrando memoria dos grupos individuais ==="

mkdir -p "${OPENCLAW_DIR}/workspace/memory"
MIGRATED=0
TODAY=$(date +%Y-%m-%d)
MIGRATION_MEMORY="${OPENCLAW_DIR}/workspace/memory/${TODAY}.md"

# Criar arquivo de memoria do dia da migracao
echo "# Migracao NanoClaw - Memoria dos Grupos" > "${MIGRATION_MEMORY}"
echo "" >> "${MIGRATION_MEMORY}"
echo "Data da migracao: $(date)" >> "${MIGRATION_MEMORY}"
echo "" >> "${MIGRATION_MEMORY}"

for group_dir in "${GROUPS_SRC}"/*/; do
  group_name=$(basename "${group_dir}")

  # Pular global e main (ja migrados acima)
  [[ "${group_name}" == "global" ]] && continue
  [[ "${group_name}" == "main" ]] && continue

  if [[ -f "${group_dir}/CLAUDE.md" ]]; then
    echo "## Grupo: ${group_name}" >> "${MIGRATION_MEMORY}"
    echo "" >> "${MIGRATION_MEMORY}"
    cat "${group_dir}/CLAUDE.md" >> "${MIGRATION_MEMORY}"
    echo "" >> "${MIGRATION_MEMORY}"
    echo "---" >> "${MIGRATION_MEMORY}"
    echo "" >> "${MIGRATION_MEMORY}"
    log "  Grupo migrado: ${group_name}"
    ((MIGRATED++))
  fi
done

ok "Total de grupos migrados como memoria: ${MIGRATED}"

# --- 6.3 Preservar grupos originais como referencia --------------------------
log "=== Preservando grupos originais ==="

mkdir -p "${OPENCLAW_DIR}/workspace/.migration-ref/groups"
cp -r "${GROUPS_SRC}/"* "${OPENCLAW_DIR}/workspace/.migration-ref/groups/" 2>/dev/null || true
ok "Grupos originais preservados em workspace/.migration-ref/groups/"

# --- 6.4 Verificar sessions.json --------------------------------------------
log "=== Verificando sessions.json ==="

SESSIONS_FILE="${OPENCLAW_DIR}/agents/main/sessions/sessions.json"
if [[ -f "${SESSIONS_FILE}" ]]; then
  SESSION_COUNT=$(node -e "
    const s = JSON.parse(require('fs').readFileSync('${SESSIONS_FILE}', 'utf-8'));
    console.log(Object.keys(s.sessions || {}).length);
  " 2>/dev/null || echo "?")
  ok "Sessions.json: ${SESSION_COUNT} sessoes registradas"
else
  warn "sessions.json nao encontrado (sera criado na Fase 4 ou pelo OpenClaw)"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DE GRUPOS CONCLUIDA${NC}"
echo "  Grupos individuais: ${MIGRATED}"
echo "  Memoria: ${MIGRATION_MEMORY}"
echo "============================================================"
log "Fim: $(date)"
