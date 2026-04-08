'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import {
  CheckCircle, Clock, XCircle, Zap, AlertTriangle,
  ChevronRight, Play, Timer,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import type { Pipeline, OfficeName, PipelineStageExecution } from '@/types';

const officeGradients: Record<OfficeName, string> = {
  marketing: 'text-gradient-marketing',
  development: 'text-gradient-development',
  innovation: 'text-gradient-innovation',
};

const officeBadges: Record<OfficeName, string> = {
  marketing: 'badge-marketing',
  development: 'badge-development',
  innovation: 'badge-innovation',
};

const statusIcons: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  running: Zap,
  pending: Clock,
  failed: XCircle,
  skipped: AlertTriangle,
};

const statusStyles: Record<string, string> = {
  completed: 'text-status-online bg-green-500/10 border-green-500/20',
  running: 'text-accent bg-accent/10 border-accent/20',
  pending: 'text-text-muted bg-surface-3 border-border',
  failed: 'text-status-error bg-red-500/10 border-red-500/20',
  skipped: 'text-status-warning bg-amber-500/10 border-amber-500/20',
};

const pipelineStatusStyles: Record<string, string> = {
  running: 'badge-online',
  completed: 'bg-accent/15 text-accent',
  failed: 'badge-error',
  paused: 'badge-warning',
  pending: 'bg-surface-3 text-text-muted',
};

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);

  useEffect(() => {
    const load = () => refreshState<Pipeline[]>('/api/pipelines', setPipelines);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  const running = pipelines.filter((p) => p.status === 'running').length;
  const defined = pipelines.filter((p) => p.status === 'pending').length;

  return (
    <>
      <Header title="Pipelines" description={running > 0 ? `${running} pipeline(s) running` : `${defined} pipeline(s) defined`} />

      <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">
        {pipelines.map((pipeline, pi) => {
          const completedStages = pipeline.stages.filter((s) => s.status === 'completed').length;
          const progress = (completedStages / pipeline.stages.length) * 100;

          return (
            <div key={pipeline.id} className="card p-6 animate-slide-up" style={{ animationDelay: `${pi * 100}ms` }}>
              {/* Pipeline header */}
              <div className="flex items-center gap-3 mb-2">
                <Play className="w-4 h-4 text-text-muted" />
                <h3 className={cn('font-bold', officeGradients[pipeline.office])}>
                  {pipeline.office.charAt(0).toUpperCase() + pipeline.office.slice(1)} Pipeline
                </h3>
                <span className={cn('badge', pipelineStatusStyles[pipeline.status])}>{pipeline.status}</span>
                <span className={cn('badge', officeBadges[pipeline.office])}>{pipeline.office}</span>
                <span className="ml-auto text-xs font-mono text-text-muted">{pipeline.id}</span>
              </div>

              <p className="text-sm text-text-muted mb-4">
                Triggered by <span className="text-text-secondary font-medium">{pipeline.triggeredBy}</span>
              </p>

              {/* Progress bar */}
              <div className="mb-5">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Progress</span>
                  <span className="text-xs font-mono text-text-secondary">{completedStages}/{pipeline.stages.length}</span>
                </div>
                <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-accent to-cyan-400 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Stage cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {pipeline.stages.map((stage) => {
                  const Icon = statusIcons[stage.status] || Clock;
                  return (
                    <div key={stage.position} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs', statusStyles[stage.status])}>
                      <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', stage.status === 'running' && 'animate-pulse')} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{stage.agentName}</p>
                        {stage.duration && (
                          <p className="text-[10px] opacity-70 font-mono">{Math.round(stage.duration / 60)}m</p>
                        )}
                      </div>
                      {stage.score != null && (
                        <span className="font-mono font-bold text-[11px]">{stage.score.toFixed(1)}</span>
                      )}
                      {stage.gateResult === 'passed' && <CheckCircle className="w-3 h-3 text-status-online" />}
                      {stage.gateResult === 'failed' && <XCircle className="w-3 h-3 text-status-error" />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
