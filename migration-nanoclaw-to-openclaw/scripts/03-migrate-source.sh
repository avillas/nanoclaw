#!/usr/bin/env bash
# ============================================================================
# Fase 3: Migracao de Codigo-Fonte Customizado
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/03-migrate-source-$(date +%Y%m%d_%H%M%S).log"
MIGRATION_BRANCH="migration/nanoclaw-customs-$(date +%Y%m%d)"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }
die()  { fail "$*"; exit 1; }

echo ""
echo "============================================================"
echo "  Fase 3: Migracao de Codigo-Fonte"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "OpenClaw: ${OPENCLAW_DIR}"
log "Exportacao: ${EXPORT_DIR}"

# --- 3.1 Preparar branch de migracao ----------------------------------------
log "=== Criando branch de migracao ==="
cd "${OPENCLAW_DIR}"

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  die "OpenClaw nao e um repositorio git"
fi

# Salvar estado atual
CURRENT_BRANCH=$(git branch --show-current)
git stash push -m "pre-migration-$(date +%Y%m%d)" 2>/dev/null || true

# Criar branch
git checkout -b "${MIGRATION_BRANCH}" 2>/dev/null || git checkout "${MIGRATION_BRANCH}"
ok "Branch criada: ${MIGRATION_BRANCH}"

# --- 3.2 Copiar offices/ ----------------------------------------------------
log "=== Migrando offices/ ==="

if [[ -d "${EXPORT_DIR}/offices" ]]; then
  # Copiar offices (exceto dashboard por enquanto, vai na fase 7)
  for office in marketing development innovation shared _template; do
    if [[ -d "${EXPORT_DIR}/offices/${office}" ]]; then
      mkdir -p "${OPENCLAW_DIR}/offices/${office}"
      cp -r "${EXPORT_DIR}/offices/${office}/" "${OPENCLAW_DIR}/offices/${office}/"
      ok "Office copiado: ${office}"
    fi
  done

  # Copiar docs
  if [[ -d "${EXPORT_DIR}/offices/docs" ]]; then
    mkdir -p "${OPENCLAW_DIR}/offices/docs"
    cp -r "${EXPORT_DIR}/offices/docs/" "${OPENCLAW_DIR}/offices/docs/"
    ok "Documentacao de offices copiada"
  fi
else
  warn "Offices nao encontrados no pacote de exportacao"
fi

# --- 3.3 Copiar container skills --------------------------------------------
log "=== Migrando container skills ==="

if [[ -d "${EXPORT_DIR}/container-skills" ]]; then
  mkdir -p "${OPENCLAW_DIR}/container/skills"
  cp -r "${EXPORT_DIR}/container-skills/" "${OPENCLAW_DIR}/container/skills/"
  ok "Container skills copiados"
fi

# --- 3.4 Copiar Claude skills -----------------------------------------------
log "=== Migrando Claude skills ==="

if [[ -d "${EXPORT_DIR}/claude-skills" ]]; then
  mkdir -p "${OPENCLAW_DIR}/.claude/skills"
  cp -r "${EXPORT_DIR}/claude-skills/" "${OPENCLAW_DIR}/.claude/skills/"
  SKILL_COUNT=$(ls -d "${OPENCLAW_DIR}"/.claude/skills/*/ 2>/dev/null | wc -l || echo "0")
  ok "Claude skills copiados: ${SKILL_COUNT}"
fi

# --- 3.5 Aplicar patches de codigo ------------------------------------------
log "=== Aplicando customizacoes de codigo ==="

PATCH_FILE="${EXPORT_DIR}/source-patches/all-changes.patch"
if [[ ! -f "${PATCH_FILE}" ]]; then
  PATCH_FILE="${EXPORT_DIR}/source-patches/recent-changes.patch"
fi

CONFLICTS=0
if [[ -f "${PATCH_FILE}" ]] && [[ -s "${PATCH_FILE}" ]]; then
  # Tentar aplicar patch com 3-way merge
  if git apply --3way --stat "${PATCH_FILE}" >> "${LOG_FILE}" 2>&1; then
    ok "Patches aplicados com sucesso"
  elif git apply --3way --reject "${PATCH_FILE}" >> "${LOG_FILE}" 2>&1; then
    warn "Patches aplicados com rejects - verificar arquivos .rej"
    CONFLICTS=$(find "${OPENCLAW_DIR}" -name "*.rej" 2>/dev/null | wc -l)
    warn "Conflitos: ${CONFLICTS} arquivo(s) .rej"
  else
    warn "Patches nao aplicaveis via git apply; copiando src/ completo"
    # Fallback: copiar src/ inteiro
    if [[ -d "${EXPORT_DIR}/source-patches/src-full" ]]; then
      cp -r "${EXPORT_DIR}/source-patches/src-full/" "${OPENCLAW_DIR}/src/"
      ok "Codigo-fonte copiado integralmente (fallback)"
    fi
  fi
else
  # Sem patch: copiar src/ inteiro
  if [[ -d "${EXPORT_DIR}/source-patches/src-full" ]]; then
    log "Nenhum patch disponivel; copiando src/ completo"
    cp -r "${EXPORT_DIR}/source-patches/src-full/" "${OPENCLAW_DIR}/src/"
    ok "Codigo-fonte copiado integralmente"
  fi
fi

# --- 3.6 Atualizar dependencias ----------------------------------------------
log "=== Atualizando dependencias ==="

if [[ -f "${EXPORT_DIR}/config/package.json" ]]; then
  # Extrair dependencias adicionais do NanoClaw
  node -e "
    const nano = require('${EXPORT_DIR}/config/package.json');
    const oc = require('${OPENCLAW_DIR}/package.json');
    const newDeps = {};
    const nanoDeps = { ...nano.dependencies };
    const ocDeps = { ...oc.dependencies };

    for (const [k, v] of Object.entries(nanoDeps)) {
      if (!ocDeps[k]) {
        newDeps[k] = v;
      }
    }

    if (Object.keys(newDeps).length > 0) {
      console.log('Dependencias adicionais necessarias:');
      for (const [k, v] of Object.entries(newDeps)) {
        console.log('  ' + k + ': ' + v);
      }

      // Merge
      oc.dependencies = { ...ocDeps, ...newDeps };
      require('fs').writeFileSync('${OPENCLAW_DIR}/package.json', JSON.stringify(oc, null, 2) + '\n');
      console.log('package.json atualizado');
    } else {
      console.log('Sem dependencias adicionais');
    }
  " >> "${LOG_FILE}" 2>&1 || warn "Falha ao mesclar dependencias"

  # Instalar
  cd "${OPENCLAW_DIR}"
  npm install >> "${LOG_FILE}" 2>&1
  ok "Dependencias instaladas"
fi

# --- 3.7 Copiar container config --------------------------------------------
log "=== Atualizando configuracao de container ==="

if [[ -d "${EXPORT_DIR}/container-config" ]]; then
  cp "${EXPORT_DIR}/container-config/Dockerfile" "${OPENCLAW_DIR}/container/Dockerfile" 2>/dev/null || true
  cp "${EXPORT_DIR}/container-config/build.sh" "${OPENCLAW_DIR}/container/build.sh" 2>/dev/null || true
  if [[ -d "${EXPORT_DIR}/container-config/agent-runner" ]]; then
    cp -r "${EXPORT_DIR}/container-config/agent-runner/" "${OPENCLAW_DIR}/container/agent-runner/"
  fi
  ok "Configuracao de container atualizada"
fi

# --- 3.8 Compilar TypeScript ------------------------------------------------
log "=== Compilando TypeScript ==="

cd "${OPENCLAW_DIR}"
if npm run build >> "${LOG_FILE}" 2>&1; then
  ok "Build concluido com sucesso"
else
  warn "Build falhou - verifique o log: ${LOG_FILE}"
  warn "Pode ser necessario resolver conflitos manualmente"
fi

# --- 3.9 Commit -------------------------------------------------------------
log "=== Commitando alteracoes ==="

cd "${OPENCLAW_DIR}"
git add -A >> "${LOG_FILE}" 2>&1
git commit -m "feat: migrar customizacoes do NanoClaw

Inclui:
- Sistema multi-office (marketing, development, innovation)
- Container skills customizados
- Claude skills (33+)
- Customizacoes de codigo (pt-BR, retry 529, cost tracking)
- Configuracao de container

Migration-Source: NanoClaw v$(node -e "console.log(require('${EXPORT_DIR}/config/package.json').version)" 2>/dev/null || echo 'unknown')
Migration-Date: $(date -Iseconds)" >> "${LOG_FILE}" 2>&1 || warn "Nada para commitar"

ok "Alteracoes commitadas"

echo ""
echo "============================================================"
if [[ ${CONFLICTS} -eq 0 ]]; then
  echo -e "${GREEN}  MIGRACAO DE CODIGO CONCLUIDA${NC}"
else
  echo -e "${YELLOW}  MIGRACAO DE CODIGO CONCLUIDA COM ${CONFLICTS} CONFLITO(S)${NC}"
  echo "  Verifique arquivos .rej em ${OPENCLAW_DIR}"
fi
echo "  Branch: ${MIGRATION_BRANCH}"
echo "============================================================"
log "Fim: $(date)"
