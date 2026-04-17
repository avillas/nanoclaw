'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, Clock, Loader2, AlertCircle, CheckCircle, PlayCircle, PauseCircle, Trash2, Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { fetchJson } from '@/lib/api-fetch';

type ScheduleType = 'cron' | 'interval' | 'once';
type ContextMode = 'group' | 'isolated';
type Status = 'active' | 'paused';

interface Schedule {
  id: string;
  group_folder: string;
  group_name: string | null;
  chat_jid: string;
  prompt: string;
  schedule_type: ScheduleType;
  schedule_value: string;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: Status;
  context_mode: ContextMode;
  script: string | null;
}

interface RunLog {
  id: number;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

interface Group {
  folder: string;
  name: string;
  jid: string;
}

interface ScheduleModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  schedule: Schedule | null;
  onClose: () => void;
  onSaved: () => void;
}

const CRON_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'A cada hora', value: '0 * * * *' },
  { label: 'Diário 03:00 (BRT = 06:00 UTC)', value: '0 6 * * *' },
  { label: 'Diário 09:00 (BRT = 12:00 UTC)', value: '0 12 * * *' },
  { label: 'Segunda 09:00 BRT', value: '0 12 * * 1' },
  { label: 'Domingo 04:00 BRT', value: '0 7 * * 0' },
  { label: 'Todo dia 1 às 10:00 BRT', value: '0 13 1 * *' },
];

export function ScheduleModal({ open, mode, schedule, onClose, onSaved }: ScheduleModalProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    id: '',
    group_folder: '',
    prompt: '',
    schedule_type: 'cron' as ScheduleType,
    schedule_value: '0 6 * * *',
    context_mode: 'group' as ContextMode,
    status: 'active' as Status,
    script: '',
  });

  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccess(false);
    fetchJson<Group[]>('/api/schedules/groups').then((data) => {
      if (Array.isArray(data)) setGroups(data);
    });
    if (mode === 'edit' && schedule) {
      setForm({
        id: schedule.id,
        group_folder: schedule.group_folder,
        prompt: schedule.prompt,
        schedule_type: schedule.schedule_type,
        schedule_value: schedule.schedule_value,
        context_mode: schedule.context_mode,
        status: schedule.status,
        script: schedule.script ?? '',
      });
      fetchJson<{ task: Schedule; runs: RunLog[] }>(`/api/schedules/${schedule.id}`).then((d) => {
        if (d?.runs) setRuns(d.runs);
      });
    } else {
      setForm({
        id: '',
        group_folder: '',
        prompt: '',
        schedule_type: 'cron',
        schedule_value: '0 6 * * *',
        context_mode: 'group',
        status: 'active',
        script: '',
      });
      setRuns([]);
    }
  }, [open, mode, schedule]);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const canSubmit =
    !submitting &&
    form.group_folder.trim() &&
    form.prompt.trim() &&
    form.schedule_value.trim() &&
    (mode === 'edit' || form.id.trim());

  const save = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        group_folder: form.group_folder,
        prompt: form.prompt,
        schedule_type: form.schedule_type,
        schedule_value: form.schedule_value,
        context_mode: form.context_mode,
        status: form.status,
        script: form.script.trim() ? form.script : null,
      };
      if (mode === 'create') payload.id = form.id;

      const url = mode === 'create' ? '/api/schedules' : `/api/schedules/${schedule!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setSuccess(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }, [form, mode, schedule, onSaved, onClose]);

  const runNow = useCallback(async () => {
    if (!schedule) return;
    setSubmitting(true);
    try {
      await fetch(`/api/schedules/${schedule.id}/run-now`, { method: 'POST' });
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [schedule, onSaved, onClose]);

  const toggleStatus = useCallback(async () => {
    if (!schedule) return;
    setSubmitting(true);
    try {
      await fetch(`/api/schedules/${schedule.id}/toggle`, { method: 'POST' });
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [schedule, onSaved, onClose]);

  const doDelete = useCallback(async () => {
    if (!schedule) return;
    if (!confirm(`Delete schedule "${schedule.id}"? This also removes its run history.`)) return;
    setSubmitting(true);
    try {
      await fetch(`/api/schedules/${schedule.id}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [schedule, onSaved, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {mode === 'create' ? 'New Schedule' : schedule?.id}
              </h2>
              <p className="text-xs text-text-muted">
                {mode === 'create' ? 'Create a scheduled agent task' : 'Edit scheduled task'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-2 transition-colors">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 space-y-4">
          {/* ID (create only) */}
          {mode === 'create' && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">ID</label>
              <input
                value={form.id}
                onChange={(e) =>
                  update('id', e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
                }
                placeholder="dream-nightly"
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono"
              />
              <p className="text-[10px] text-text-muted mt-1">
                Unique identifier, lowercase-hyphens. Cannot be changed later.
              </p>
            </div>
          )}

          {/* Group */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Group</label>
            <select
              value={form.group_folder}
              onChange={(e) => update('group_folder', e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm"
            >
              <option value="">— select group —</option>
              {groups.map((g) => (
                <option key={g.folder} value={g.folder}>
                  {g.name} ({g.folder})
                </option>
              ))}
            </select>
          </div>

          {/* Schedule type */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Schedule Type</label>
            <div className="flex gap-2">
              {(['cron', 'interval', 'once'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update('schedule_type', t)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    form.schedule_type === t
                      ? 'bg-accent/10 text-accent border-accent/20'
                      : 'bg-surface-2 text-text-muted border-transparent',
                  )}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule value */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {form.schedule_type === 'cron'
                ? 'Cron Expression (TZ = server local)'
                : form.schedule_type === 'interval'
                ? 'Interval (milliseconds)'
                : 'ISO Date (one-shot)'}
            </label>
            <input
              value={form.schedule_value}
              onChange={(e) => update('schedule_value', e.target.value)}
              placeholder={
                form.schedule_type === 'cron'
                  ? '0 6 * * *'
                  : form.schedule_type === 'interval'
                  ? '3600000'
                  : '2026-04-20T15:00:00Z'
              }
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono"
            />
            {form.schedule_type === 'cron' && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => update('schedule_value', p.value)}
                    className="px-2 py-1 text-[10px] font-mono rounded bg-surface-2 text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Prompt</label>
            <textarea
              value={form.prompt}
              onChange={(e) => update('prompt', e.target.value)}
              rows={5}
              placeholder="Rode /dream conforme /workspace/skills/dream/SKILL.md..."
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm font-mono"
            />
          </div>

          {/* Context mode + status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Context</label>
              <select
                value={form.context_mode}
                onChange={(e) => update('context_mode', e.target.value as ContextMode)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm"
              >
                <option value="group">group (shares session)</option>
                <option value="isolated">isolated (fresh session)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => update('status', e.target.value as Status)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm"
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
              </select>
            </div>
          </div>

          {/* Script (advanced) */}
          <details className="border border-border rounded-lg">
            <summary className="px-3 py-2 cursor-pointer text-xs text-text-muted hover:text-text-primary">
              Advanced — preflight script (optional)
            </summary>
            <div className="p-3 border-t border-border">
              <p className="text-[10px] text-text-muted mb-2">
                Bash script that runs first. If it prints <code>{`{"wakeAgent": false}`}</code>, the agent is skipped.
                Reduces cost on frequent tasks.
              </p>
              <textarea
                value={form.script}
                onChange={(e) => update('script', e.target.value)}
                rows={4}
                placeholder='echo &apos;{"wakeAgent": true}&apos;'
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs font-mono"
              />
            </div>
          </details>

          {/* Runs history (edit only) */}
          {mode === 'edit' && runs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Recent runs ({runs.length})
              </label>
              <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                {runs.map((r) => (
                  <div key={r.id} className="px-3 py-2 text-xs flex items-center gap-3">
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      r.status === 'success' ? 'bg-status-online' : 'bg-status-error',
                    )} />
                    <span className="font-mono text-text-muted">
                      {new Date(r.run_at).toLocaleString('pt-BR')}
                    </span>
                    <span className="text-text-muted">{r.duration_ms}ms</span>
                    <span className="flex-1 truncate text-text-secondary">
                      {r.error ?? r.result ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-status-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-status-online">
              <CheckCircle className="w-4 h-4" />
              <span>Saved</span>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-border flex items-center justify-between gap-2">
          {mode === 'edit' && schedule && (
            <div className="flex gap-1.5">
              <button
                onClick={runNow}
                disabled={submitting}
                title="Run now"
                className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
              </button>
              <button
                onClick={toggleStatus}
                disabled={submitting}
                title={schedule.status === 'active' ? 'Pause' : 'Activate'}
                className="p-2 rounded-lg bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors disabled:opacity-50"
              >
                {schedule.status === 'active' ? (
                  <PauseCircle className="w-4 h-4" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={doDelete}
                disabled={submitting}
                title="Delete"
                className="p-2 rounded-lg bg-red-500/10 text-status-error hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
              {mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
