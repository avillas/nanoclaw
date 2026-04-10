#!/usr/bin/env bash
# ============================================================================
# Fase 0: Instalacao do OpenClaw no Linux
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# Este script instala o OpenClaw do zero em uma maquina Linux,
# incluindo todas as dependencias do sistema, configuracao do
# container runtime e build inicial.
#
# Pode ser pulado se o OpenClaw ja estiver instalado.
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true

# --- Configuracao -----------------------------------------------------------
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
OPENCLAW_REPO="${OPENCLAW_REPO:-https://github.com/openclaw/openclaw.git}"
OPENCLAW_BRANCH="${OPENCLAW_BRANCH:-main}"
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

# Detectar gerenciador de pacotes
detect_pkg_manager() {
  if command -v apt-get &>/dev/null; then
    echo "apt"
  elif command -v dnf &>/dev/null; then
    echo "dnf"
  elif command -v yum &>/dev/null; then
    echo "yum"
  elif command -v pacman &>/dev/null; then
    echo "pacman"
  else
    echo "unknown"
  fi
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
log "Diretorio: ${OPENCLAW_DIR}"
log "Repositorio: ${OPENCLAW_REPO}"
log "Branch: ${OPENCLAW_BRANCH}"
log "Log: ${LOG_FILE}"

# --- Verificar se ja esta instalado -----------------------------------------
if run_on_target "[[ -f '${OPENCLAW_DIR}/package.json' ]]" 2>/dev/null; then
  OC_VERSION=$(run_on_target "node -e \"console.log(require('${OPENCLAW_DIR}/package.json').version)\"" 2>/dev/null || echo "?")
  echo ""
  echo -e "${YELLOW}OpenClaw ja esta instalado em ${OPENCLAW_DIR} (v${OC_VERSION})${NC}"
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
    log "Instalando pacotes base..."
    run_sudo "dnf install -y -q \
      curl wget git gcc gcc-c++ make sqlite \
      ca-certificates gnupg2 \
      python3 python3-pip jq unzip" >> "${LOG_FILE}" 2>&1
    ok "Pacotes base instalados (dnf)"
    ;;

  yum)
    log "Instalando pacotes base..."
    run_sudo "yum install -y -q \
      curl wget git gcc gcc-c++ make sqlite \
      ca-certificates gnupg2 \
      python3 python3-pip jq unzip" >> "${LOG_FILE}" 2>&1
    ok "Pacotes base instalados (yum)"
    ;;

  pacman)
    log "Instalando pacotes base..."
    run_sudo "pacman -Sy --noconfirm \
      curl wget git base-devel sqlite \
      python python-pip jq unzip" >> "${LOG_FILE}" 2>&1
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

if [[ "${NODE_INSTALLED}" =~ ^v(2[0-9]|[3-9][0-9]) ]]; then
  ok "Node.js ja instalado: ${NODE_INSTALLED}"
else
  log "Instalando Node.js ${NODE_MAJOR}..."

  case "${PKG_MANAGER}" in
    apt)
      # NodeSource oficial
      run_sudo "mkdir -p /etc/apt/keyrings" 2>/dev/null || true
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
      # Fallback: nvm
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
      # Docker oficial
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

  # Habilitar e iniciar Docker
  run_sudo "systemctl enable docker" >> "${LOG_FILE}" 2>&1 || true
  run_sudo "systemctl start docker" >> "${LOG_FILE}" 2>&1 || true

  # Adicionar usuario ao grupo docker (evita necessidade de sudo)
  CURRENT_USER=$(run_on_target "whoami")
  run_sudo "usermod -aG docker ${CURRENT_USER}" >> "${LOG_FILE}" 2>&1 || true
  warn "Voce pode precisar fazer logout/login para o grupo docker ter efeito"
  warn "Ou execute: newgrp docker"

  DOCKER_VER=$(run_on_target "docker --version 2>/dev/null" || echo "verificar apos login")
  ok "Docker instalado: ${DOCKER_VER}"
fi

# Verificar se Docker esta rodando
if run_on_target "docker info" &>/dev/null 2>&1; then
  ok "Docker daemon esta rodando"
else
  warn "Docker instalado mas daemon nao esta acessivel"
  warn "Verifique: sudo systemctl status docker"
  warn "Se for permissao: newgrp docker (ou logout/login)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.4 FERRAMENTAS ADICIONAIS
# ═══════════════════════════════════════════════════════════════════════════════
step "0.4 Instalando ferramentas adicionais"

# PM2 (para dashboard)
if ! run_on_target "command -v pm2" &>/dev/null; then
  log "Instalando PM2..."
  run_on_target "npm install -g pm2" >> "${LOG_FILE}" 2>&1 || warn "Falha ao instalar PM2 (pode precisar de sudo)"
  ok "PM2 instalado"
else
  ok "PM2 ja instalado"
fi

# GitHub CLI (opcional, para clonar repos privados)
if ! run_on_target "command -v gh" &>/dev/null; then
  log "Instalando GitHub CLI..."
  case "${PKG_MANAGER}" in
    apt)
      run_on_target "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null" || true
      run_sudo "echo 'deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main' > /etc/apt/sources.list.d/github-cli.list" 2>/dev/null || true
      run_sudo "apt-get update -qq && apt-get install -y -qq gh" >> "${LOG_FILE}" 2>&1 || true
      ;;
    dnf|yum)
      run_sudo "${PKG_MANAGER} install -y gh" >> "${LOG_FILE}" 2>&1 || true
      ;;
    pacman)
      run_sudo "pacman -S --noconfirm github-cli" >> "${LOG_FILE}" 2>&1 || true
      ;;
  esac
  if run_on_target "command -v gh" &>/dev/null; then
    ok "GitHub CLI instalado"
  else
    warn "GitHub CLI nao instalado (opcional)"
  fi
else
  ok "GitHub CLI ja instalado"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.5 CLONAR OPENCLAW
# ═══════════════════════════════════════════════════════════════════════════════
step "0.5 Clonando OpenClaw"

if run_on_target "[[ -d '${OPENCLAW_DIR}/.git' ]]" 2>/dev/null; then
  log "Repositorio ja existe. Atualizando..."
  run_on_target "cd '${OPENCLAW_DIR}' && git fetch origin && git pull origin ${OPENCLAW_BRANCH}" >> "${LOG_FILE}" 2>&1 || warn "Falha ao atualizar (pode ter alteracoes locais)"
  ok "Repositorio atualizado"
else
  log "Clonando ${OPENCLAW_REPO}..."

  # Criar diretorio pai se necessario
  run_on_target "mkdir -p '$(dirname "${OPENCLAW_DIR}")'"

  if run_on_target "git clone --branch '${OPENCLAW_BRANCH}' '${OPENCLAW_REPO}' '${OPENCLAW_DIR}'" >> "${LOG_FILE}" 2>&1; then
    ok "Repositorio clonado em ${OPENCLAW_DIR}"
  else
    # Tentar com gh (caso precise autenticacao)
    if run_on_target "command -v gh" &>/dev/null; then
      log "Tentando clonar via GitHub CLI..."
      run_on_target "gh repo clone '${OPENCLAW_REPO}' '${OPENCLAW_DIR}' -- --branch '${OPENCLAW_BRANCH}'" >> "${LOG_FILE}" 2>&1 || die "Falha ao clonar repositorio"
      ok "Repositorio clonado via gh"
    else
      die "Falha ao clonar ${OPENCLAW_REPO}. Verifique URL e permissoes."
    fi
  fi
fi

# Verificar versao
OC_VERSION=$(run_on_target "node -e \"console.log(require('${OPENCLAW_DIR}/package.json').version)\"" 2>/dev/null || echo "desconhecida")
log "Versao do OpenClaw: ${OC_VERSION}"

# ═══════════════════════════════════════════════════════════════════════════════
# 0.6 INSTALAR DEPENDENCIAS DO OPENCLAW
# ═══════════════════════════════════════════════════════════════════════════════
step "0.6 Instalando dependencias do OpenClaw"

run_on_target "cd '${OPENCLAW_DIR}' && npm install" >> "${LOG_FILE}" 2>&1
ok "npm install concluido"

# ═══════════════════════════════════════════════════════════════════════════════
# 0.7 BUILD INICIAL
# ═══════════════════════════════════════════════════════════════════════════════
step "0.7 Compilando OpenClaw"

if run_on_target "cd '${OPENCLAW_DIR}' && npm run build" >> "${LOG_FILE}" 2>&1; then
  ok "Build concluido com sucesso"
else
  warn "Build falhou - pode ser normal antes da configuracao completa"
  warn "Verifique o log: ${LOG_FILE}"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.8 CONSTRUIR CONTAINER IMAGE
# ═══════════════════════════════════════════════════════════════════════════════
step "0.8 Construindo imagem de container do agente"

if [[ -f "${OPENCLAW_DIR}/container/build.sh" ]]; then
  if run_on_target "cd '${OPENCLAW_DIR}' && bash container/build.sh" >> "${LOG_FILE}" 2>&1; then
    ok "Imagem de container construida"
  else
    warn "Falha ao construir imagem de container"
    warn "Tente manualmente: cd ${OPENCLAW_DIR} && bash container/build.sh"
  fi
else
  warn "container/build.sh nao encontrado - container sera construido na migracao"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.9 CRIAR DIRETORIOS ESSENCIAIS
# ═══════════════════════════════════════════════════════════════════════════════
step "0.9 Criando estrutura de diretorios"

run_on_target "mkdir -p '${OPENCLAW_DIR}/store'"
run_on_target "mkdir -p '${OPENCLAW_DIR}/logs'"
run_on_target "mkdir -p '${OPENCLAW_DIR}/groups/main'"
run_on_target "mkdir -p '${OPENCLAW_DIR}/groups/global'"
run_on_target "mkdir -p '${OPENCLAW_DIR}/offices'"
run_on_target "mkdir -p '${OPENCLAW_DIR}/backups'"
run_on_target "mkdir -p '${HOME}/.config/openclaw'"

ok "Estrutura de diretorios criada"

# ═══════════════════════════════════════════════════════════════════════════════
# 0.10 CRIAR .env BASE
# ═══════════════════════════════════════════════════════════════════════════════
step "0.10 Preparando arquivo .env"

OC_ENV="${OPENCLAW_DIR}/.env"
if [[ ! -f "${OC_ENV}" ]]; then
  cat > "${OC_ENV}" << 'ENVEOF'
# ============================================================================
# OpenClaw - Configuracao
# Gerado automaticamente pela fase de instalacao
# Edite os valores conforme necessario
# ============================================================================

# Nome do assistente (usado como trigger em grupos)
ASSISTANT_NAME=Andy

# Timezone (usado pelo agendador de tarefas)
TZ=America/Sao_Paulo

# Imagem do container de agente
CONTAINER_IMAGE=nanoclaw-agent:latest

# Timeout do container (ms) - padrao: 30 min
CONTAINER_TIMEOUT=1800000

# Maximo de containers simultaneos
MAX_CONCURRENT_CONTAINERS=5

# Timeout de ociosidade (ms)
IDLE_TIMEOUT=1800000

# --- Credenciais (adicione conforme necessario) ---
# ANTHROPIC_API_KEY=
# TELEGRAM_BOT_TOKEN=
# SLACK_BOT_TOKEN=
# SLACK_APP_TOKEN=
# DISCORD_BOT_TOKEN=
# GMAIL_CLIENT_ID=
# GMAIL_CLIENT_SECRET=
# GMAIL_REFRESH_TOKEN=
# ONECLI_URL=
ENVEOF

  ok "Arquivo .env base criado"
else
  ok "Arquivo .env ja existe"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 0.11 CONFIGURAR SYSTEMD (preparacao)
# ═══════════════════════════════════════════════════════════════════════════════
step "0.11 Preparando servico systemd"

SYSTEMD_DIR="${HOME}/.config/systemd/user"
run_on_target "mkdir -p '${SYSTEMD_DIR}'"

cat > "/tmp/openclaw.service" << EOF
[Unit]
Description=OpenClaw AI Assistant
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=${OPENCLAW_DIR}
ExecStart=$(which node) ${OPENCLAW_DIR}/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

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

# Habilitar linger (permite servicos do usuario rodarem sem sessao ativa)
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

# Resumo do que foi instalado
log "Resumo da instalacao:"
echo ""
NODE_V=$(run_on_target "node --version 2>/dev/null" || echo "?")
NPM_V=$(run_on_target "npm --version 2>/dev/null" || echo "?")
DOCKER_V=$(run_on_target "docker --version 2>/dev/null" || echo "nao disponivel")
GIT_V=$(run_on_target "git --version 2>/dev/null" || echo "?")
PM2_V=$(run_on_target "pm2 --version 2>/dev/null" || echo "nao instalado")

echo -e "  Node.js:   ${NODE_V}"
echo -e "  npm:       ${NPM_V}"
echo -e "  Docker:    ${DOCKER_V}"
echo -e "  Git:       ${GIT_V}"
echo -e "  PM2:       ${PM2_V}"
echo -e "  OpenClaw:  v${OC_VERSION} em ${OPENCLAW_DIR}"
echo ""
echo "Proximos passos:"
echo "  1. Edite ${OPENCLAW_DIR}/.env com suas credenciais"
echo "  2. Execute a Fase 1: ./01-validate-environment.sh"
echo "  3. Ou execute tudo: ./run-all.sh"
echo ""
log "Fim: $(date)"
