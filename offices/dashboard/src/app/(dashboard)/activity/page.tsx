'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import {
  Activity, CheckCircle, AlertTriangle, XCircle, Info,
  GitCommit, FileText, Search, Shield, BarChart,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ActivityEvent, OfficeName } from '@/types';

const levelConfig: Record<string, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: 'text-accent bg-accent/10' },
  success: { icon: CheckCircle, color: 'text-status-online bg-green-500/10' },
  warning: { icon: AlertTriangle, color: 'text-status-warning bg-amber-500/10' },
  error: { icon: XCircle, color: 'text-status-error bg-red-500/10' },
};

const actionIcons: Record<string, typeof Activity> = {
  commit_pushed: GitCommit,
  pr_opened: GitCommit,
  task_started: Activity,
  review_completed: FileText,
  research_completed: Search,
  adr_created: FileText,
  tests_failed: XCircle,
  opportunity_scored: BarChart,
  security_alert: Shield,
  message: Info,
};

const officeBadges: Record<OfficeName, string> = {
  marketing: 'badge-marketing',
  development: 'badge-development',
  innovation: 'badge-innovation',
};

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    fetch('/api/activity').then((r) => r.json()).then(setEvents);
    const interval = setInterval(() => {
      fetch('/api/activity').then((r) => r.json()).then(setEvents);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <Header title="Activity Feed" description="Real-time log of all agent actions" />

      <div className="p-8 animate-fade-in">
        <div className="max-w-4xl">
          {events.map((event, i) => {
            const level = levelConfig[event.level] || levelConfig.info;
            const ActionIcon = actionIcons[event.action] || Activity;
            const time = new Date(event.timestamp);
            const timeStr = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const dateStr = time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

            return (
              <div
                key={event.id}
                className="flex gap-4 py-3 border-b border-border/50 animate-slide-up hover:bg-surface-1/50 px-3 -mx-3 rounded-lg transition-colors"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', level.color)}>
                  <ActionIcon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{event.agent}</span>
                    <span className={cn('badge', officeBadges[event.office])}>{event.office}</span>
                    <span className="text-[10px] font-mono text-text-muted ml-auto">{dateStr} {timeStr}</span>
                  </div>
                  <p className="text-sm text-text-secondary">{event.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
