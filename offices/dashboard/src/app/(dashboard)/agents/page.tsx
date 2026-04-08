'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { CreateAgentModal } from '@/components/modals/create-agent-modal';
import { DeleteAgentModal } from '@/components/modals/delete-agent-modal';
import { EditAgentModal } from '@/components/modals/edit-agent-modal';
import { Bot, Cpu, HardDrive, Clock, Zap, Filter, Plus, Trash2, Pencil } from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import type { Agent, OfficeName } from '@/types';

const officeColors: Record<OfficeName, string> = {
  marketing: 'badge-marketing',
  development: 'badge-development',
  innovation: 'badge-innovation',
};

const statusConfig: Record<string, { color: string; label: string }> = {
  working: { color: 'bg-status-online', label: 'Working' },
  idle: { color: 'bg-status-offline', label: 'Idle' },
  waiting: { color: 'bg-status-warning', label: 'Waiting' },
  error: { color: 'bg-status-error', label: 'Error' },
  offline: { color: 'bg-gray-600', label: 'Offline' },
};

const modelColors: Record<string, string> = {
  opus: 'text-purple-400 bg-purple-400/10',
  sonnet: 'text-blue-400 bg-blue-400/10',
  haiku: 'text-green-400 bg-green-400/10',
  'ollama-llama3.2': 'text-amber-400 bg-amber-400/10',
  'ollama-qwen3': 'text-orange-400 bg-orange-400/10',
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState<OfficeName | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [editTarget, setEditTarget] = useState<Agent | null>(null);

  const loadAgents = useCallback(() => {
    // refreshState only calls setAgents when the request actually succeeded —
    // a failed refetch leaves the previous list intact instead of flashing
    // an empty table.
    refreshState<Agent[]>('/api/agents', setAgents);
  }, []);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 10000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  const filtered = agents.filter((a) => {
    if (filter !== 'all' && a.office !== filter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  const working = agents.filter((a) => a.status === 'working').length;

  return (
    <>
      <Header title="Agents" description={`${working} of ${agents.length} agents active`} />

      <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6">
          <Filter className="w-4 h-4 text-text-muted hidden sm:block" />
          {(['all', 'marketing', 'development', 'innovation'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                filter === f ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent'
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span className="w-px h-5 bg-border mx-1 hidden sm:inline-block" />
          {(['all', 'working', 'idle', 'error'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === s ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent'
              )}
            >
              {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span className="ml-auto text-xs font-mono text-text-muted mr-1 sm:mr-3">{filtered.length}</span>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-black hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Agent
          </button>
        </div>

        {/* Agent table — horizontally scrollable on small screens */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest">Agent</th>
                  <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest">Office</th>
                  <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest">Model</th>
                  <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest hidden sm:table-cell">Status</th>
                  <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest hidden lg:table-cell">Container</th>
                  <th className="text-right px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest hidden md:table-cell">Tasks</th>
                  <th className="text-right px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest hidden md:table-cell">Cost Today</th>
                  <th className="w-20 px-3 sm:px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((agent, i) => {
                  const sc = statusConfig[agent.status] || statusConfig.offline;
                  return (
                    <tr
                      key={agent.id}
                      className="border-b border-border/50 hover:bg-surface-2/50 transition-colors animate-slide-up"
                      style={{ animationDelay: `${i * 20}ms` }}
                    >
                      <td className="px-3 sm:px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={cn('w-2 h-2 rounded-full flex-shrink-0', sc.color, agent.status === 'working' && 'animate-pulse')} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{agent.name}</p>
                            <p className="text-xs text-text-muted truncate">{agent.role}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <span className={cn('badge', officeColors[agent.office])}>{agent.office}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-3">
                        <span className={cn('badge', modelColors[agent.model] || 'bg-surface-3 text-text-muted')}>{agent.model}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                        <span className="text-xs font-medium text-text-secondary">{sc.label}</span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 hidden lg:table-cell">
                        <span className={cn(
                          'text-xs font-mono',
                          agent.containerStatus === 'running' ? 'text-status-online' :
                          agent.containerStatus === 'stopped' ? 'text-status-error' : 'text-text-muted'
                        )}>
                          {agent.containerId ? `${agent.containerId}` : '—'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right font-mono text-sm hidden md:table-cell">{agent.tasksCompleted}</td>
                      <td className="px-3 sm:px-4 py-3 text-right font-mono text-sm hidden md:table-cell">R$ {agent.costToday.toFixed(2)}</td>
                      <td className="px-3 sm:px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CreateAgentModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadAgents}
      />

      <DeleteAgentModal
        agent={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={loadAgents}
      />

      <EditAgentModal
        agent={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={loadAgents}
      />
    </>
  );
}
