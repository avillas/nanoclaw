'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { DeleteAgentModal } from '@/components/modals/delete-agent-modal';
import { PixelOfficeRoom } from '@/components/floor/pixel-office-room';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import type { Agent } from '@/types';

const STATUS_DOTS: Array<{ label: string; color: string }> = [
  { label: 'Working', color: 'bg-status-online' },
  { label: 'Idle', color: 'bg-status-offline' },
  { label: 'Waiting', color: 'bg-status-warning' },
  { label: 'Error', color: 'bg-status-error' },
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-mono text-text-muted">
      <span className="uppercase tracking-wider font-medium text-text-secondary">
        Status:
      </span>
      {STATUS_DOTS.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', color)} />
          {label}
        </span>
      ))}
    </div>
  );
}

export default function FloorPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const loadAgents = useCallback(() => {
    refreshState<Agent[]>('/api/agents', setAgents);
  }, []);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 8000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  const working = agents.filter((a) => a.status === 'working').length;

  // Group agents by office, ensuring known offices always show even when empty
  const offices = agents.reduce<Record<string, Agent[]>>((acc, agent) => {
    (acc[agent.office] ||= []).push(agent);
    return acc;
  }, {});
  for (const name of ['marketing', 'development', 'innovation']) {
    if (!offices[name]) offices[name] = [];
  }

  return (
    <>
      <Header
        title="Office Floor"
        description={`${working} of ${agents.length} agents working`}
      />

      <div className="p-4 sm:p-6 lg:p-8 animate-fade-in space-y-6 sm:space-y-8">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Legend />
          <span className="text-xs font-mono text-text-muted">
            Auto-refresh: 8s
          </span>
        </div>

        {/* Pixel-art office rooms */}
        {Object.entries(offices)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, officeAgents]) => (
            <PixelOfficeRoom
              key={name}
              name={name}
              agents={officeAgents}
              onDelete={setDeleteTarget}
            />
          ))}
      </div>

      <DeleteAgentModal
        agent={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={loadAgents}
      />
    </>
  );
}
