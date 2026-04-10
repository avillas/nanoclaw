#!/usr/bin/env bash
# ============================================================================
# Fase 4: Migracao de Dados (DB NanoClaw -> Estrutura OpenClaw)
# Projeto: Migracao NanoClaw -> OpenClaw
# ============================================================================
#
# OpenClaw nao usa SQLite da mesma forma que NanoClaw.
# OpenClaw armazena dados em:
#   - agents/<id>/sessions/sessions.json (historico de chats)
#   - cron/jobs.json (tarefas agendadas)
#   - workspace/memory/*.md (memoria diaria)
#
# Este script:
#   1. Exporta dados do SQLite do NanoClaw
#   2. Converte scheduled_tasks -> cron/jobs.json (formato OpenClaw)
#   3. Converte registered_groups -> sessions em sessions.json
#   4. Preserva o DB NanoClaw completo como referencia
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/config.env" 2>/dev/null || true
source "${SCRIPT_DIR}/.last-export" 2>/dev/null || true

OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
EXPORT_DIR="${EXPORT_DIR:-${SCRIPT_DIR}/../export-latest}"
LOG_DIR="${SCRIPT_DIR}/../logs"
LOG_FILE="${LOG_DIR}/04-migrate-db-$(date +%Y%m%d_%H%M%S).log"

mkdir -p "${LOG_DIR}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[INFO]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()   { echo -e "${GREEN}[OK]${NC} $*" | tee -a "${LOG_FILE}"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "${LOG_FILE}"; }
fail() { echo -e "${RED}[FAIL]${NC} $*" | tee -a "${LOG_FILE}"; }

echo ""
echo "============================================================"
echo "  Fase 4: Migracao de Dados"
echo "============================================================"
echo ""
log "Inicio: $(date)"

# --- Localizar banco NanoClaw ------------------------------------------------
NANO_DB=""
for candidate in \
  "${EXPORT_DIR}/database/nanoclaw.db" \
  "${EXPORT_DIR}/database/messages.db" \
  "${EXPORT_DIR}/database/data.db"; do
  if [[ -f "${candidate}" ]]; then
    NANO_DB="${candidate}"
    break
  fi
done

# Fallback: procurar qualquer .db no diretorio de exportacao
if [[ -z "${NANO_DB}" ]]; then
  NANO_DB=$(find "${EXPORT_DIR}/database" -name "*.db" -type f 2>/dev/null | head -1 || echo "")
fi

if [[ -z "${NANO_DB}" ]]; then
  warn "Banco NanoClaw nao encontrado em ${EXPORT_DIR}/database/"
  warn "Pulando migracao de dados"
  exit 0
fi

log "NanoClaw DB: ${NANO_DB} ($(du -h "${NANO_DB}" | cut -f1))"

# --- 4.1 Preservar banco completo como referencia ----------------------------
log "=== Preservando banco NanoClaw ==="

mkdir -p "${OPENCLAW_DIR}/workspace/.migration-ref"
cp "${NANO_DB}" "${OPENCLAW_DIR}/workspace/.migration-ref/nanoclaw.db"
ok "Banco original preservado em workspace/.migration-ref/nanoclaw.db"

# --- 4.2 Converter scheduled_tasks -> cron/jobs.json -------------------------
log "=== Migrando tarefas agendadas ==="

mkdir -p "${OPENCLAW_DIR}/cron"

TASK_COUNT=$(sqlite3 "${NANO_DB}" "SELECT COUNT(*) FROM scheduled_tasks WHERE status='active';" 2>/dev/null || echo "0")
log "Tarefas ativas no NanoClaw: ${TASK_COUNT}"

if [[ "${TASK_COUNT}" -gt 0 ]]; then
  # Gerar jobs.json no formato OpenClaw
  node -e "
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const path = require('path');

    let db;
    try {
      db = new Database('${NANO_DB}', { readonly: true });
    } catch(e) {
      // Fallback: usar sqlite3 CLI
      console.error('better-sqlite3 nao disponivel, gerando via template');
      process.exit(1);
    }

    const tasks = db.prepare(\"SELECT * FROM scheduled_tasks WHERE status='active'\").all();

    const jobs = tasks.map((t, i) => {
      let schedule = {};
      switch(t.schedule_type) {
        case 'cron':
          schedule = { kind: 'cron', expr: t.schedule_value, tz: process.env.TZ || 'America/Sao_Paulo' };
          break;
        case 'interval':
          schedule = { kind: 'interval', ms: parseInt(t.schedule_value) };
          break;
        case 'once':
          schedule = { kind: 'once', at: t.schedule_value };
          break;
      }

      return {
        id: 'migrated-' + (t.id || i),
        name: 'Migrated task ' + (t.id || i),
        description: (t.prompt || '').substring(0, 100),
        enabled: true,
        schedule,
        payload: {
          kind: 'agentTurn',
          message: t.prompt || t.script || ''
        },
        sessionTarget: 'main',
        delivery: { mode: 'silent' }
      };
    });

    const result = { version: 1, jobs };
    const outPath = '${OPENCLAW_DIR}/cron/jobs.json';

    // Mesclar com existente se houver
    if (fs.existsSync(outPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
        existing.jobs = [...(existing.jobs || []), ...jobs];
        fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
      } catch(e) {
        fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      }
    } else {
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    }

    console.log('Jobs migrados: ' + jobs.length);
    db.close();
  " >> "${LOG_FILE}" 2>&1 && ok "Tarefas migradas para cron/jobs.json" || {
    # Fallback sem better-sqlite3: usar sqlite3 CLI
    log "Usando sqlite3 CLI como fallback..."

    JOBS_JSON="${OPENCLAW_DIR}/cron/jobs.json"
    if [[ ! -f "${JOBS_JSON}" ]]; then
      echo '{"version":1,"jobs":[]}' > "${JOBS_JSON}"
    fi

    # Exportar tarefas e gerar JSON manualmente
    sqlite3 -json "${NANO_DB}" "SELECT id, group_folder, prompt, script, schedule_type, schedule_value FROM scheduled_tasks WHERE status='active';" 2>/dev/null | \
    node -e "
      const fs = require('fs');
      let input = '';
      process.stdin.on('data', d => input += d);
      process.stdin.on('end', () => {
        const tasks = JSON.parse(input || '[]');
        const jobs = tasks.map(t => ({
          id: 'migrated-' + t.id,
          name: 'Migrated task ' + t.id,
          description: (t.prompt || '').substring(0, 100),
          enabled: true,
          schedule: t.schedule_type === 'cron'
            ? { kind: 'cron', expr: t.schedule_value, tz: 'America/Sao_Paulo' }
            : t.schedule_type === 'interval'
              ? { kind: 'interval', ms: parseInt(t.schedule_value) }
              : { kind: 'once', at: t.schedule_value },
          payload: { kind: 'agentTurn', message: t.prompt || t.script || '' },
          sessionTarget: 'main',
          delivery: { mode: 'silent' }
        }));

        const existing = JSON.parse(fs.readFileSync('${JOBS_JSON}', 'utf-8'));
        existing.jobs = [...(existing.jobs || []), ...jobs];
        fs.writeFileSync('${JOBS_JSON}', JSON.stringify(existing, null, 2));
        console.log('Jobs migrados: ' + jobs.length);
      });
    " >> "${LOG_FILE}" 2>&1 && ok "Tarefas migradas (fallback)" || warn "Falha ao migrar tarefas"
  }
else
  log "Nenhuma tarefa ativa para migrar"
fi

# --- 4.3 Converter registered_groups -> sessions.json -----------------------
log "=== Migrando sessoes de grupo ==="

mkdir -p "${OPENCLAW_DIR}/agents/main/sessions"
SESSIONS_FILE="${OPENCLAW_DIR}/agents/main/sessions/sessions.json"

GROUP_COUNT=$(sqlite3 "${NANO_DB}" "SELECT COUNT(*) FROM registered_groups;" 2>/dev/null || echo "0")
log "Grupos registrados no NanoClaw: ${GROUP_COUNT}"

if [[ "${GROUP_COUNT}" -gt 0 ]]; then
  # Gerar sessions.json com os grupos registrados
  sqlite3 -json "${NANO_DB}" "SELECT jid, name, folder FROM registered_groups;" 2>/dev/null | \
  node -e "
    const fs = require('fs');
    let input = '';
    process.stdin.on('data', d => input += d);
    process.stdin.on('end', () => {
      const groups = JSON.parse(input || '[]');
      const sessions = {};

      groups.forEach(g => {
        // Inferir canal do JID (whatsapp:xxx@g.us, telegram:-100xxx, etc)
        let channel = 'unknown';
        if (g.jid.includes('@g.us') || g.jid.includes('@s.whatsapp')) channel = 'whatsapp';
        else if (g.jid.startsWith('-100') || g.jid.match(/^-?\\d+$/)) channel = 'telegram';
        else if (g.jid.startsWith('C') || g.jid.startsWith('D')) channel = 'slack';
        else if (g.jid.match(/^\\d{17,}/)) channel = 'discord';

        const key = channel + ':group:' + g.jid;
        sessions[key] = {
          displayName: g.name || g.folder,
          migratedFrom: 'nanoclaw',
          originalFolder: g.folder,
          lastSeen: Date.now()
        };
      });

      // Mesclar com existente
      let existing = { sessions: {} };
      if (fs.existsSync('${SESSIONS_FILE}')) {
        try { existing = JSON.parse(fs.readFileSync('${SESSIONS_FILE}', 'utf-8')); } catch(e) {}
      }
      existing.sessions = { ...existing.sessions, ...sessions };
      fs.writeFileSync('${SESSIONS_FILE}', JSON.stringify(existing, null, 2));
      console.log('Sessoes migradas: ' + Object.keys(sessions).length);
    });
  " >> "${LOG_FILE}" 2>&1 && ok "Sessoes migradas para sessions.json" || warn "Falha ao migrar sessoes"
else
  log "Nenhum grupo registrado para migrar"
fi

# --- 4.4 Exportar estatisticas para referencia --------------------------------
log "=== Exportando estatisticas ==="

STATS_FILE="${OPENCLAW_DIR}/workspace/.migration-ref/db-stats.txt"
echo "=== Estatisticas do banco NanoClaw (migrado em $(date)) ===" > "${STATS_FILE}"
TABLES=$(sqlite3 "${NANO_DB}" ".tables" 2>/dev/null || echo "")
for tbl in ${TABLES}; do
  COUNT=$(sqlite3 "${NANO_DB}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null || echo "?")
  echo "${tbl}: ${COUNT} registros" >> "${STATS_FILE}"
done
ok "Estatisticas salvas em ${STATS_FILE}"

# --- 4.5 Exportar CSVs de dados customizados ---------------------------------
log "=== Exportando dados customizados em CSV ==="

mkdir -p "${OPENCLAW_DIR}/workspace/.migration-ref/csv"
for tbl in agent_costs pipeline_executions pipeline_stages task_run_logs; do
  if sqlite3 "${NANO_DB}" "SELECT COUNT(*) FROM ${tbl};" &>/dev/null 2>&1; then
    COUNT=$(sqlite3 "${NANO_DB}" "SELECT COUNT(*) FROM ${tbl};" 2>/dev/null)
    if [[ "${COUNT}" -gt 0 ]]; then
      sqlite3 -header -csv "${NANO_DB}" "SELECT * FROM ${tbl};" > "${OPENCLAW_DIR}/workspace/.migration-ref/csv/${tbl}.csv" 2>/dev/null
      log "  ${tbl}: ${COUNT} registros exportados"
    fi
  fi
done
ok "CSVs exportados"

echo ""
echo "============================================================"
echo -e "${GREEN}  MIGRACAO DE DADOS CONCLUIDA${NC}"
echo "  Tarefas: cron/jobs.json"
echo "  Sessoes: agents/main/sessions/sessions.json"
echo "  Referencia: workspace/.migration-ref/"
echo "============================================================"
log "Fim: $(date)"
