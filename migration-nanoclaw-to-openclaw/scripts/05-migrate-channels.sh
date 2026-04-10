#!/usr/bin/env bash
# ============================================================================
# Fase 5: Migracao de Canais e Credenciais
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
NANOCLAW_DIR="${NANOCLAW_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/05-migrate-channels-$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }
info() { echo -e "${YELLOW}[ACAO REQUERIDA]${NC} $*" | tee -a "${LOG_FILE}"; }

echo ""
echo "============================================================"
echo "  Fase 5: Migracao de Canais e Credenciais"
echo "============================================================"
echo ""
log "Inicio: $(date)"

CHANNELS_STATUS=()

# --- 5.1 Preparar .env do OpenClaw ------------------------------------------
log "=== Preparando arquivo .env ==="

OC_ENV="${OPENCLAW_DIR}/.env"
if [[ ! -f "${OC_ENV}" ]]; then
  touch "${OC_ENV}"
fi

# Ler variaveis existentes no NanoClaw
NANO_ENV="${NANOCLAW_DIR}/.env"
if [[ -f "${NANO_ENV}" ]]; then
  log "Variaveis do NanoClaw detectadas:"
  grep -E '^[A-Z_]+=' "${NANO_ENV}" | cut -d= -f1 | while read -r key; do
    log "  ${key}"
  done
fi

# Funcao para adicionar variavel ao .env sem duplicar
add_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "${OC_ENV}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${OC_ENV}"
  else
    echo "${key}=${value}" >> "${OC_ENV}"
  fi
}

# --- 5.2 Migrar configuracoes gerais ----------------------------------------
log "=== Migrando configuracoes gerais ==="

if [[ -f "${NANO_ENV}" ]]; then
  # Copiar configs nao-sensiveis
  for key in ASSISTANT_NAME TZ CONTAINER_IMAGE CONTAINER_TIMEOUT MAX_CONCURRENT_CONTAINERS IDLE_TIMEOUT; do
    value=$(grep "^${key}=" "${NANO_ENV}" 2>/dev/null | cut -d= -f2- || echo "")
    if [[ -n "${value}" ]]; then
      add_env "${key}" "${value}"
      ok "Migrado: ${key}=${value}"
    fi
  done
fi

echo ""

# --- 5.3 Canal: Telegram ----------------------------------------------------
log "=== Canal: Telegram ==="

TELEGRAM_TOKEN=""
if [[ -f "${NANO_ENV}" ]]; then
  TELEGRAM_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "${NANO_ENV}" 2>/dev/null | cut -d= -f2- || echo "")
fi

if [[ -n "${TELEGRAM_TOKEN}" ]]; then
  add_env "TELEGRAM_BOT_TOKEN" "${TELEGRAM_TOKEN}"
  ok "Token Telegram migrado"
  CHANNELS_STATUS+=("Telegram: OK (token migrado)")
else
  # Verificar OneCLI
  if command -v onecli &>/dev/null; then
    TELEGRAM_TOKEN=$(onecli get TELEGRAM_BOT_TOKEN 2>/dev/null || echo "")
    if [[ -n "${TELEGRAM_TOKEN}" ]]; then
      add_env "TELEGRAM_BOT_TOKEN" "${TELEGRAM_TOKEN}"
      ok "Token Telegram obtido via OneCLI"
      CHANNELS_STATUS+=("Telegram: OK (via OneCLI)")
    fi
  fi

  if [[ -z "${TELEGRAM_TOKEN}" ]]; then
    info "TELEGRAM_BOT_TOKEN nao encontrado. Configure manualmente:"
    info "  1. Fale com @BotFather no Telegram"
    info "  2. Use /token para obter o token do seu bot"
    info "  3. Adicione ao .env: TELEGRAM_BOT_TOKEN=seu_token"
    CHANNELS_STATUS+=("Telegram: PENDENTE (configurar token)")
  fi
fi

# Verificar skill instalada
if [[ -d "${OPENCLAW_DIR}/.claude/skills/add-telegram" ]] || [[ -f "${OPENCLAW_DIR}/src/channels/telegram.ts" ]]; then
  ok "Skill Telegram presente"
else
  warn "Skill Telegram pode precisar ser instalada. Execute /add-telegram no OpenClaw"
  CHANNELS_STATUS+=("Telegram: skill precisa ser instalada")
fi

echo ""

# --- 5.4 Canal: WhatsApp ----------------------------------------------------
log "=== Canal: WhatsApp ==="

# WhatsApp usa auth state local (baileys) - nao e transferivel de forma confiavel
if [[ -d "${NANOCLAW_DIR}/store/whatsapp-auth" ]] || [[ -d "${NANOCLAW_DIR}/auth_info_baileys" ]]; then
  warn "Auth state do WhatsApp encontrado, mas sessoes baileys frequentemente expiram na transferencia"
  info "Recomendacao: Reautenticar o WhatsApp no OpenClaw"
  info "  1. Certifique-se que /add-whatsapp esta instalado no OpenClaw"
  info "  2. Inicie o OpenClaw e escaneie o QR code novamente"
  CHANNELS_STATUS+=("WhatsApp: REAUTENTICACAO NECESSARIA")
else
  info "WhatsApp: Nenhum auth state encontrado"
  info "  Configure via /add-whatsapp no OpenClaw"
  CHANNELS_STATUS+=("WhatsApp: CONFIGURAR DO ZERO")
fi

echo ""

# --- 5.5 Canal: Slack -------------------------------------------------------
log "=== Canal: Slack ==="

SLACK_VARS=("SLACK_BOT_TOKEN" "SLACK_APP_TOKEN" "SLACK_SIGNING_SECRET")
SLACK_OK=true

for var in "${SLACK_VARS[@]}"; do
  value=""
  if [[ -f "${NANO_ENV}" ]]; then
    value=$(grep "^${var}=" "${NANO_ENV}" 2>/dev/null | cut -d= -f2- || echo "")
  fi
  if [[ -z "${value}" ]] && command -v onecli &>/dev/null; then
    value=$(onecli get "${var}" 2>/dev/null || echo "")
  fi

  if [[ -n "${value}" ]]; then
    add_env "${var}" "${value}"
    ok "Migrado: ${var}"
  else
    warn "${var} nao encontrado"
    SLACK_OK=false
  fi
done

if [[ "${SLACK_OK}" == "true" ]]; then
  CHANNELS_STATUS+=("Slack: OK (credenciais migradas)")
else
  info "Slack: Algumas credenciais faltando. Configure em https://api.slack.com/apps"
  CHANNELS_STATUS+=("Slack: PARCIAL (verificar credenciais)")
fi

echo ""

# --- 5.6 Canal: Discord -----------------------------------------------------
log "=== Canal: Discord ==="

DISCORD_TOKEN=""
if [[ -f "${NANO_ENV}" ]]; then
  DISCORD_TOKEN=$(grep "^DISCORD_BOT_TOKEN=" "${NANO_ENV}" 2>/dev/null | cut -d= -f2- || echo "")
fi
if [[ -z "${DISCORD_TOKEN}" ]] && command -v onecli &>/dev/null; then
  DISCORD_TOKEN=$(onecli get DISCORD_BOT_TOKEN 2>/dev/null || echo "")
fi

if [[ -n "${DISCORD_TOKEN}" ]]; then
  add_env "DISCORD_BOT_TOKEN" "${DISCORD_TOKEN}"
  ok "Token Discord migrado"
  CHANNELS_STATUS+=("Discord: OK (token migrado)")
else
  info "DISCORD_BOT_TOKEN nao encontrado. Configure em https://discord.com/developers/applications"
  CHANNELS_STATUS+=("Discord: PENDENTE (configurar token)")
fi

echo ""

# --- 5.7 Canal: Gmail -------------------------------------------------------
log "=== Canal: Gmail ==="

GMAIL_VARS=("GMAIL_CLIENT_ID" "GMAIL_CLIENT_SECRET" "GMAIL_REFRESH_TOKEN")
GMAIL_OK=true

for var in "${GMAIL_VARS[@]}"; do
  value=""
  if [[ -f "${NANO_ENV}" ]]; then
    value=$(grep "^${var}=" "${NANO_ENV}" 2>/dev/null | cut -d= -f2- || echo "")
  fi
  if [[ -z "${value}" ]] && command -v onecli &>/dev/null; then
    value=$(onecli get "${var}" 2>/dev/null || echo "")
  fi

  if [[ -n "${value}" ]]; then
    add_env "${var}" "${value}"
    ok "Migrado: ${var}"
  else
    warn "${var} nao encontrado"
    GMAIL_OK=false
  fi
done

if [[ "${GMAIL_OK}" == "true" ]]; then
  CHANNELS_STATUS+=("Gmail: OK (credenciais migradas)")
else
  info "Gmail: Credenciais OAuth faltando. Reconfigure via Google Cloud Console"
  CHANNELS_STATUS+=("Gmail: PARCIAL (reconfiguracao necessaria)")
fi

echo ""

# --- 5.8 Migrar security configs --------------------------------------------
log "=== Migrando configuracoes de seguranca ==="

OC_CONFIG_DIR="${HOME}/.config/openclaw"
mkdir -p "${OC_CONFIG_DIR}"

for f in mount-allowlist.json sender-allowlist.json; do
  NANO_FILE="${HOME}/.config/nanoclaw/${f}"
  OC_FILE="${OC_CONFIG_DIR}/${f}"

  if [[ -f "${EXPORT_DIR}/config/${f}" ]]; then
    cp "${EXPORT_DIR}/config/${f}" "${OC_FILE}"
    ok "Copiado: ${f}"
  elif [[ -f "${NANO_FILE}" ]]; then
    cp "${NANO_FILE}" "${OC_FILE}"
    ok "Copiado de ~/.config/nanoclaw/: ${f}"
  else
    log "${f} nao encontrado"
  fi
done

echo ""

# --- 5.9 OneCLI ---------------------------------------------------------------
log "=== Verificando OneCLI ==="

if [[ -f "${NANO_ENV}" ]]; then
  ONECLI_URL=$(grep "^ONECLI_URL=" "${NANO_ENV}" 2>/dev/null | cut -d= -f2- || echo "")
  if [[ -n "${ONECLI_URL}" ]]; then
    add_env "ONECLI_URL" "${ONECLI_URL}"
    ok "OneCLI URL migrado: ${ONECLI_URL}"
  fi
fi

if command -v onecli &>/dev/null; then
  ok "OneCLI esta disponivel no destino"
else
  warn "OneCLI nao encontrado. Execute /init-onecli no OpenClaw se necessario"
fi

echo ""

# --- Resumo ------------------------------------------------------------------
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DE CANAIS CONCLUIDA${NC}"
echo "============================================================"
echo ""
echo "Status dos canais:"
for status in "${CHANNELS_STATUS[@]}"; do
  if [[ "${status}" == *"OK"* ]]; then
    echo -e "  ${GREEN}✓${NC} ${status}"
  elif [[ "${status}" == *"PARCIAL"* ]]; then
    echo -e "  ${YELLOW}△${NC} ${status}"
  else
    echo -e "  ${RED}✗${NC} ${status}"
  fi
done
echo ""
echo "Acoes pendentes foram registradas no log: ${LOG_FILE}"
log "Fim: $(date)"
