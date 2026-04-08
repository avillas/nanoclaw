'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { CreateAgentModal } from '@/components/modals/create-agent-modal';
import { DeleteAgentModal } from '@/components/modals/delete-agent-modal';
import { EditAgentModal } from '@/components/modals/edit-agent-modal';
import { TelegramConfigModal } from '@/components/modals/telegram-config-modal';
import {
  Users, CheckCircle, Clock, XCircle, AlertTriangle,
  ChevronRight, Zap, Plus, Send, Trash2, Pencil, RefreshCw, AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { fetchJson, refreshState } from '@/lib/api-fetch';
import type { Agent, Pipeline, Office, OfficeName, PipelineStageExecution } from '@/types';

interface TelegramStatus {
  office: string;
  groupId: string | null;
  isRegistered: boolean;
  hasGlobalBot: boolean;
}

const officeTheme: Record<string, { accent: string; bg: string; gradient: string }> = {
  marketing: { accent: 'text-office-marketing', bg: 'bg-office-marketing-dim', gradient: 'text-gradient-marketing' },
  development: { accent: 'text-office-development', bg: 'bg-office-development-dim', gradient: 'text-gradient-development' },
  innovation: { accent: 'text-office-innovation', bg: 'bg-office-innovation-dim', gradient: 'text-gradient-innovation' },
};

const defaultTheme = { accent: 'text-accent', bg: 'bg-accent/10', gradient: 'text-gradient-accent' };

const statusIcons: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  running: Zap,
  pending: Clock,
  failed: XCircle,
  skipped: AlertTriangle,
};

const statusColors: Record<string, string> = {
  completed: 'text-status-online bg-green-500/10',
  running: 'text-accent bg-accent/10 animate-pulse',
  pending: 'text-text-muted bg-surface-3',
  failed: 'text-status-error bg-red-500/10',
  skipped: 'text-status-warning bg-amber-500/10',
};

type OfficeDetailData = { office: Office; agents: Agent[]; pipelines: Pipeline[] };

export default function OfficeDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [data, setData] = useState<OfficeDetailData | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [editTarget, setEditTarget] = useState<Agent | null>(null);
  const [showTelegramConfig, setShowTelegramConfig] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildMsg(null);
    try {
      const res = await fetch(`/api/offices/${slug}/rebuild`, { method: 'POST', cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        setRebuildMsg('CLAUDE.md regenerado com sucesso');
        loadData();
      } else {
        setRebuildMsg(`Erro: ${data.error || 'falha desconhecida'}`);
      }
    } catch (err: any) {
      setRebuildMsg(`Erro: ${err.message}`);
    } finally {
      setRebuilding(false);
      setTimeout(() => setRebuildMsg(null), 4000);
    }
  };

  // Track whether the office has ever loaded successfully — after the first
  // success, failed refetches are silently ignored so the UI keeps showing
  // the last good data instead of flashing to "no agents / no telegram".
  const hasLoadedOnce = useRef(false);

  const loadData = useCallback(async () => {
    // Fire both fetches in parallel. fetchJson returns null on failure, so we
    // only update state when we actually got data — that way a transient
    // mobile network blip won't wipe out the previously rendered office.
    const [officeData, telegramData] = await Promise.all([
      fetchJson<OfficeDetailData>(`/api/offices/${slug}`),
      fetchJson<TelegramStatus>(`/api/telegram?office=${slug}`),
    ]);
    if (officeData !== null) {
      setData(officeData);
      setLoadError(false);
      hasLoadedOnce.current = true;
    } else if (!hasLoadedOnce.current) {
      // Initial load failed and we have nothing to show — surface the error
      // instead of spinning forever.
      setLoadError(true);
    }
    if (telegramData !== null) {
      setTelegramStatus(telegramData);
    }
  }, [slug]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!data && loadError) {
    return (
      <>
        <Header title="Office" />
        <div className="p-4 sm:p-6 lg:p-8 flex flex-col items-center gap-4">
          <AlertCircle className="w-10 h-10 text-status-error" />
          <p className="text-sm text-text-secondary">Falha ao carregar este escritório.</p>
          <button
            onClick={() => { setLoadError(false); loadData(); }}
            className="px-4 py-2 rounded-lg bg-accent text-black text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header title="Loading..." />
        <div className="p-4 sm:p-6 lg:p-8 flex justify-center"><div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" /></div>
      </>
    );
  }

  const { office, agents, pipelines } = data;
  const theme = officeTheme[office.name] || defaultTheme;
  const workingAgents = agents.filter((a) => a.status === 'working');

  const tgConfigured = telegramStatus?.hasGlobalBot && telegramStatus?.groupId;

  return (
    <>
      <Header title={office.displayName} description={office.description} />

      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">

        {/* Telegram status card */}
        <div className={cn(
          'card p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4',
          tgConfigured ? 'border-green-500/20' : 'border-amber-500/20'
        )}>
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              tgConfigured ? 'bg-green-500/10' : 'bg-amber-500/10'
            )}>
              <Send className={cn('w-5 h-5', tgConfigured ? 'text-status-online' : 'text-status-warning')} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Telegram {tgConfigured ? 'Conectado' : telegramStatus?.hasGlobalBot ? 'Sem Grupo' : 'Bot Não Configurado'}
              </p>
              <p className="text-xs text-text-muted truncate">
                {tgConfigured
                  ? `Grupo: ${telegramStatus!.groupId}`
                  : telegramStatus?.hasGlobalBot
                    ? 'Vincule um grupo do Telegram para este escritório'
                    : 'Configure o bot na página Telegram primeiro'
                }
              </p>
            </div>
          </div>
          <button
            onClick={() => telegramStatus?.hasGlobalBot ? setShowTelegramConfig(true) : window.location.assign('/telegram')}
            className={cn(
              'w-full sm:w-auto justify-center px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
              tgConfigured
                ? 'bg-surface-2 text-text-secondary hover:bg-surface-3'
                : 'bg-blue-500 text-white hover:bg-blue-500/90'
            )}
          >
            <Send className="w-3.5 h-3.5" />
            {tgConfigured ? 'Alterar Grupo' : telegramStatus?.hasGlobalBot ? 'Vincular Grupo' : 'Ir para Telegram'}
          </button>
        </div>

        {/* Agent grid */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-sm font-mono text-text-muted uppercase tracking-widest">
              Agents ({workingAgents.length} active / {agents.length} total)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {rebuildMsg && (
                <span className="text-xs text-text-muted w-full sm:w-auto">{rebuildMsg}</span>
              )}
              <button
                onClick={handleRebuild}
                disabled={rebuilding}
                title="Regenera as seções ## Team e ## Pipeline do CLAUDE.md a partir dos arquivos em agents/"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-text-secondary hover:bg-surface-3 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', rebuilding && 'animate-spin')} />
                <span className="hidden sm:inline">{rebuilding ? 'Rebuilding...' : 'Rebuild CLAUDE.md'}</span>
                <span className="sm:hidden">{rebuilding ? '...' : 'Rebuild'}</span>
              </button>
              <button
                onClick={() => setShowCreateAgent(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-black hover:bg-accent/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Agent
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                className={cn('card p-4 animate-slide-up group/card relative', agent.status === 'working' && 'border-accent/30')}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="absolute top-2 right-2 flex items-center gap-1 transition-all opacity-100 lg:opacity-0 lg:group-hover/card:opacity-100">
                  <button
                    onClick={() => setEditTarget(agent)}
                    className="p-1 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
                    title={`Edit ${agent.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(agent)}
                    className="p-1 rounded hover:bg-status-error/10 text-text-muted hover:text-status-error transition-colors"
                    title={`Remove ${agent.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <span className={cn('w-2 h-2 rounded-full', agent.status === 'working' ? 'bg-status-online animate-pulse' : agent.status === 'error' ? 'bg-status-error' : 'bg-status-offline')} />
                  <span className="text-sm font-medium truncate">{agent.name}</span>
                  <span className={cn('badge ml-auto', `badge-${office.name}`)}>{agent.model}</span>
                </div>
                <p className="text-xs text-text-muted truncate mb-2">{agent.role}</p>
                <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted">
                  <span>#{agent.pipelinePosition}</span>
                  <span>{agent.tasksCompleted} tasks</span>
                  <span className="ml-auto">R$ {agent.costToday.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline visualization */}
        {pipelines.length > 0 && (
          <div>
            <h2 className="text-sm font-mono text-text-muted uppercase tracking-widest mb-4">Active Pipelines</h2>
            {pipelines.map((pipeline) => (
              <div key={pipeline.id} className="card p-6 mb-4">
                <div className="flex items-center gap-3 mb-4">
                  <span className={cn('badge', pipeline.status === 'running' ? 'badge-online' : pipeline.status === 'completed' ? 'bg-accent/15 text-accent' : 'badge-error')}>
                    {pipeline.status}
                  </span>
                  <span className="text-sm text-text-secondary">Triggered by {pipeline.triggeredBy}</span>
                  <span className="text-xs font-mono text-text-muted ml-auto">{pipeline.id}</span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {pipeline.stages.map((stage, i) => {
                    const Icon = statusIcons[stage.status] || Clock;
                    return (
                      <div key={i} className="flex items-center gap-1">
                        <div className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs', statusColors[stage.status])}>
                          <Icon className="w-3 h-3" />
                          <span className="font-medium hidden xl:inline">{stage.agentName}</span>
                          <span className="font-mono xl:hidden">#{stage.position}</span>
                          {stage.score != null && (
                            <span className="font-mono text-[10px] ml-1">{stage.score.toFixed(1)}</span>
                          )}
                        </div>
                        {i < pipeline.stages.length - 1 && (
                          <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateAgentModal
        open={showCreateAgent}
        onClose={() => setShowCreateAgent(false)}
        onCreated={loadData}
        preselectedOffice={slug}
      />

      <DeleteAgentModal
        agent={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={loadData}
      />

      <EditAgentModal
        agent={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={loadData}
      />

      <TelegramConfigModal
        open={showTelegramConfig}
        onClose={() => setShowTelegramConfig(false)}
        onConfigured={loadData}
        officeName={slug}
        officeDisplayName={office.displayName}
      />
    </>
  );
}
