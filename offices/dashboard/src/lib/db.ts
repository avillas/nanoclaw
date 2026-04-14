import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

export function getDb(): Database.Database | null {
  if (db) return db;

  const dbPath = process.env.NANOCLAW_DB_PATH || path.resolve(process.cwd(), '..', 'store', 'messages.db');

  try {
    db = new Database(dbPath, { readonly: true });
    db.pragma('journal_mode = WAL');
    return db;
  } catch {
    console.warn(`[NanoClaw DB] Could not open database at ${dbPath}. Using mock data.`);
    return null;
  }
}

export function getMessages(limit = 50): any[] {
  const database = getDb();
  if (!database) return [];

  try {
    const stmt = database.prepare(
      'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?'
    );
    return stmt.all(limit) as any[];
  } catch {
    return [];
  }
}

export function getRegisteredGroups(): any[] {
  const database = getDb();
  if (!database) return [];

  try {
    const stmt = database.prepare('SELECT * FROM registered_groups');
    return stmt.all() as any[];
  } catch {
    return [];
  }
}

/** Get cost records for a specific office within a date range */
export function getOfficeCosts(office: string, dateFrom: string, dateTo: string): any[] {
  const database = getDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT date, tokens_in, tokens_out, tokens_cache_read, tokens_cache_write,
             cost_usd, agent_name, model_used
      FROM agent_costs WHERE office = ? AND date >= ? AND date <= ?
      ORDER BY recorded_at DESC
    `).all(office, dateFrom, dateTo) as any[];
  } catch {
    return [];
  }
}

/** Get daily cost summary grouped by office */
export function getDailyCostSummary(date: string): Array<{
  office: string; total_tokens_in: number; total_tokens_out: number; total_cost_usd: number;
}> {
  const database = getDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT office,
             SUM(tokens_in) as total_tokens_in,
             SUM(tokens_out) as total_tokens_out,
             SUM(cost_usd) as total_cost_usd
      FROM agent_costs WHERE date = ? GROUP BY office
    `).all(date) as any[];
  } catch {
    return [];
  }
}

/** Get monthly cost summary grouped by office */
export function getMonthlyCostSummary(yearMonth: string): Array<{
  office: string; total_tokens_in: number; total_tokens_out: number; total_cost_usd: number;
}> {
  const database = getDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT office,
             SUM(tokens_in) as total_tokens_in,
             SUM(tokens_out) as total_tokens_out,
             SUM(cost_usd) as total_cost_usd
      FROM agent_costs WHERE date LIKE ? GROUP BY office
    `).all(`${yearMonth}%`) as any[];
  } catch {
    return [];
  }
}

/** Get pipeline executions with optional status filter */
export function getPipelineExecutions(status?: string, limit = 20): any[] {
  const database = getDb();
  if (!database) return [];

  try {
    if (status) {
      return database.prepare(`
        SELECT * FROM pipeline_executions WHERE status = ?
        ORDER BY started_at DESC LIMIT ?
      `).all(status, limit) as any[];
    }
    return database.prepare(`
      SELECT * FROM pipeline_executions ORDER BY started_at DESC LIMIT ?
    `).all(limit) as any[];
  } catch {
    return [];
  }
}

/** Get stages for a pipeline execution */
export function getPipelineStages(executionId: string): any[] {
  const database = getDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT * FROM pipeline_stages WHERE execution_id = ?
      ORDER BY position ASC
    `).all(executionId) as any[];
  } catch {
    return [];
  }
}

/** Get agent-level cost totals for today */
export function getAgentCostsToday(date: string): Array<{
  agent_name: string; office: string; total_cost: number; total_tokens: number;
}> {
  const database = getDb();
  if (!database) return [];

  try {
    return database.prepare(`
      SELECT agent_name, office,
             SUM(cost_usd) as total_cost,
             SUM(tokens_in + tokens_out) as total_tokens
      FROM agent_costs WHERE date = ?
      GROUP BY agent_name, office
    `).all(date) as any[];
  } catch {
    return [];
  }
}
