#!/usr/bin/env bash
# ============================================================================
# Executor Sequencial de Todas as Fases de Migracao
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

echo ""
echo "============================================================"
echo "  Migracao Completa: NanoClaw -> OpenClaw"
echo "  Inicio: $(date)"
echo "============================================================"
echo ""

# Verificar config.env
if [[ ! -f "${SCRIPT_DIR}/config.env" ]]; then
  echo -e "${RED}ERRO: config.env nao encontrado${NC}"
  echo "Copie e edite o template: cp config.env.example config.env"
  exit 1
fi

echo -e "${YELLOW}ATENCAO: Este script executara todas as 8 fases da migracao.${NC}"
echo "Certifique-se de ter editado config.env com os valores corretos."
echo ""
read -p "Deseja continuar? (s/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  echo "Abortado."
  exit 0
fi

SCRIPTS=(
  "00-install-openclaw.sh"
  "01-validate-environment.sh"
  "02-export-nanoclaw.sh"
  "03-migrate-source.sh"
  "04-migrate-database.sh"
  "05-migrate-channels.sh"
  "06-migrate-groups.sh"
  "07-migrate-dashboard.sh"
  "08-validate-and-golive.sh"
)

TOTAL=${#SCRIPTS[@]}
CURRENT=0
FAILED=()

for script in "${SCRIPTS[@]}"; do
  ((CURRENT++))
  echo ""
  echo -e "${BLUE}━━━ [${CURRENT}/${TOTAL}] ${script} ━━━${NC}"
  echo ""

  if [[ ! -f "${SCRIPT_DIR}/${script}" ]]; then
    echo -e "${RED}Script nao encontrado: ${script}${NC}"
    FAILED+=("${script}")
    continue
  fi

  chmod +x "${SCRIPT_DIR}/${script}"

  if bash "${SCRIPT_DIR}/${script}"; then
    echo -e "${GREEN}[${CURRENT}/${TOTAL}] ${script} - CONCLUIDO${NC}"
  else
    EXIT_CODE=$?
    echo -e "${RED}[${CURRENT}/${TOTAL}] ${script} - FALHOU (exit ${EXIT_CODE})${NC}"
    FAILED+=("${script}")

    echo ""
    echo -e "${YELLOW}Deseja continuar com os proximos scripts? (s/N)${NC}"
    read -p "" -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
      echo "Migracao interrompida na fase ${CURRENT}."
      echo "Para retomar, execute os scripts restantes manualmente."
      exit 1
    fi
  fi
done

echo ""
echo "============================================================"
echo "  Migracao Completa"
echo "  Fim: $(date)"
echo "============================================================"
echo ""

if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo -e "${GREEN}Todas as ${TOTAL} fases concluidas com sucesso!${NC}"
else
  echo -e "${YELLOW}Fases com problemas (${#FAILED[@]}):${NC}"
  for f in "${FAILED[@]}"; do
    echo -e "  ${RED}✗${NC} ${f}"
  done
  echo ""
  echo "Verifique os logs em: ${SCRIPT_DIR}/../logs/"
fi
