'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { ScheduleModal } from '@/components/modals/schedule-modal';
import {
  Clock, Plus, Filter, PlayCircle, PauseCircle, Zap, CheckCircle2, XCircle,
  Calendar, AlarmClock,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';

type Status = 'active' | 'paused';

interface Schedule {
  id: string;
  group_folder: string;
  group_name: string | null;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: Status;
  context_mode: 'group' | 'isolated';
  script: string | null;
  created_at: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = t - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  const sign = diff > 0 ? 'in ' : '';
  const suffix = diff > 0 ? '' : ' ago';
  if (abs < 60_000) return diff > 0 ? 'in <1m' : 'just now';
  if (mins < 60) return `${sign}${mins}m${suffix}`;
  if (hours < 48) return `${sign}${hours}h${suffix}`;
  return `${sign}${days}d${suffix}`;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function ScheduleCell({ s }: { s: Schedule }) {
  if (s.schedule_type === 'interval') {
    const ms = parseInt(s.schedule_value, 10);
    const mins = Math.round(ms / 60000);
    return <span className="font-mono text-xs">every {mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`}</span>;
  }
  if (s.schedule_type === 'once') {
    return <span className="font-mono text-xs">once {formatAbsolute(s.schedule_value)}</span>;
  }
  return <span className="font-mono text-xs">{s.schedule_value}</span>;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Schedule | null>(null);

  const load = useCallback(() => {
    refreshState<Schedule[]>('/api/schedules', setSchedules);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = schedules.filter((s) => filter === 'all' || s.status === filter);
  const activeCount = schedules.filter((s) => s.status === 'active').length;

  const quickAction = async (s: Schedule, action: 'run-now' | 'toggle') => {
    const url = action === 'run-now'
      ? `/api/schedules/${s.id}/run-now`
      : `/api/schedules/${s.id}/toggle`;
    await fetch(url, { method: 'POST' });
    load();
  };

  return (
    <>
      <Header
        title="Schedules"
        description={`${activeCount} active · ${schedules.length} total`}
      />

      <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6">
          <Filter className="w-4 h-4 text-text-muted hidden sm:block" />
          {(['all', 'active', 'paused'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent',
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className="ml-1.5 text-text-muted">
                  {schedules.filter((s) => s.status === f).length}
                </span>
              )}
            </button>
          ))}
          <div className="ml-auto">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Schedule
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-1 p-12 text-center">
            <Clock className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-50" />
            <p className="text-sm text-text-secondary mb-1">No schedules {filter !== 'all' && `(${filter})`}</p>
            <p className="text-xs text-text-muted">
              Create one to run agent prompts on a cron or interval.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
            <div className="hidden md:grid grid-cols-[1.5fr_1fr_1.3fr_1fr_1fr_90px_110px] gap-3 px-4 py-2.5 text-[10px] font-mono text-text-muted uppercase tracking-[0.15em] border-b border-border bg-surface-2">
              <div>ID / Group</div>
              <div>Schedule</div>
              <div>Prompt</div>
              <div>Next run</div>
              <div>Last run</div>
              <div>Status</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className="grid md:grid-cols-[1.5fr_1fr_1.3fr_1fr_1fr_90px_110px] gap-3 px-4 py-3 hover:bg-surface-2 transition-colors cursor-pointer"
                  onClick={() => setEditTarget(s)}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-text-primary truncate">{s.id}</div>
                    <div className="text-[11px] text-text-muted truncate">
                      {s.group_name ?? s.group_folder}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-text-secondary min-w-0">
                    {s.schedule_type === 'cron' ? <Clock className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> :
                     s.schedule_type === 'interval' ? <AlarmClock className="w-3.5 h-3.5 text-text-muted flex-shrink-0" /> :
                     <Calendar className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />}
                    <ScheduleCell s={s} />
                  </div>
                  <div className="text-xs text-text-muted truncate">{s.prompt}</div>
                  <div className="text-xs text-text-secondary">
                    <div>{formatRelative(s.next_run)}</div>
                    <div className="text-[10px] text-text-muted font-mono">{formatAbsolute(s.next_run)}</div>
                  </div>
                  <div className="text-xs text-text-secondary min-w-0">
                    {s.last_run ? (
                      <>
                        <div className="flex items-center gap-1">
                          {s.last_result?.startsWith('Error') ? (
                            <XCircle className="w-3 h-3 text-status-error" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-status-online" />
                          )}
                          {formatRelative(s.last_run)}
                        </div>
                        <div className="text-[10px] text-text-muted truncate">{s.last_result}</div>
                      </>
                    ) : (
                      <span className="text-text-muted">never</span>
                    )}
                  </div>
                  <div>
                    <span className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium',
                      s.status === 'active' ? 'bg-green-500/10 text-status-online' : 'bg-surface-3 text-text-muted',
                    )}>
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        s.status === 'active' ? 'bg-status-online animate-pulse-slow' : 'bg-text-muted',
                      )} />
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => quickAction(s, 'run-now')}
                      title="Run now"
                      className="p-1.5 rounded-md hover:bg-accent/10 hover:text-accent text-text-muted transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => quickAction(s, 'toggle')}
                      title={s.status === 'active' ? 'Pause' : 'Activate'}
                      className="p-1.5 rounded-md hover:bg-surface-3 text-text-muted transition-colors"
                    >
                      {s.status === 'active' ? (
                        <PauseCircle className="w-3.5 h-3.5" />
                      ) : (
                        <PlayCircle className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ScheduleModal
        open={showCreate}
        mode="create"
        schedule={null}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
      <ScheduleModal
        open={!!editTarget}
        mode="edit"
        schedule={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={load}
      />
    </>
  );
}
