#!/usr/bin/env bash
# ============================================================================
# Fase 7: Migracao do Dashboard Mission Control
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# O Dashboard e uma aplicacao Next.js independente.
# Instalado FORA do state dir do OpenClaw (ex: ~/openclaw-dashboard).
# Le dados do filesystem (offices/) e do banco SQLite do NanoClaw (migrado).
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
DASHBOARD_DIR="${DASHBOARD_DIR:-$HOME/openclaw-dashboard}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
NANOCLAW_DIR="${NANOCLAW_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/07-migrate-dashboard-$(date +%Y%m%d_%H%M%S).log"
DASHBOARD_PORT="${DASHBOARD_PORT:-3000}"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }
info() { echo -e "${YELLOW}[ACAO]${NC} $*" | tee -a "${LOG_FILE}"; }

echo ""
echo "============================================================"
echo "  Fase 7: Migracao do Dashboard Mission Control"
echo "============================================================"
echo ""
log "Inicio: $(date)"
log "Dashboard destino: ${DASHBOARD_DIR}"

# --- 7.1 Localizar dashboard fonte ------------------------------------------
DASHBOARD_SRC=""
for candidate in \
  "${EXPORT_DIR}/offices/dashboard" \
  "${NANOCLAW_DIR}/offices/dashboard"; do
  if [[ -d "${candidate}" ]] && [[ -f "${candidate}/package.json" ]]; then
    DASHBOARD_SRC="${candidate}"
    break
  fi
done

if [[ -z "${DASHBOARD_SRC}" ]]; then
  fail "Dashboard nao encontrado no pacote de exportacao nem no NanoClaw"
  exit 1
fi

log "Fonte: ${DASHBOARD_SRC}"

# --- 7.2 Copiar dashboard ---------------------------------------------------
log "=== Copiando Dashboard ==="

mkdir -p "${DASHBOARD_DIR}"

rsync -av --exclude='node_modules' --exclude='.next' --exclude='.env.local' \
  "${DASHBOARD_SRC}/" "${DASHBOARD_DIR}/" >> "${LOG_FILE}" 2>&1 || \
  cp -r "${DASHBOARD_SRC}/" "${DASHBOARD_DIR}/" 2>/dev/null

ok "Arquivos copiados"

# --- 7.3 Instalar dependencias ----------------------------------------------
log "=== Instalando dependencias ==="

cd "${DASHBOARD_DIR}"
npm install >> "${LOG_FILE}" 2>&1
ok "npm install concluido"

# --- 7.4 Configurar variaveis de ambiente ------------------------------------
log "=== Configurando ambiente ==="

# O banco SQLite original esta preservado em ~/.openclaw/workspace/.migration-ref/
MIGRATED_DB="${OPENCLAW_DIR}/workspace/.migration-ref/nanoclaw.db"
OFFICES_PATH="${OPENCLAW_DIR}/workspace/offices"

NEXTAUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)

cat > "${DASHBOARD_DIR}/.env.local" << EOF
# Dashboard Mission Control - Configuracao
# Gerado em $(date -Iseconds)

# Banco de dados (SQLite migrado do NanoClaw)
DATABASE_PATH=${MIGRATED_DB}

# Caminho para offices (dentro do state dir do OpenClaw)
OFFICES_PATH=${OFFICES_PATH}

# State dir do OpenClaw
OPENCLAW_STATE_DIR=${OPENCLAW_DIR}

# NextAuth
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://localhost:${DASHBOARD_PORT}

# Porta
PORT=${DASHBOARD_PORT}
EOF

ok "Arquivo .env.local criado"

# --- 7.5 Build do dashboard -------------------------------------------------
log "=== Compilando dashboard ==="

cd "${DASHBOARD_DIR}"
if npm run build >> "${LOG_FILE}" 2>&1; then
  ok "Build concluido"
else
  warn "Build falhou - verifique o log: ${LOG_FILE}"
fi

# --- 7.6 Configurar PM2 ----------------------------------------------------
log "=== Configurando PM2 ==="

if command -v pm2 &>/dev/null; then
  mkdir -p "$(dirname "${OPENCLAW_DIR}")/logs" 2>/dev/null || mkdir -p "${DASHBOARD_DIR}/logs"
  LOG_PATH="${DASHBOARD_DIR}/logs"

  cat > "${DASHBOARD_DIR}/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'openclaw-dashboard',
    cwd: '${DASHBOARD_DIR}',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: ${DASHBOARD_PORT}
    },
    max_memory_restart: '512M',
    log_file: '${LOG_PATH}/dashboard.log',
    error_file: '${LOG_PATH}/dashboard-error.log',
    time: true
  }]
};
EOF

  pm2 delete openclaw-dashboard 2>/dev/null || true
  pm2 start ecosystem.config.js >> "${LOG_FILE}" 2>&1
  pm2 save >> "${LOG_FILE}" 2>&1
  ok "Dashboard registrado no PM2"
else
  warn "PM2 nao encontrado. Instale com: npm install -g pm2"
  info "Apos instalar: cd ${DASHBOARD_DIR} && pm2 start ecosystem.config.js && pm2 save"
fi

# --- 7.7 Nginx (opcional) ---------------------------------------------------
log "=== Verificando Nginx ==="

if command -v nginx &>/dev/null; then
  cat > "/tmp/openclaw-dashboard-nginx.conf" << 'EOF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:DASHBOARD_PORT_PLACEHOLDER;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF
  sed -i "s/DASHBOARD_PORT_PLACEHOLDER/${DASHBOARD_PORT}/" /tmp/openclaw-dashboard-nginx.conf

  info "Config Nginx gerada em /tmp/openclaw-dashboard-nginx.conf"
  info "  sudo cp /tmp/openclaw-dashboard-nginx.conf /etc/nginx/sites-available/openclaw-dashboard"
  info "  sudo ln -sf /etc/nginx/sites-available/openclaw-dashboard /etc/nginx/sites-enabled/"
  info "  sudo nginx -t && sudo systemctl reload nginx"
else
  log "Nginx nao encontrado (opcional)"
fi

# --- 7.8 Testar -------------------------------------------------------------
log "=== Testando dashboard ==="

sleep 3
if curl -sf "http://localhost:${DASHBOARD_PORT}" > /dev/null 2>&1; then
  ok "Dashboard acessivel em http://localhost:${DASHBOARD_PORT}"
else
  warn "Dashboard nao respondendo. Verifique: pm2 logs openclaw-dashboard"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}  DASHBOARD MIGRADO${NC}"
echo "  Local: ${DASHBOARD_DIR}"
echo "  URL:   http://localhost:${DASHBOARD_PORT}"
echo "  Acesso remoto: ssh -N -L ${DASHBOARD_PORT}:localhost:${DASHBOARD_PORT} user@host"
echo "============================================================"
log "Fim: $(date)"
