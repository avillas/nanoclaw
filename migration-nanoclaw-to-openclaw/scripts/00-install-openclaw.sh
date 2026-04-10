#!/usr/bin/env bash
# ============================================================================
# Fase 0: Instalacao do OpenClaw no Linux
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# OpenClaw e instalado via npm global ou script de instalacao oficial.
# O diretorio de estado (~/.openclaw) e criado automaticamente e contem:
#   openclaw.json    - config principal
#   workspace/       - IDENTITY.md, SOUL.md, USER.md, MEMORY.md
#   agents/          - agentes (cada um com sessions/ e workspace/)
#   skills/          - skills compartilhadas
#   cron/            - tarefas agendadas (jobs.json)
#   auth-profiles.json - credenciais
#
# Pode ser pulado se o OpenClaw ja estiver instalado.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

# --- Configuracao -----------------------------------------------------------
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
NODE_MAJOR="${NODE_MAJOR:-22}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/00-install-$(date +%Y%m%d_%H%M%S).log"
REMOTE_HOST="${REMOTE_HOST:-}"

mkdir -p "${LOG_DIR}"

# --- Funcoes utilitarias ----------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }
die()  { fail "$*"; exit 1; }
step() { echo -e "\n${BOLD}${BLUE}>>> $*${NC}" | tee -a "${LOG_FILE}"; }

run_on_target() {
  if [[ -n "${REMOTE_HOST}" ]]; then
    ssh "${REMOTE_HOST}" "$@"
  else
    eval "$@"
  fi
}

run_sudo() {
  if [[ -n "${REMOTE_HOST}" ]]; then
    ssh "${REMOTE_HOST}" "sudo $*"
  else
    sudo bash -c "$*"
  fi
}

detect_pkg_manager() {
  if command -v apt-get &>/dev/null; then echo "apt"
  elif command -v dnf &>/dev/null; then echo "dnf"
  elif command -v yum &>/dev/null; then echo "yum"
  elif command -v pacman &>/dev/null; then echo "pacman"
  else echo "unknown"; fi
}

# --- Cabecalho --------------------------------------------------------------
echo ""
echo "============================================================"
echo "  Fase 0: Instalacao do OpenClaw"
echo "  Migracao NanoClaw -> OpenClaw"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "Destino: ${REMOTE_HOST:-localhost}"
log "State dir: ${OPENCLAW_DIR}"
log "Log: ${LOG_FILE}"

# --- Verificar se ja esta instalado -----------------------------------------
if run_on_target "command -v openclaw" &>/dev/null 2>&1; then
  OC_VERSION=$(run_on_target "openclaw --version 2>/dev/null" || echo "?")
  echo ""
  echo -e "${YELLOW}OpenClaw ja esta instalado (${OC_VERSION})${NC}"

  if run_on_target "[[ -f '${OPENCLAW_DIR}/openclaw.json' ]] || [[ -f '${OPENCLAW_DIR}/clawdbot.json' ]]" 2>/dev/null; then
    ok "State dir existe em ${OPENCLAW_DIR}"
  fi

  echo ""
  read -p "Deseja reinstalar/atualizar? (s/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    ok "Instalacao pulada. OpenClaw ja presente."
    exit 0
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.1 DEPENDENCIAS DO SISTEMA
# ═══════════════════════════════════════════════════════════════════════════════
step "0.1 Instalando dependencias do sistema"

PKG_MANAGER=$(run_on_target "$(declare -f detect_pkg_manager); detect_pkg_manager" 2>/dev/null || detect_pkg_manager)
log "Gerenciador de pacotes: ${PKG_MANAGER}"

case "${PKG_MANAGER}" in
  apt)
    log "Atualizando repositorios..."
    run_sudo "apt-get update -qq" >> "${LOG_FILE}" 2>&1
    log "Instalando pacotes base..."
    run_sudo "apt-get install -y -qq \
      curl wget git build-essential sqlite3 \
      ca-certificates gnupg lsb-release \
      python3 python3-pip jq unzip" >> "${LOG_FILE}" 2>&1
    ok "Pacotes base instalados (apt)"
    ;;
  dnf)
    run_sudo "dnf install -y -q \
      curl wget git gcc gcc-c++ make sqlite \
      ca-certificates gnupg2 python3 python3-pip jq unzip" >> "${LOG_FILE}" 2>&1
    ok "Pacotes base instalados (dnf)"
    ;;
  yum)
    run_sudo "yum install -y -q \
      curl wget git gcc gcc-c++ make sqlite \
      ca-certificates gnupg2 python3 python3-pip jq unzip" >> "${LOG_FILE}" 2>&1
    ok "Pacotes base instalados (yum)"
    ;;
  pacman)
    run_sudo "pacman -Sy --noconfirm \
      curl wget git base-devel sqlite python python-pip jq unzip" >> "${LOG_FILE}" 2>&1
    ok "Pacotes base instalados (pacman)"
    ;;
  *)
    warn "Gerenciador de pacotes nao reconhecido. Instale manualmente:"
    warn "  git, curl, sqlite3, python3, jq, build-essential/gcc"
    ;;
esac

# ═══════════════════════════════════════════════════════════════════════════════
# 0.2 NODE.JS
# ═══════════════════════════════════════════════════════════════════════════════
step "0.2 Verificando/instalando Node.js"

NODE_INSTALLED=$(run_on_target "node --version 2>/dev/null" || echo "")

if [[ "${NODE_INSTALLED}" =~ ^v(2[2-9]|[3-9][0-9]) ]]; then
  ok "Node.js ja instalado: ${NODE_INSTALLED}"
else
  log "Instalando Node.js ${NODE_MAJOR}... (OpenClaw requer >= 22.14)"

  case "${PKG_MANAGER}" in
    apt)
      run_on_target "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | sudo -E bash -" >> "${LOG_FILE}" 2>&1
      run_sudo "apt-get install -y -qq nodejs" >> "${LOG_FILE}" 2>&1
      ;;
    dnf|yum)
      run_on_target "curl -fsSL https://rpm.nodesource.com/setup_${NODE_MAJOR}.x | sudo -E bash -" >> "${LOG_FILE}" 2>&1
      run_sudo "${PKG_MANAGER} install -y nodejs" >> "${LOG_FILE}" 2>&1
      ;;
    pacman)
      run_sudo "pacman -S --noconfirm nodejs npm" >> "${LOG_FILE}" 2>&1
      ;;
    *)
      log "Instalando via nvm..."
      run_on_target 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash' >> "${LOG_FILE}" 2>&1
      run_on_target "export NVM_DIR=\"\$HOME/.nvm\" && source \"\$NVM_DIR/nvm.sh\" && nvm install ${NODE_MAJOR}" >> "${LOG_FILE}" 2>&1
      ;;
  esac

  NODE_VERSION=$(run_on_target "node --version 2>/dev/null" || echo "nao instalado")
  NPM_VERSION=$(run_on_target "npm --version 2>/dev/null" || echo "nao instalado")
  ok "Node.js: ${NODE_VERSION} | npm: ${NPM_VERSION}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.3 DOCKER
# ═══════════════════════════════════════════════════════════════════════════════
step "0.3 Verificando/instalando Docker"

if run_on_target "docker --version" &>/dev/null; then
  DOCKER_VER=$(run_on_target "docker --version 2>/dev/null" | head -1)
  ok "Docker ja instalado: ${DOCKER_VER}"
else
  log "Instalando Docker..."

  case "${PKG_MANAGER}" in
    apt)
      run_sudo "install -m 0755 -d /etc/apt/keyrings" 2>/dev/null || true
      run_on_target "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null" >> "${LOG_FILE}" 2>&1 || true
      DISTRO=$(run_on_target "lsb_release -cs 2>/dev/null || echo jammy")
      ARCH=$(run_on_target "dpkg --print-architecture 2>/dev/null || echo amd64")
      run_sudo "echo \"deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${DISTRO} stable\" > /etc/apt/sources.list.d/docker.list" 2>/dev/null || true
      run_sudo "apt-get update -qq" >> "${LOG_FILE}" 2>&1
      run_sudo "apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" >> "${LOG_FILE}" 2>&1
      ;;
    dnf)
      run_sudo "dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo" >> "${LOG_FILE}" 2>&1
      run_sudo "dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" >> "${LOG_FILE}" 2>&1
      ;;
    yum)
      run_sudo "yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo" >> "${LOG_FILE}" 2>&1
      run_sudo "yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" >> "${LOG_FILE}" 2>&1
      ;;
    pacman)
      run_sudo "pacman -S --noconfirm docker docker-compose docker-buildx" >> "${LOG_FILE}" 2>&1
      ;;
    *)
      warn "Instale o Docker manualmente: https://docs.docker.com/engine/install/"
      ;;
  esac

  run_sudo "systemctl enable docker" >> "${LOG_FILE}" 2>&1 || true
  run_sudo "systemctl start docker" >> "${LOG_FILE}" 2>&1 || true

  CURRENT_USER=$(run_on_target "whoami")
  run_sudo "usermod -aG docker ${CURRENT_USER}" >> "${LOG_FILE}" 2>&1 || true
  warn "Pode ser necessario logout/login para o grupo docker ter efeito (ou: newgrp docker)"

  DOCKER_VER=$(run_on_target "docker --version 2>/dev/null" || echo "verificar apos login")
  ok "Docker instalado: ${DOCKER_VER}"
fi

if run_on_target "docker info" &>/dev/null 2>&1; then
  ok "Docker daemon esta rodando"
else
  warn "Docker daemon nao acessivel. Verifique: sudo systemctl status docker"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.4 FERRAMENTAS ADICIONAIS
# ═══════════════════════════════════════════════════════════════════════════════
step "0.4 Instalando ferramentas adicionais"

# PM2
if ! run_on_target "command -v pm2" &>/dev/null; then
  log "Instalando PM2..."
  run_on_target "npm install -g pm2" >> "${LOG_FILE}" 2>&1 || run_sudo "npm install -g pm2" >> "${LOG_FILE}" 2>&1 || warn "Falha ao instalar PM2"
  ok "PM2 instalado"
else
  ok "PM2 ja instalado"
fi

# GitHub CLI
if ! run_on_target "command -v gh" &>/dev/null; then
  log "Instalando GitHub CLI..."
  case "${PKG_MANAGER}" in
    apt)
      run_on_target "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null" || true
      run_sudo "echo 'deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' > /etc/apt/sources.list.d/github-cli.list" 2>/dev/null || true
      run_sudo "apt-get update -qq && apt-get install -y -qq gh" >> "${LOG_FILE}" 2>&1 || true
      ;;
    dnf|yum) run_sudo "${PKG_MANAGER} install -y gh" >> "${LOG_FILE}" 2>&1 || true ;;
    pacman) run_sudo "pacman -S --noconfirm github-cli" >> "${LOG_FILE}" 2>&1 || true ;;
  esac
  run_on_target "command -v gh" &>/dev/null && ok "GitHub CLI instalado" || warn "GitHub CLI nao instalado (opcional)"
else
  ok "GitHub CLI ja instalado"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.5 INSTALAR OPENCLAW
# ═══════════════════════════════════════════════════════════════════════════════
step "0.5 Instalando OpenClaw"

if run_on_target "command -v openclaw" &>/dev/null 2>&1; then
  OC_VER=$(run_on_target "openclaw --version 2>/dev/null" || echo "?")
  log "OpenClaw ja instalado: ${OC_VER}. Atualizando..."
  run_on_target "npm update -g openclaw" >> "${LOG_FILE}" 2>&1 || true
  ok "OpenClaw atualizado"
else
  log "Instalando OpenClaw via npm..."

  # Metodo 1: npm global
  if run_on_target "npm install -g openclaw" >> "${LOG_FILE}" 2>&1; then
    ok "OpenClaw instalado via npm"
  # Metodo 2: script oficial
  elif run_on_target "curl -fsSL https://openclaw.ai/install.sh | bash" >> "${LOG_FILE}" 2>&1; then
    ok "OpenClaw instalado via script oficial"
  # Metodo 3: install-cli (prefix local em ~/.openclaw)
  elif run_on_target "curl -fsSL https://openclaw.ai/install-cli.sh | bash" >> "${LOG_FILE}" 2>&1; then
    ok "OpenClaw instalado via install-cli (local prefix)"
  else
    die "Falha ao instalar OpenClaw. Instale manualmente: npm install -g openclaw"
  fi
fi

OC_VERSION=$(run_on_target "openclaw --version 2>/dev/null" || echo "desconhecida")
ok "OpenClaw versao: ${OC_VERSION}"

# ═══════════════════════════════════════════════════════════════════════════════
# 0.6 INICIALIZAR STATE DIR
# ═══════════════════════════════════════════════════════════════════════════════
step "0.6 Verificando state dir do OpenClaw"

# O state dir e criado automaticamente na primeira execucao.
# Verificar se ja existe; se nao, criamos a estrutura base.
if run_on_target "[[ -f '${OPENCLAW_DIR}/openclaw.json' ]] || [[ -f '${OPENCLAW_DIR}/clawdbot.json' ]]" 2>/dev/null; then
  ok "State dir ja inicializado em ${OPENCLAW_DIR}"
  CONFIG_FILE=$(run_on_target "[[ -f '${OPENCLAW_DIR}/openclaw.json' ]] && echo 'openclaw.json' || echo 'clawdbot.json'" 2>/dev/null)
  log "Config: ${CONFIG_FILE}"
else
  log "Criando estrutura base do state dir..."

  run_on_target "mkdir -p '${OPENCLAW_DIR}/workspace/memory'"
  run_on_target "mkdir -p '${OPENCLAW_DIR}/workspace/skills'"
  run_on_target "mkdir -p '${OPENCLAW_DIR}/agents/main/sessions'"
  run_on_target "mkdir -p '${OPENCLAW_DIR}/skills'"
  run_on_target "mkdir -p '${OPENCLAW_DIR}/cron'"

  # Criar openclaw.json minimo
  run_on_target "cat > '${OPENCLAW_DIR}/openclaw.json' << 'CFGEOF'
{
  \"agents\": {
    \"defaults\": {
      \"userTimezone\": \"America/Sao_Paulo\",
      \"timeoutSeconds\": 1800
    }
  },
  \"channels\": {},
  \"mcp\": { \"servers\": {} },
  \"skills\": { \"entries\": {} }
}
CFGEOF"

  # Criar workspace files base
  run_on_target "cat > '${OPENCLAW_DIR}/workspace/IDENTITY.md' << 'IDEOF'
name: Andy
language: pt-BR
IDEOF"

  run_on_target "cat > '${OPENCLAW_DIR}/workspace/SOUL.md' << 'SEOF'
# Soul

Voce e um assistente pessoal inteligente e prestativo.
SEOF"

  run_on_target "cat > '${OPENCLAW_DIR}/workspace/USER.md' << 'UEOF'
# User

Owner preferences and context.
UEOF"

  run_on_target "cat > '${OPENCLAW_DIR}/workspace/MEMORY.md' << 'MEOF'
# Memory

Long-term memory and learned context.
MEOF"

  # Criar cron/jobs.json vazio
  run_on_target "echo '{\"version\":1,\"jobs\":[]}' > '${OPENCLAW_DIR}/cron/jobs.json'"

  # Criar auth-profiles.json vazio
  run_on_target "echo '{\"version\":1,\"profiles\":{}}' > '${OPENCLAW_DIR}/auth-profiles.json'"

  ok "State dir criado em ${OPENCLAW_DIR}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.7 CONFIGURAR SERVICO SYSTEMD
# ═══════════════════════════════════════════════════════════════════════════════
step "0.7 Preparando servico systemd"

SYSTEMD_DIR="${HOME}/.config/systemd/user"
run_on_target "mkdir -p '${SYSTEMD_DIR}'"

OC_BIN=$(run_on_target "which openclaw 2>/dev/null" || echo "/usr/local/bin/openclaw")

cat > "/tmp/openclaw.service" << EOF
[Unit]
Description=OpenClaw AI Assistant
After=network.target docker.service

[Service]
Type=simple
ExecStart=${OC_BIN} --daemon
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=OPENCLAW_STATE_DIR=${OPENCLAW_DIR}

[Install]
WantedBy=default.target
EOF

if [[ -n "${REMOTE_HOST}" ]]; then
  scp "/tmp/openclaw.service" "${REMOTE_HOST}:${SYSTEMD_DIR}/openclaw.service" >> "${LOG_FILE}" 2>&1
else
  cp "/tmp/openclaw.service" "${SYSTEMD_DIR}/openclaw.service"
fi

run_on_target "systemctl --user daemon-reload" 2>/dev/null || true
run_on_target "systemctl --user enable openclaw" 2>/dev/null || true
run_sudo "loginctl enable-linger $(run_on_target 'whoami')" 2>/dev/null || true

ok "Servico systemd preparado (nao iniciado ainda)"
rm -f "/tmp/openclaw.service"

# ═══════════════════════════════════════════════════════════════════════════════
# RESUMO
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "============================================================"
echo -e "${GREEN}  INSTALACAO DO OPENCLAW CONCLUIDA${NC}"
echo "============================================================"
echo ""

NODE_V=$(run_on_target "node --version 2>/dev/null" || echo "?")
NPM_V=$(run_on_target "npm --version 2>/dev/null" || echo "?")
DOCKER_V=$(run_on_target "docker --version 2>/dev/null" || echo "nao disponivel")
PM2_V=$(run_on_target "pm2 --version 2>/dev/null" || echo "nao instalado")

echo -e "  Node.js:    ${NODE_V}"
echo -e "  npm:        ${NPM_V}"
echo -e "  Docker:     ${DOCKER_V}"
echo -e "  PM2:        ${PM2_V}"
echo -e "  OpenClaw:   ${OC_VERSION}"
echo -e "  State dir:  ${OPENCLAW_DIR}"
echo ""
echo "Proximos passos:"
echo "  1. Execute a Fase 1: ./01-validate-environment.sh"
echo "  2. Ou execute tudo: ./run-all.sh"
echo ""
log "Fim: $(date)"
