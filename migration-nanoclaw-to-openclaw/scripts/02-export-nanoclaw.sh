#!/usr/bin/env bash
# ============================================================================
# Fase 2: Exportacao de Dados do NanoClaw
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

NANOCLAW_DIR="${NANOCLAW_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
EXPORT_DIR="${SCRIPT_DIR}/../export-$(date +%Y%m%d_%H%M%S)"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/02-export-$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}" "${EXPORT_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }

echo ""
echo "============================================================"
echo "  Fase 2: Exportacao de Dados do NanoClaw"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "Origem: ${NANOCLAW_DIR}"
log "Exportando para: ${EXPORT_DIR}"

# --- 2.1 Exportar banco de dados --------------------------------------------
log "=== Exportando banco de dados ==="
mkdir -p "${EXPORT_DIR}/database"

DB_PATH=""
for candidate in "${NANOCLAW_DIR}/store/nanoclaw.db" "${NANOCLAW_DIR}/store/data.db"; do
  if [[ -f "${candidate}" ]]; then
    DB_PATH="${candidate}"
    break
  fi
done

if [[ -n "${DB_PATH}" ]]; then
  # Copia binaria
  cp "${DB_PATH}" "${EXPORT_DIR}/database/nanoclaw.db"
  ok "Banco copiado: $(du -h "${DB_PATH}" | cut -f1)"

  # Dump SQL completo
  sqlite3 "${DB_PATH}" .dump > "${EXPORT_DIR}/database/full-dump.sql" 2>/dev/null || true
  ok "Dump SQL gerado"

  # Schema
  sqlite3 "${DB_PATH}" ".schema" > "${EXPORT_DIR}/database/schema.sql" 2>/dev/null || true
  ok "Schema exportado"

  # Exportar tabelas individuais em CSV
  TABLES=$(sqlite3 "${DB_PATH}" ".tables" 2>/dev/null || echo "")
  for tbl in ${TABLES}; do
    sqlite3 -header -csv "${DB_PATH}" "SELECT * FROM ${tbl};" > "${EXPORT_DIR}/database/${tbl}.csv" 2>/dev/null || true
  done
  ok "Tabelas exportadas em CSV: ${TABLES}"

  # Contagem de registros
  echo "=== Contagem de registros ===" > "${EXPORT_DIR}/database/stats.txt"
  for tbl in ${TABLES}; do
    COUNT=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null || echo "?")
    echo "${tbl}: ${COUNT}" >> "${EXPORT_DIR}/database/stats.txt"
  done
  ok "Estatisticas geradas"
else
  warn "Banco de dados nao encontrado"
fi

# --- 2.2 Exportar offices ---------------------------------------------------
log "=== Exportando offices ==="
if [[ -d "${NANOCLAW_DIR}/offices" ]]; then
  mkdir -p "${EXPORT_DIR}/offices"
  cp -r "${NANOCLAW_DIR}/offices/" "${EXPORT_DIR}/offices/"
  OFFICE_SIZE=$(du -sh "${EXPORT_DIR}/offices" | cut -f1)
  ok "Offices exportados (${OFFICE_SIZE})"

  # Listar agentes por office
  echo "=== Agentes por Office ===" > "${EXPORT_DIR}/offices/inventory.txt"
  for office_dir in "${NANOCLAW_DIR}"/offices/*/agents; do
    [[ -d "${office_dir}" ]] || continue
    office_name=$(basename "$(dirname "${office_dir}")")
    agent_count=$(ls -d "${office_dir}"/*/ 2>/dev/null | wc -l || echo "0")
    echo "${office_name}: ${agent_count} agentes" >> "${EXPORT_DIR}/offices/inventory.txt"
    ls -1 "${office_dir}" 2>/dev/null >> "${EXPORT_DIR}/offices/inventory.txt"
    echo "" >> "${EXPORT_DIR}/offices/inventory.txt"
  done
else
  warn "Diretorio offices/ nao encontrado"
fi

# --- 2.3 Exportar grupos ----------------------------------------------------
log "=== Exportando grupos ==="
if [[ -d "${NANOCLAW_DIR}/groups" ]]; then
  mkdir -p "${EXPORT_DIR}/groups"
  cp -r "${NANOCLAW_DIR}/groups/" "${EXPORT_DIR}/groups/"
  ok "Grupos exportados: $(ls -d "${EXPORT_DIR}"/groups/*/ 2>/dev/null | wc -l) diretorios"
else
  warn "Diretorio groups/ nao encontrado"
fi

# --- 2.4 Exportar container skills ------------------------------------------
log "=== Exportando container skills ==="
if [[ -d "${NANOCLAW_DIR}/container/skills" ]]; then
  mkdir -p "${EXPORT_DIR}/container-skills"
  cp -r "${NANOCLAW_DIR}/container/skills/" "${EXPORT_DIR}/container-skills/"
  ok "Container skills exportados"
fi

# --- 2.5 Exportar .claude/skills --------------------------------------------
log "=== Exportando Claude skills ==="
if [[ -d "${NANOCLAW_DIR}/.claude/skills" ]]; then
  mkdir -p "${EXPORT_DIR}/claude-skills"
  cp -r "${NANOCLAW_DIR}/.claude/skills/" "${EXPORT_DIR}/claude-skills/"
  SKILL_COUNT=$(ls -d "${EXPORT_DIR}"/claude-skills/*/ 2>/dev/null | wc -l || echo "0")
  ok "Claude skills exportados: ${SKILL_COUNT}"
fi

# --- 2.6 Exportar configuracoes ---------------------------------------------
log "=== Exportando configuracoes ==="
mkdir -p "${EXPORT_DIR}/config"

# .env (sem segredos)
if [[ -f "${NANOCLAW_DIR}/.env" ]]; then
  # Mascarar valores sensiveis
  sed -E 's/(KEY|TOKEN|SECRET|PASSWORD|OAUTH)=(.{4}).*(.{4})$/\1=\2****\3/g' \
    "${NANOCLAW_DIR}/.env" > "${EXPORT_DIR}/config/env-masked.txt"
  # Apenas nomes de variaveis
  grep -E '^[A-Z_]+=' "${NANOCLAW_DIR}/.env" | cut -d= -f1 > "${EXPORT_DIR}/config/env-keys.txt"
  ok "Variaveis de ambiente exportadas (mascaradas)"
fi

# package.json
cp "${NANOCLAW_DIR}/package.json" "${EXPORT_DIR}/config/" 2>/dev/null || true

# tsconfig
cp "${NANOCLAW_DIR}/tsconfig.json" "${EXPORT_DIR}/config/" 2>/dev/null || true

# Security configs
for f in mount-allowlist.json sender-allowlist.json; do
  if [[ -f "${HOME}/.config/nanoclaw/${f}" ]]; then
    cp "${HOME}/.config/nanoclaw/${f}" "${EXPORT_DIR}/config/"
    ok "Copiado: ${f}"
  fi
done

# --- 2.7 Exportar codigo customizado ----------------------------------------
log "=== Exportando customizacoes de codigo ==="
mkdir -p "${EXPORT_DIR}/source-patches"

cd "${NANOCLAW_DIR}"
if git rev-parse --git-dir > /dev/null 2>&1; then
  # Encontrar ponto de divergencia do upstream
  UPSTREAM_REMOTE=$(git remote | grep -E '^(upstream|origin)' | head -1 || echo "origin")
  MAIN_BRANCH=$(git symbolic-ref refs/remotes/${UPSTREAM_REMOTE}/HEAD 2>/dev/null | sed 's|refs/remotes/.*/||' || echo "main")

  # Gerar patch completo
  MERGE_BASE=$(git merge-base "${UPSTREAM_REMOTE}/${MAIN_BRANCH}" HEAD 2>/dev/null || echo "")
  if [[ -n "${MERGE_BASE}" ]]; then
    git diff "${MERGE_BASE}" HEAD > "${EXPORT_DIR}/source-patches/all-changes.patch" 2>/dev/null || true
    git log --oneline "${MERGE_BASE}..HEAD" > "${EXPORT_DIR}/source-patches/commit-log.txt" 2>/dev/null || true
    PATCH_SIZE=$(wc -l < "${EXPORT_DIR}/source-patches/all-changes.patch" || echo "0")
    ok "Patch gerado: ${PATCH_SIZE} linhas"
  else
    # Fallback: exportar diff dos ultimos 100 commits
    git diff HEAD~100..HEAD > "${EXPORT_DIR}/source-patches/recent-changes.patch" 2>/dev/null || true
    warn "Nao foi possivel encontrar merge-base; exportando ultimas 100 alteracoes"
  fi

  # Lista de arquivos modificados
  git diff --name-only "${MERGE_BASE:-HEAD~100}" HEAD > "${EXPORT_DIR}/source-patches/modified-files.txt" 2>/dev/null || true

  # Copiar src/ customizado completo
  cp -r "${NANOCLAW_DIR}/src" "${EXPORT_DIR}/source-patches/src-full/" 2>/dev/null || true
  ok "Codigo-fonte completo copiado"
else
  # Sem git: copiar tudo
  cp -r "${NANOCLAW_DIR}/src" "${EXPORT_DIR}/source-patches/src-full/" 2>/dev/null || true
  warn "Repositorio git nao encontrado; codigo-fonte copiado integralmente"
fi

# --- 2.8 Exportar container config ------------------------------------------
log "=== Exportando configuracao de container ==="
mkdir -p "${EXPORT_DIR}/container-config"
cp "${NANOCLAW_DIR}/container/Dockerfile" "${EXPORT_DIR}/container-config/" 2>/dev/null || true
cp "${NANOCLAW_DIR}/container/build.sh" "${EXPORT_DIR}/container-config/" 2>/dev/null || true
cp -r "${NANOCLAW_DIR}/container/agent-runner" "${EXPORT_DIR}/container-config/agent-runner" 2>/dev/null || true
ok "Configuracao de container exportada"

# --- 2.9 Gerar manifesto com checksums --------------------------------------
log "=== Gerando manifesto ==="
cd "${EXPORT_DIR}"
find . -type f -exec sha256sum {} \; > MANIFEST.sha256
ok "Manifesto gerado com $(wc -l < MANIFEST.sha256) arquivos"

# --- 2.10 Comprimir pacote --------------------------------------------------
log "=== Comprimindo pacote de exportacao ==="
ARCHIVE_NAME="nanoclaw-export-$(date +%Y%m%d_%H%M%S).tar.gz"
cd "${SCRIPT_DIR}/.."
tar czf "${ARCHIVE_NAME}" -C "$(dirname "${EXPORT_DIR}")" "$(basename "${EXPORT_DIR}")"
ARCHIVE_SIZE=$(du -h "${ARCHIVE_NAME}" | cut -f1)
ok "Arquivo criado: ${ARCHIVE_NAME} (${ARCHIVE_SIZE})"

echo ""
echo "============================================================"
echo -e "${GREEN}  EXPORTACAO CONCLUIDA${NC}"
echo "  Pacote: $(pwd)/${ARCHIVE_NAME}"
echo "  Diretorio: ${EXPORT_DIR}"
echo "============================================================"
log "Fim: $(date)"

# Salvar caminho para proximos scripts
echo "EXPORT_DIR=${EXPORT_DIR}" > "${SCRIPT_DIR}/.last-export"
echo "EXPORT_ARCHIVE=$(pwd)/${ARCHIVE_NAME}" >> "${SCRIPT_DIR}/.last-export"
