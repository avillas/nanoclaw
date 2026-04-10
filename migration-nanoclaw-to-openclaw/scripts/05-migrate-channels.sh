#!/usr/bin/env bash
# ============================================================================
# Fase 5: Migracao de Canais e Credenciais
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# OpenClaw configura canais em openclaw.json:
#   { "channels": { "telegram": { "botToken": "..." }, ... } }
#
# Credenciais podem ser:
#   - String literal: "sk-xxx"
#   - Referencia env: "${TELEGRAM_BOT_TOKEN}"
#   - SecretRef: { "source": "env", "id": "TELEGRAM_BOT_TOKEN" }
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
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

# --- Localizar .env do NanoClaw ----------------------------------------------
NANO_ENV="${NANOCLAW_DIR}/.env"
if [[ -f "${EXPORT_DIR}/config/.env" ]]; then
  NANO_ENV="${EXPORT_DIR}/config/.env"
fi

# Funcao para ler variavel do .env NanoClaw
get_nano_var() {
  local key="$1"
  local value=""
  if [[ -f "${NANO_ENV}" ]]; then
    value=$(grep "^${key}=" "${NANO_ENV}" 2>/dev/null | head -1 | cut -d= -f2- || echo "")
  fi
  # Tentar OneCLI
  if [[ -z "${value}" ]] && command -v onecli &>/dev/null; then
    value=$(onecli get "${key}" 2>/dev/null || echo "")
  fi
  echo "${value}"
}

# --- Localizar config do OpenClaw --------------------------------------------
OC_CONFIG="${OPENCLAW_DIR}/openclaw.json"
if [[ ! -f "${OC_CONFIG}" ]]; then
  OC_CONFIG="${OPENCLAW_DIR}/clawdbot.json"
fi

if [[ ! -f "${OC_CONFIG}" ]]; then
  fail "Config do OpenClaw nao encontrada. Execute a Fase 0 primeiro."
  exit 1
fi

log "Config OpenClaw: ${OC_CONFIG}"
log "NanoClaw .env: ${NANO_ENV}"
echo ""

# --- 5.1 Migrar configuracoes gerais ----------------------------------------
log "=== Migrando configuracoes gerais ==="

ASSISTANT_NAME=$(get_nano_var "ASSISTANT_NAME")
TZ_VALUE=$(get_nano_var "TZ")

if [[ -n "${ASSISTANT_NAME}" ]]; then
  # Atualizar IDENTITY.md
  if [[ -f "${OPENCLAW_DIR}/workspace/IDENTITY.md" ]]; then
    sed -i "s/^name:.*$/name: ${ASSISTANT_NAME}/" "${OPENCLAW_DIR}/workspace/IDENTITY.md" 2>/dev/null || true
    ok "Nome do assistente: ${ASSISTANT_NAME}"
  fi
fi

if [[ -n "${TZ_VALUE}" ]]; then
  # Atualizar timezone em openclaw.json
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('${OC_CONFIG}', 'utf-8'));
    if (!config.agents) config.agents = {};
    if (!config.agents.defaults) config.agents.defaults = {};
    config.agents.defaults.userTimezone = '${TZ_VALUE}';
    fs.writeFileSync('${OC_CONFIG}', JSON.stringify(config, null, 2));
  " 2>/dev/null && ok "Timezone: ${TZ_VALUE}" || warn "Falha ao configurar timezone"
fi

echo ""

# --- Funcao para adicionar canal ao openclaw.json ----------------------------
add_channel_config() {
  local channel="$1"
  local json_fragment="$2"

  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('${OC_CONFIG}', 'utf-8'));
    if (!config.channels) config.channels = {};
    config.channels['${channel}'] = ${json_fragment};
    fs.writeFileSync('${OC_CONFIG}', JSON.stringify(config, null, 2));
  " 2>/dev/null
}

# --- 5.2 Canal: Telegram ----------------------------------------------------
log "=== Canal: Telegram ==="

TELEGRAM_TOKEN=$(get_nano_var "TELEGRAM_BOT_TOKEN")
if [[ -n "${TELEGRAM_TOKEN}" ]]; then
  add_channel_config "telegram" "{\"botToken\": \"${TELEGRAM_TOKEN}\"}" && \
    ok "Telegram configurado em openclaw.json" || warn "Falha ao configurar Telegram"
  CHANNELS_STATUS+=("Telegram: OK")
else
  info "TELEGRAM_BOT_TOKEN nao encontrado."
  info "  Configure manualmente em ${OC_CONFIG} -> channels.telegram.botToken"
  CHANNELS_STATUS+=("Telegram: PENDENTE")
fi

echo ""

# --- 5.3 Canal: WhatsApp ----------------------------------------------------
log "=== Canal: WhatsApp ==="

warn "WhatsApp requer reautenticacao (sessao baileys nao e transferivel)"
info "  1. Certifique-se que o canal WhatsApp esta habilitado no OpenClaw"
info "  2. Inicie o OpenClaw e escaneie o QR code"
CHANNELS_STATUS+=("WhatsApp: REAUTENTICACAO NECESSARIA")

echo ""

# --- 5.4 Canal: Slack -------------------------------------------------------
log "=== Canal: Slack ==="

SLACK_BOT=$(get_nano_var "SLACK_BOT_TOKEN")
SLACK_APP=$(get_nano_var "SLACK_APP_TOKEN")

if [[ -n "${SLACK_BOT}" ]] && [[ -n "${SLACK_APP}" ]]; then
  add_channel_config "slack" "{\"botToken\": \"${SLACK_BOT}\", \"appToken\": \"${SLACK_APP}\"}" && \
    ok "Slack configurado" || warn "Falha ao configurar Slack"
  CHANNELS_STATUS+=("Slack: OK")
elif [[ -n "${SLACK_BOT}" ]]; then
  add_channel_config "slack" "{\"botToken\": \"${SLACK_BOT}\"}" && \
    ok "Slack parcialmente configurado (falta appToken)" || true
  CHANNELS_STATUS+=("Slack: PARCIAL (falta appToken)")
else
  info "Credenciais Slack nao encontradas. Configure em https://api.slack.com/apps"
  CHANNELS_STATUS+=("Slack: PENDENTE")
fi

echo ""

# --- 5.5 Canal: Discord -----------------------------------------------------
log "=== Canal: Discord ==="

DISCORD_TOKEN=$(get_nano_var "DISCORD_BOT_TOKEN")
if [[ -n "${DISCORD_TOKEN}" ]]; then
  add_channel_config "discord" "{\"token\": \"${DISCORD_TOKEN}\"}" && \
    ok "Discord configurado" || warn "Falha ao configurar Discord"
  CHANNELS_STATUS+=("Discord: OK")
else
  info "DISCORD_BOT_TOKEN nao encontrado. Configure em https://discord.com/developers/applications"
  CHANNELS_STATUS+=("Discord: PENDENTE")
fi

echo ""

# --- 5.6 Canal: Gmail -------------------------------------------------------
log "=== Canal: Gmail ==="

GMAIL_ID=$(get_nano_var "GMAIL_CLIENT_ID")
GMAIL_SECRET=$(get_nano_var "GMAIL_CLIENT_SECRET")
GMAIL_REFRESH=$(get_nano_var "GMAIL_REFRESH_TOKEN")

if [[ -n "${GMAIL_ID}" ]] && [[ -n "${GMAIL_SECRET}" ]] && [[ -n "${GMAIL_REFRESH}" ]]; then
  info "Gmail requer configuracao manual no OpenClaw (formato OAuth diferente)"
  info "  Client ID: ${GMAIL_ID:0:10}..."
  info "  Configure em ${OC_CONFIG}"
  CHANNELS_STATUS+=("Gmail: CONFIGURACAO MANUAL")
else
  info "Credenciais Gmail incompletas. Reconfigure via Google Cloud Console"
  CHANNELS_STATUS+=("Gmail: PENDENTE")
fi

echo ""

# --- 5.7 Migrar credenciais Anthropic ---------------------------------------
log "=== Credenciais Anthropic ==="

ANTHROPIC_KEY=$(get_nano_var "ANTHROPIC_API_KEY")
if [[ -n "${ANTHROPIC_KEY}" ]]; then
  # Configurar em auth-profiles.json
  node -e "
    const fs = require('fs');
    const authFile = '${OPENCLAW_DIR}/auth-profiles.json';
    let auth = { version: 1, profiles: {} };
    if (fs.existsSync(authFile)) {
      try { auth = JSON.parse(fs.readFileSync(authFile, 'utf-8')); } catch(e) {}
    }
    auth.profiles['anthropic:default'] = {
      type: 'api_key',
      provider: 'anthropic',
      key: '${ANTHROPIC_KEY}'
    };
    fs.writeFileSync(authFile, JSON.stringify(auth, null, 2));
  " 2>/dev/null && ok "Chave Anthropic configurada em auth-profiles.json" || warn "Falha ao configurar chave Anthropic"
else
  warn "ANTHROPIC_API_KEY nao encontrada"
  info "  Configure em ${OPENCLAW_DIR}/auth-profiles.json"
fi

echo ""

# --- 5.8 OneCLI -------------------------------------------------------------
log "=== Verificando OneCLI ==="

ONECLI_URL=$(get_nano_var "ONECLI_URL")
if [[ -n "${ONECLI_URL}" ]]; then
  log "OneCLI URL: ${ONECLI_URL}"
  warn "OneCLI e especifico do NanoClaw. Verifique se o OpenClaw usa mecanismo similar."
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
  elif [[ "${status}" == *"PARCIAL"* ]] || [[ "${status}" == *"MANUAL"* ]]; then
    echo -e "  ${YELLOW}△${NC} ${status}"
  else
    echo -e "  ${RED}✗${NC} ${status}"
  fi
done
echo ""
log "Config atualizada: ${OC_CONFIG}"
log "Fim: $(date)"
