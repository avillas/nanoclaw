#!/usr/bin/env bash
# ============================================================================
# Fase 4: Migracao do Banco de Dados SQLite
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/04-migrate-db-$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }
die()  { fail "$*"; exit 1; }

echo ""
echo "============================================================"
echo "  Fase 4: Migracao do Banco de Dados"
echo "============================================================"
echo ""
log "Inicio: $(date)"

# --- Localizar bancos de dados -----------------------------------------------
NANO_DB="${EXPORT_DIR}/database/nanoclaw.db"
if [[ ! -f "${NANO_DB}" ]]; then
  die "Banco NanoClaw nao encontrado em ${NANO_DB}"
fi

# Encontrar banco OpenClaw
OC_DB=""
for candidate in "${OPENCLAW_DIR}/store/openclaw.db" "${OPENCLAW_DIR}/store/data.db" "${OPENCLAW_DIR}/store/nanoclaw.db"; do
  if [[ -f "${candidate}" ]]; then
    OC_DB="${candidate}"
    break
  fi
done

if [[ -z "${OC_DB}" ]]; then
  # Criar store/ e usar o banco exportado como base
  mkdir -p "${OPENCLAW_DIR}/store"
  OC_DB="${OPENCLAW_DIR}/store/data.db"
  log "Banco OpenClaw nao encontrado; sera criado: ${OC_DB}"
fi

log "NanoClaw DB: ${NANO_DB}"
log "OpenClaw DB: ${OC_DB}"

# --- 4.1 Backup do banco de destino -----------------------------------------
log "=== Backup do banco de destino ==="
if [[ -f "${OC_DB}" ]]; then
  cp "${OC_DB}" "${OC_DB}.bak-$(date +%Y%m%d_%H%M%S)"
  ok "Backup criado"
else
  log "Banco de destino ainda nao existe; sera criado"
fi

# --- 4.2 Comparar schemas ---------------------------------------------------
log "=== Comparando schemas ==="

NANO_SCHEMA=$(sqlite3 "${NANO_DB}" ".schema" 2>/dev/null)
OC_SCHEMA=""
if [[ -f "${OC_DB}" ]]; then
  OC_SCHEMA=$(sqlite3 "${OC_DB}" ".schema" 2>/dev/null || echo "")
fi

# Extrair nomes de tabelas do NanoClaw
NANO_TABLES=$(sqlite3 "${NANO_DB}" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>/dev/null)
OC_TABLES=""
if [[ -f "${OC_DB}" ]]; then
  OC_TABLES=$(sqlite3 "${OC_DB}" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>/dev/null || echo "")
fi

log "Tabelas NanoClaw: ${NANO_TABLES}"
log "Tabelas OpenClaw: ${OC_TABLES}"

# --- 4.3 Criar tabelas faltantes --------------------------------------------
log "=== Criando tabelas faltantes ==="

# Tabelas que precisam existir no OpenClaw
MIGRATION_SQL=$(cat <<'EOSQL'
-- Tabelas de dados operacionais (criar se nao existem)

CREATE TABLE IF NOT EXISTS chats (
  jid TEXT PRIMARY KEY,
  name TEXT,
  last_message_time INTEGER,
  channel TEXT DEFAULT 'whatsapp',
  is_group INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_jid TEXT NOT NULL,
  sender TEXT,
  content TEXT,
  timestamp INTEGER NOT NULL,
  is_from_me INTEGER DEFAULT 0,
  is_bot_message INTEGER DEFAULT 0,
  FOREIGN KEY (chat_jid) REFERENCES chats(jid)
);

CREATE TABLE IF NOT EXISTS registered_groups (
  jid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder TEXT NOT NULL,
  trigger_pattern TEXT,
  added_at TEXT DEFAULT (datetime('now')),
  containerConfig TEXT DEFAULT '{}',
  requiresTrigger INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_folder TEXT NOT NULL,
  chat_jid TEXT,
  prompt TEXT,
  script TEXT,
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('cron','interval','once')),
  schedule_value TEXT NOT NULL,
  next_run INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS task_run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  run_at TEXT DEFAULT (datetime('now')),
  duration_ms INTEGER,
  status TEXT,
  result TEXT,
  error TEXT,
  FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
);

CREATE TABLE IF NOT EXISTS router_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  group_folder TEXT PRIMARY KEY,
  session_id TEXT NOT NULL
);

-- Tabelas customizadas (offices system)

CREATE TABLE IF NOT EXISTS agent_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office TEXT,
  agent_name TEXT,
  group_folder TEXT,
  date TEXT NOT NULL,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cache_creation_tokens INTEGER DEFAULT 0,
  cache_read_tokens INTEGER DEFAULT 0,
  cost_brl REAL DEFAULT 0.0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  office TEXT NOT NULL,
  group_folder TEXT,
  status TEXT DEFAULT 'running',
  current_stage INTEGER DEFAULT 0,
  total_stages INTEGER DEFAULT 0,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  execution_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  output TEXT,
  score REAL,
  duration_ms INTEGER,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (execution_id) REFERENCES pipeline_executions(id)
);

-- Indices de performance
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_jid);
CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON scheduled_tasks(next_run);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON scheduled_tasks(status);
CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_run_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_costs_date ON agent_costs(date);
CREATE INDEX IF NOT EXISTS idx_agent_costs_office ON agent_costs(office);
CREATE INDEX IF NOT EXISTS idx_pipeline_status ON pipeline_executions(status);
EOSQL
)

sqlite3 "${OC_DB}" "${MIGRATION_SQL}" >> "${LOG_FILE}" 2>&1
ok "Schema atualizado"

# --- 4.4 Migrar dados -------------------------------------------------------
log "=== Migrando dados ==="

# Tabelas a migrar (exceto router_state e sessions que sao regenerados)
MIGRATE_TABLES="chats messages registered_groups scheduled_tasks task_run_logs agent_costs pipeline_executions pipeline_stages"

for tbl in ${MIGRATE_TABLES}; do
  NANO_COUNT=$(sqlite3 "${NANO_DB}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null || echo "0")

  if [[ "${NANO_COUNT}" -eq 0 ]]; then
    log "Tabela ${tbl}: vazia, pulando"
    continue
  fi

  # Exportar como INSERT statements
  sqlite3 "${NANO_DB}" ".mode insert ${tbl}" ".output /tmp/migrate_${tbl}.sql" "SELECT * FROM ${tbl};" 2>/dev/null

  if [[ -f "/tmp/migrate_${tbl}.sql" ]] && [[ -s "/tmp/migrate_${tbl}.sql" ]]; then
    # Usar INSERT OR IGNORE para evitar conflitos de chave
    sed -i 's/INSERT INTO/INSERT OR IGNORE INTO/g' "/tmp/migrate_${tbl}.sql"

    sqlite3 "${OC_DB}" < "/tmp/migrate_${tbl}.sql" >> "${LOG_FILE}" 2>&1 || warn "Alguns registros de ${tbl} nao puderam ser importados"

    OC_COUNT=$(sqlite3 "${OC_DB}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null || echo "?")
    ok "Tabela ${tbl}: ${NANO_COUNT} registros (destino agora tem: ${OC_COUNT})"
  fi

  rm -f "/tmp/migrate_${tbl}.sql"
done

# --- 4.5 Validar integridade ------------------------------------------------
log "=== Validando integridade ==="

INTEGRITY=$(sqlite3 "${OC_DB}" "PRAGMA integrity_check;" 2>/dev/null)
if [[ "${INTEGRITY}" == "ok" ]]; then
  ok "Integridade do banco OK"
else
  warn "Problemas de integridade: ${INTEGRITY}"
fi

# Verificar foreign keys
FK_CHECK=$(sqlite3 "${OC_DB}" "PRAGMA foreign_key_check;" 2>/dev/null || echo "")
if [[ -z "${FK_CHECK}" ]]; then
  ok "Foreign keys OK"
else
  warn "Problemas de foreign key: ${FK_CHECK}"
fi

# --- 4.6 Estatisticas finais ------------------------------------------------
log "=== Estatisticas finais ==="
echo "" >> "${LOG_FILE}"
echo "=== Estado final do banco ===" >> "${LOG_FILE}"
for tbl in ${MIGRATE_TABLES}; do
  COUNT=$(sqlite3 "${OC_DB}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null || echo "?")
  log "  ${tbl}: ${COUNT} registros"
done

echo ""
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DO BANCO CONCLUIDA${NC}"
echo "  Banco de destino: ${OC_DB}"
echo "============================================================"
log "Fim: $(date)"
