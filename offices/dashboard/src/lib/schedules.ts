import { CronExpressionParser } from 'cron-parser';
import { getWritableDb, getDb, getRegisteredGroups } from './db';

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused';
  created_at: string;
  context_mode: 'group' | 'isolated';
  script: string | null;
}

export interface ScheduleWithGroup extends ScheduledTask {
  group_name: string | null;
}

export interface TaskRunLog {
  id: number;
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

export interface CreateScheduleInput {
  id: string;
  group_folder: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode?: 'group' | 'isolated';
  script?: string | null;
  status?: 'active' | 'paused';
}

export type UpdateScheduleInput = Partial<
  Omit<CreateScheduleInput, 'id'>
>;

const TIMEZONE = process.env.TZ || 'UTC';

function computeNextRun(
  type: 'cron' | 'interval' | 'once',
  value: string,
  anchor: Date = new Date(),
): string | null {
  if (type === 'once') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (type === 'cron') {
    const interval = CronExpressionParser.parse(value, { tz: TIMEZONE });
    return interval.next().toISOString();
  }
  if (type === 'interval') {
    const ms = parseInt(value, 10);
    if (!ms || ms <= 0) return null;
    return new Date(anchor.getTime() + ms).toISOString();
  }
  return null;
}

export function validateScheduleValue(
  type: 'cron' | 'interval' | 'once',
  value: string,
): { valid: true } | { valid: false; error: string } {
  try {
    if (type === 'cron') {
      CronExpressionParser.parse(value, { tz: TIMEZONE });
    } else if (type === 'interval') {
      const ms = parseInt(value, 10);
      if (!ms || ms <= 0) {
        return { valid: false, error: 'Interval must be a positive number of milliseconds' };
      }
    } else if (type === 'once') {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return { valid: false, error: 'Invalid ISO date' };
      }
    } else {
      return { valid: false, error: 'Unknown schedule type' };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid schedule value',
    };
  }
}

function lookupGroupByFolder(folder: string): { jid: string; name: string } | null {
  const groups = getRegisteredGroups();
  const match = groups.find((g) => g.folder === folder);
  return match ? { jid: match.jid, name: match.name } : null;
}

export function listSchedules(): ScheduleWithGroup[] {
  const db = getDb();
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT s.*, g.name AS group_name
       FROM scheduled_tasks s
       LEFT JOIN registered_groups g ON g.folder = s.group_folder
       ORDER BY
         CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
         s.next_run ASC`,
    )
    .all() as ScheduleWithGroup[];
  return rows;
}

export function getSchedule(id: string): ScheduleWithGroup | null {
  const db = getDb();
  if (!db) return null;
  return (db
    .prepare(
      `SELECT s.*, g.name AS group_name
       FROM scheduled_tasks s
       LEFT JOIN registered_groups g ON g.folder = s.group_folder
       WHERE s.id = ?`,
    )
    .get(id) as ScheduleWithGroup) ?? null;
}

export function getRecentRuns(taskId: string, limit = 20): TaskRunLog[] {
  const db = getDb();
  if (!db) return [];
  return db
    .prepare(
      `SELECT id, task_id, run_at, duration_ms, status, result, error
       FROM task_run_logs
       WHERE task_id = ?
       ORDER BY run_at DESC
       LIMIT ?`,
    )
    .all(taskId, limit) as TaskRunLog[];
}

export function createSchedule(input: CreateScheduleInput): ScheduledTask {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');

  const validation = validateScheduleValue(input.schedule_type, input.schedule_value);
  if (!validation.valid) throw new Error(validation.error);

  const group = lookupGroupByFolder(input.group_folder);
  if (!group) throw new Error(`Group not registered: ${input.group_folder}`);

  const existing = db
    .prepare('SELECT id FROM scheduled_tasks WHERE id = ?')
    .get(input.id);
  if (existing) throw new Error(`Task id already exists: ${input.id}`);

  const nextRun = computeNextRun(input.schedule_type, input.schedule_value);
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO scheduled_tasks
       (id, group_folder, chat_jid, prompt, schedule_type, schedule_value,
        context_mode, next_run, status, created_at, script)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.group_folder,
    group.jid,
    input.prompt,
    input.schedule_type,
    input.schedule_value,
    input.context_mode ?? 'group',
    nextRun,
    input.status ?? 'active',
    now,
    input.script ?? null,
  );

  return getSchedule(input.id) as ScheduledTask;
}

export function updateSchedule(
  id: string,
  patch: UpdateScheduleInput,
): ScheduledTask {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');

  const current = db
    .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    .get(id) as ScheduledTask | undefined;
  if (!current) throw new Error(`Task not found: ${id}`);

  const next = { ...current, ...patch };

  const scheduleChanged =
    patch.schedule_type !== undefined || patch.schedule_value !== undefined;
  if (scheduleChanged) {
    const validation = validateScheduleValue(
      next.schedule_type,
      next.schedule_value,
    );
    if (!validation.valid) throw new Error(validation.error);
  }

  let nextRun = current.next_run;
  if (scheduleChanged && next.status === 'active') {
    nextRun = computeNextRun(next.schedule_type, next.schedule_value);
  }

  if (patch.group_folder && patch.group_folder !== current.group_folder) {
    const group = lookupGroupByFolder(patch.group_folder);
    if (!group) throw new Error(`Group not registered: ${patch.group_folder}`);
    next.chat_jid = group.jid;
  }

  db.prepare(
    `UPDATE scheduled_tasks SET
       group_folder = ?, chat_jid = ?, prompt = ?, schedule_type = ?,
       schedule_value = ?, context_mode = ?, status = ?, script = ?,
       next_run = ?
     WHERE id = ?`,
  ).run(
    next.group_folder,
    next.chat_jid,
    next.prompt,
    next.schedule_type,
    next.schedule_value,
    next.context_mode,
    next.status,
    next.script ?? null,
    nextRun,
    id,
  );

  return getSchedule(id) as ScheduledTask;
}

export function deleteSchedule(id: string): void {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');
  const result = db
    .prepare('DELETE FROM scheduled_tasks WHERE id = ?')
    .run(id);
  if (result.changes === 0) throw new Error(`Task not found: ${id}`);
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
}

export function toggleScheduleStatus(id: string): ScheduledTask {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');
  const current = db
    .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    .get(id) as ScheduledTask | undefined;
  if (!current) throw new Error(`Task not found: ${id}`);

  const newStatus = current.status === 'active' ? 'paused' : 'active';
  let nextRun = current.next_run;
  if (newStatus === 'active') {
    nextRun = computeNextRun(current.schedule_type, current.schedule_value);
  }
  db.prepare(
    `UPDATE scheduled_tasks SET status = ?, next_run = ? WHERE id = ?`,
  ).run(newStatus, nextRun, id);

  return getSchedule(id) as ScheduledTask;
}

export function runNow(id: string): ScheduledTask {
  const db = getWritableDb();
  if (!db) throw new Error('Database unavailable');
  const current = db
    .prepare('SELECT * FROM scheduled_tasks WHERE id = ?')
    .get(id) as ScheduledTask | undefined;
  if (!current) throw new Error(`Task not found: ${id}`);

  db.prepare(
    `UPDATE scheduled_tasks SET next_run = ?, status = 'active' WHERE id = ?`,
  ).run(new Date().toISOString(), id);

  return getSchedule(id) as ScheduledTask;
}

export function listRegisteredGroupsForDropdown(): Array<{
  folder: string;
  name: string;
  jid: string;
}> {
  const groups = getRegisteredGroups();
  return groups.map((g) => ({ folder: g.folder, name: g.name, jid: g.jid }));
}
