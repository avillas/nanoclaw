#!/usr/bin/env bash
# ============================================================================
# Fase 6: Migracao de Grupos e Memoria
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/openclaw}"
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

# --- 6.1 Copiar estrutura de grupos -----------------------------------------
log "=== Copiando grupos ==="

GROUPS_SRC="${EXPORT_DIR}/groups"
GROUPS_DST="${OPENCLAW_DIR}/groups"

if [[ ! -d "${GROUPS_SRC}" ]]; then
  warn "Diretorio de grupos nao encontrado em ${GROUPS_SRC}"
  exit 0
fi

mkdir -p "${GROUPS_DST}"
MIGRATED=0

for group_dir in "${GROUPS_SRC}"/*/; do
  group_name=$(basename "${group_dir}")
  dst_dir="${GROUPS_DST}/${group_name}"

  mkdir -p "${dst_dir}"

  # Copiar CLAUDE.md (memoria do grupo)
  if [[ -f "${group_dir}/CLAUDE.md" ]]; then
    if [[ -f "${dst_dir}/CLAUDE.md" ]]; then
      # Mesclar: manter existente e adicionar conteudo novo como apendice
      log "Grupo ${group_name}: CLAUDE.md ja existe no destino; fazendo merge"
      cp "${dst_dir}/CLAUDE.md" "${dst_dir}/CLAUDE.md.bak"

      # Adicionar separador e conteudo migrado
      echo "" >> "${dst_dir}/CLAUDE.md"
      echo "<!-- === Conteudo migrado do NanoClaw ($(date +%Y-%m-%d)) === -->" >> "${dst_dir}/CLAUDE.md"
      echo "" >> "${dst_dir}/CLAUDE.md"
      cat "${group_dir}/CLAUDE.md" >> "${dst_dir}/CLAUDE.md"
    else
      cp "${group_dir}/CLAUDE.md" "${dst_dir}/CLAUDE.md"
    fi
    ok "Grupo: ${group_name}"
  fi

  # Copiar outros arquivos do grupo (dados, estado, etc)
  for f in "${group_dir}"*; do
    fname=$(basename "${f}")
    if [[ "${fname}" != "CLAUDE.md" ]] && [[ -f "${f}" ]]; then
      cp "${f}" "${dst_dir}/"
    fi
  done

  ((MIGRATED++))
done

ok "Total de grupos migrados: ${MIGRATED}"

# --- 6.2 Verificar grupo main -----------------------------------------------
log "=== Verificando grupo main ==="

if [[ -f "${GROUPS_DST}/main/CLAUDE.md" ]]; then
  ok "Grupo main existe com CLAUDE.md"
  # Verificar se tem as capacidades de admin
  if grep -q "isMain" "${GROUPS_DST}/main/CLAUDE.md" 2>/dev/null || \
     grep -q "admin" "${GROUPS_DST}/main/CLAUDE.md" 2>/dev/null; then
    ok "Grupo main tem configuracao administrativa"
  else
    warn "Grupo main pode precisar de configuracao administrativa"
  fi
else
  warn "Grupo main nao tem CLAUDE.md - pode precisar ser configurado"
fi

# --- 6.3 Verificar grupo global ---------------------------------------------
log "=== Verificando grupo global ==="

if [[ -f "${GROUPS_DST}/global/CLAUDE.md" ]]; then
  ok "Grupo global existe com CLAUDE.md"
else
  warn "Grupo global nao tem CLAUDE.md"
  # Criar minimo
  mkdir -p "${GROUPS_DST}/global"
  cat > "${GROUPS_DST}/global/CLAUDE.md" << 'EOF'
# Global Memory

Shared read-only memory accessible by all groups.

<!-- Migrated from NanoClaw - configure as needed -->
EOF
  ok "CLAUDE.md global criado (basico)"
fi

# --- 6.4 Verificar permissoes -----------------------------------------------
log "=== Configurando permissoes ==="

# groups/main: read-write
chmod -R 755 "${GROUPS_DST}/main" 2>/dev/null || true
# groups/global: outros grupos leem mas nao escrevem
chmod -R 755 "${GROUPS_DST}/global" 2>/dev/null || true
# Outros grupos: read-write individual
for group_dir in "${GROUPS_DST}"/*/; do
  group_name=$(basename "${group_dir}")
  if [[ "${group_name}" != "main" ]] && [[ "${group_name}" != "global" ]]; then
    chmod -R 755 "${group_dir}" 2>/dev/null || true
  fi
done
ok "Permissoes configuradas"

# --- 6.5 Listar grupos registrados no banco ---------------------------------
log "=== Verificando registro de grupos no banco ==="

OC_DB=""
for candidate in "${OPENCLAW_DIR}/store/openclaw.db" "${OPENCLAW_DIR}/store/data.db" "${OPENCLAW_DIR}/store/nanoclaw.db"; do
  if [[ -f "${candidate}" ]]; then
    OC_DB="${candidate}"
    break
  fi
done

if [[ -n "${OC_DB}" ]]; then
  REG_COUNT=$(sqlite3 "${OC_DB}" "SELECT COUNT(*) FROM registered_groups;" 2>/dev/null || echo "0")
  ok "Grupos registrados no banco: ${REG_COUNT}"

  log "Detalhes dos grupos registrados:"
  sqlite3 -header -column "${OC_DB}" "SELECT jid, name, folder, requiresTrigger FROM registered_groups;" 2>/dev/null | while read -r line; do
    log "  ${line}"
  done
else
  warn "Banco de dados nao encontrado para verificar registros"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DE GRUPOS CONCLUIDA${NC}"
echo "  Grupos: ${MIGRATED}"
echo "============================================================"
log "Fim: $(date)"
