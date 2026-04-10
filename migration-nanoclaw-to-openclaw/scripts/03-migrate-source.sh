#!/usr/bin/env bash
# ============================================================================
# Fase 3: Migracao de Codigo Customizado e Estrutura para OpenClaw
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# OpenClaw usa um state dir (~/.openclaw) com:
#   workspace/    - IDENTITY.md, SOUL.md, USER.md, MEMORY.md, skills/
#   agents/       - agentes com sessions/
#   skills/       - skills compartilhadas
#   openclaw.json - config principal
#
# NanoClaw usa:
#   groups/       - por grupo (CLAUDE.md cada) -> mapeado para workspace/ + agents/
#   offices/      - sistema multi-office -> copiado como-esta para uso externo
#   .claude/skills/ -> mapeado para skills/
#   container/skills/ -> mapeado para workspace/skills/
#
# Este script mapeia conceitos do NanoClaw para a estrutura do OpenClaw.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/03-migrate-source-$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }

echo ""
echo "============================================================"
echo "  Fase 3: Migracao de Estrutura e Customizacoes"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "OpenClaw state dir: ${OPENCLAW_DIR}"
log "Exportacao: ${EXPORT_DIR}"

# --- 3.1 Migrar workspace (IDENTITY, SOUL, USER, MEMORY) --------------------
log "=== Migrando workspace ==="

mkdir -p "${OPENCLAW_DIR}/workspace/memory"
mkdir -p "${OPENCLAW_DIR}/workspace/skills"

# Mesclar conteudo de groups/global/CLAUDE.md para SOUL.md e MEMORY.md
GLOBAL_MD="${EXPORT_DIR}/groups/global/CLAUDE.md"
MAIN_MD="${EXPORT_DIR}/groups/main/CLAUDE.md"

if [[ -f "${GLOBAL_MD}" ]]; then
  # Append conteudo global ao SOUL.md
  if [[ -f "${OPENCLAW_DIR}/workspace/SOUL.md" ]]; then
    echo "" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
    echo "<!-- Migrado de NanoClaw groups/global/CLAUDE.md ($(date +%Y-%m-%d)) -->" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
    echo "" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
    cat "${GLOBAL_MD}" >> "${OPENCLAW_DIR}/workspace/SOUL.md"
  else
    cp "${GLOBAL_MD}" "${OPENCLAW_DIR}/workspace/SOUL.md"
  fi
  ok "Global CLAUDE.md -> SOUL.md"
fi

if [[ -f "${MAIN_MD}" ]]; then
  # Append instrucoes admin ao MEMORY.md
  if [[ -f "${OPENCLAW_DIR}/workspace/MEMORY.md" ]]; then
    echo "" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
    echo "<!-- Migrado de NanoClaw groups/main/CLAUDE.md ($(date +%Y-%m-%d)) -->" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
    echo "" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
    cat "${MAIN_MD}" >> "${OPENCLAW_DIR}/workspace/MEMORY.md"
  else
    cp "${MAIN_MD}" "${OPENCLAW_DIR}/workspace/MEMORY.md"
  fi
  ok "Main CLAUDE.md -> MEMORY.md"
fi

# --- 3.2 Migrar offices/ ----------------------------------------------------
log "=== Migrando offices ==="

if [[ -d "${EXPORT_DIR}/offices" ]]; then
  # Offices sao uma customizacao NanoClaw; copiar para workspace/offices/
  mkdir -p "${OPENCLAW_DIR}/workspace/offices"
  for office in marketing development innovation shared _template; do
    if [[ -d "${EXPORT_DIR}/offices/${office}" ]]; then
      cp -r "${EXPORT_DIR}/offices/${office}" "${OPENCLAW_DIR}/workspace/offices/"
      ok "Office copiado: ${office}"
    fi
  done

  if [[ -d "${EXPORT_DIR}/offices/docs" ]]; then
    cp -r "${EXPORT_DIR}/offices/docs" "${OPENCLAW_DIR}/workspace/offices/"
    ok "Docs de offices copiados"
  fi
else
  warn "Offices nao encontrados no pacote de exportacao"
fi

# --- 3.3 Migrar skills (container e claude) ----------------------------------
log "=== Migrando skills ==="

# Container skills -> workspace/skills/
if [[ -d "${EXPORT_DIR}/container-skills" ]]; then
  for skill_dir in "${EXPORT_DIR}"/container-skills/*/; do
    [[ -d "${skill_dir}" ]] || continue
    skill_name=$(basename "${skill_dir}")
    cp -r "${skill_dir}" "${OPENCLAW_DIR}/workspace/skills/${skill_name}"
    log "  Container skill: ${skill_name}"
  done
  ok "Container skills migrados para workspace/skills/"
fi

# Claude skills -> skills/ (shared)
if [[ -d "${EXPORT_DIR}/claude-skills" ]]; then
  mkdir -p "${OPENCLAW_DIR}/skills"
  for skill_dir in "${EXPORT_DIR}"/claude-skills/*/; do
    [[ -d "${skill_dir}" ]] || continue
    skill_name=$(basename "${skill_dir}")
    cp -r "${skill_dir}" "${OPENCLAW_DIR}/skills/${skill_name}"
    log "  Claude skill: ${skill_name}"
  done
  SKILL_COUNT=$(ls -d "${OPENCLAW_DIR}"/skills/*/ 2>/dev/null | wc -l || echo "0")
  ok "Claude skills migrados: ${SKILL_COUNT}"
fi

# --- 3.4 Migrar container config --------------------------------------------
log "=== Copiando configuracao de container ==="

if [[ -d "${EXPORT_DIR}/container-config" ]]; then
  # Container Dockerfile e build.sh sao uteis para reconstruir
  mkdir -p "${OPENCLAW_DIR}/workspace/container"
  cp -r "${EXPORT_DIR}/container-config/"* "${OPENCLAW_DIR}/workspace/container/" 2>/dev/null || true
  ok "Config de container copiada para workspace/container/"
fi

# --- 3.5 Migrar source patches (referencia) ----------------------------------
log "=== Salvando patches de referencia ==="

if [[ -d "${EXPORT_DIR}/source-patches" ]]; then
  mkdir -p "${OPENCLAW_DIR}/workspace/.migration-ref"
  cp -r "${EXPORT_DIR}/source-patches/"* "${OPENCLAW_DIR}/workspace/.migration-ref/" 2>/dev/null || true
  ok "Patches de referencia salvos em workspace/.migration-ref/"
  warn "Os patches sao apenas referencia - o codigo fonte do NanoClaw e OpenClaw diferem significativamente"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DE ESTRUTURA CONCLUIDA${NC}"
echo "  State dir: ${OPENCLAW_DIR}"
echo "============================================================"
log "Fim: $(date)"
