#!/usr/bin/env bash
# ============================================================================
# Fase 7: Migracao do Dashboard Mission Control
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
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

DASHBOARD_SRC="${EXPORT_DIR}/offices/dashboard"
DASHBOARD_DST="${OPENCLAW_DIR}/offices/dashboard"

# --- 7.1 Copiar dashboard ---------------------------------------------------
log "=== Copiando Dashboard ==="

if [[ ! -d "${DASHBOARD_SRC}" ]]; then
  # Tentar diretamente do NanoClaw
  NANOCLAW_DIR="${NANOCLAW_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
  if [[ -d "${NANOCLAW_DIR}/offices/dashboard" ]]; then
    DASHBOARD_SRC="${NANOCLAW_DIR}/offices/dashboard"
  else
    fail "Dashboard nao encontrado"
    exit 1
  fi
fi

mkdir -p "${DASHBOARD_DST}"

# Copiar arquivos (exceto node_modules e .next)
rsync -av --exclude='node_modules' --exclude='.next' --exclude='.env.local' \
  "${DASHBOARD_SRC}/" "${DASHBOARD_DST}/" >> "${LOG_FILE}" 2>&1 || \
  cp -r "${DASHBOARD_SRC}/" "${DASHBOARD_DST}/" 2>/dev/null

ok "Arquivos do dashboard copiados"

# --- 7.2 Instalar dependencias ----------------------------------------------
log "=== Instalando dependencias ==="

cd "${DASHBOARD_DST}"
if [[ -f "package.json" ]]; then
  npm install >> "${LOG_FILE}" 2>&1
  ok "Dependencias instaladas"
else
  fail "package.json nao encontrado em ${DASHBOARD_DST}"
  exit 1
fi

# --- 7.3 Configurar variaveis de ambiente ------------------------------------
log "=== Configurando ambiente do dashboard ==="

# Encontrar banco de dados
OC_DB=""
for candidate in "${OPENCLAW_DIR}/store/openclaw.db" "${OPENCLAW_DIR}/store/data.db" "${OPENCLAW_DIR}/store/nanoclaw.db"; do
  if [[ -f "${candidate}" ]]; then
    OC_DB="${candidate}"
    break
  fi
done

# Gerar segredo para NextAuth
NEXTAUTH_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)

cat > "${DASHBOARD_DST}/.env.local" << EOF
# Dashboard Mission Control - Configuracao
# Gerado automaticamente em $(date -Iseconds)

# Caminho para o banco de dados SQLite
DATABASE_PATH=${OC_DB:-${OPENCLAW_DIR}/store/data.db}

# Caminho raiz do projeto OpenClaw
PROJECT_ROOT=${OPENCLAW_DIR}

# Caminho para offices
OFFICES_PATH=${OPENCLAW_DIR}/offices

# NextAuth
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://localhost:${DASHBOARD_PORT}

# Porta
PORT=${DASHBOARD_PORT}
EOF

ok "Arquivo .env.local criado"

# --- 7.4 Atualizar paths no codigo ------------------------------------------
log "=== Atualizando paths hardcoded ==="

# Procurar por paths do NanoClaw no codigo do dashboard e substituir
find "${DASHBOARD_DST}/src" -name "*.ts" -o -name "*.tsx" | while read -r file; do
  if grep -q "nanoclaw" "${file}" 2>/dev/null; then
    # Substituir referencias a nanoclaw por openclaw (preservando case)
    sed -i "s|/nanoclaw/|/openclaw/|g" "${file}" 2>/dev/null || true
    sed -i "s|nanoclaw\.db|data.db|g" "${file}" 2>/dev/null || true
    log "  Atualizado: ${file}"
  fi
done

ok "Paths atualizados"

# --- 7.5 Build do dashboard -------------------------------------------------
log "=== Compilando dashboard ==="

cd "${DASHBOARD_DST}"
if npm run build >> "${LOG_FILE}" 2>&1; then
  ok "Build concluido com sucesso"
else
  warn "Build falhou - verifique o log: ${LOG_FILE}"
  warn "Pode ser necessario ajustar configuracoes manualmente"
fi

# --- 7.6 Configurar PM2 ----------------------------------------------------
log "=== Configurando PM2 ==="

if command -v pm2 &>/dev/null; then
  # Criar configuracao PM2
  cat > "${DASHBOARD_DST}/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: 'openclaw-dashboard',
    cwd: '${DASHBOARD_DST}',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      PORT: ${DASHBOARD_PORT}
    },
    max_memory_restart: '512M',
    log_file: '${OPENCLAW_DIR}/logs/dashboard.log',
    error_file: '${OPENCLAW_DIR}/logs/dashboard-error.log',
    time: true
  }]
};
EOF

  # Iniciar com PM2
  cd "${DASHBOARD_DST}"
  pm2 delete openclaw-dashboard 2>/dev/null || true
  pm2 start ecosystem.config.js >> "${LOG_FILE}" 2>&1
  pm2 save >> "${LOG_FILE}" 2>&1
  ok "Dashboard registrado no PM2"
else
  warn "PM2 nao encontrado. Instale com: npm install -g pm2"
  info "Apos instalar, execute:"
  info "  cd ${DASHBOARD_DST}"
  info "  pm2 start ecosystem.config.js"
  info "  pm2 save"
  info "  pm2 startup"
fi

# --- 7.7 Configurar Nginx (opcional) ----------------------------------------
log "=== Verificando Nginx ==="

if command -v nginx &>/dev/null; then
  NGINX_CONF="/etc/nginx/sites-available/openclaw-dashboard"

  cat > "/tmp/openclaw-dashboard-nginx.conf" << EOF
server {
    listen 80;
    server_name _;  # Altere para seu dominio

    location / {
        proxy_pass http://127.0.0.1:${DASHBOARD_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

  info "Configuracao Nginx gerada em /tmp/openclaw-dashboard-nginx.conf"
  info "Para ativar:"
  info "  sudo cp /tmp/openclaw-dashboard-nginx.conf ${NGINX_CONF}"
  info "  sudo ln -sf ${NGINX_CONF} /etc/nginx/sites-enabled/"
  info "  sudo nginx -t && sudo systemctl reload nginx"
else
  log "Nginx nao encontrado (opcional)"
fi

# --- 7.8 Testar dashboard ---------------------------------------------------
log "=== Testando dashboard ==="

sleep 3  # Aguardar startup

if curl -sf "http://localhost:${DASHBOARD_PORT}" > /dev/null 2>&1; then
  ok "Dashboard acessivel em http://localhost:${DASHBOARD_PORT}"
else
  warn "Dashboard nao respondendo na porta ${DASHBOARD_PORT}"
  warn "Verifique logs: pm2 logs openclaw-dashboard"
fi

echo ""
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DO DASHBOARD CONCLUIDA${NC}"
echo "  URL: http://localhost:${DASHBOARD_PORT}"
echo "============================================================"
log "Fim: $(date)"
