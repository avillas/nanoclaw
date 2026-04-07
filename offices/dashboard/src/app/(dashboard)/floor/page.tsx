'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { DeleteAgentModal } from '@/components/modals/delete-agent-modal';
import { cn } from '@/lib/cn';
import type { Agent, OfficeName } from '@/types';

// --- Office floor colors ---
const officeTheme: Record<string, { border: string; bg: string; glow: string; label: string; accent: string }> = {
  marketing: {
    border: 'border-office-marketing/30',
    bg: 'bg-office-marketing/5',
    glow: 'shadow-[0_0_30px_rgba(245,158,11,0.08)]',
    label: 'text-office-marketing',
    accent: '#f59e0b',
  },
  development: {
    border: 'border-office-development/30',
    bg: 'bg-office-development/5',
    glow: 'shadow-[0_0_30px_rgba(59,130,246,0.08)]',
    label: 'text-office-development',
    accent: '#3b82f6',
  },
  innovation: {
    border: 'border-office-innovation/30',
    bg: 'bg-office-innovation/5',
    glow: 'shadow-[0_0_30px_rgba(168,85,247,0.08)]',
    label: 'text-office-innovation',
    accent: '#a855f7',
  },
};

const defaultTheme = {
  border: 'border-accent/30',
  bg: 'bg-accent/5',
  glow: 'shadow-[0_0_30px_rgba(6,182,212,0.08)]',
  label: 'text-accent',
  accent: '#06b6d4',
};

const statusDot: Record<string, string> = {
  working: 'bg-status-online',
  idle: 'bg-status-offline',
  waiting: 'bg-status-warning',
  error: 'bg-status-error',
  offline: 'bg-gray-600',
};

const modelLabel: Record<string, string> = {
  opus: 'OP',
  sonnet: 'SN',
  haiku: 'HK',
  'ollama-llama3.2': 'LL',
  'ollama-qwen3': 'QW',
};

// --- Desk component (side-view realistic workstation) ---
function Desk({
  agent,
  index,
  onDelete,
}: {
  agent: Agent;
  index: number;
  onDelete: (agent: Agent) => void;
}) {
  const isWorking = agent.status === 'working';
  const theme = officeTheme[agent.office] || defaultTheme;

  return (
    <div
      className="relative animate-fade-in group"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="relative w-44 h-56">
        {/* === Back wall / cubicle partition === */}
        <div
          className={cn(
            'absolute top-0 left-2 right-2 h-24 rounded-t-lg border border-b-0 transition-all duration-500',
            'bg-surface-2/60',
            isWorking ? theme.border : 'border-border/40',
          )}
        />

        {/* === Monitor === */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          {/* Screen */}
          <div
            className={cn(
              'w-[72px] h-[44px] rounded-md border-2 overflow-hidden',
              isWorking ? 'border-text-muted/50 bg-surface-0' : 'border-border/50 bg-surface-0/80',
            )}
          >
            {isWorking ? (
              <div className="w-full h-full p-1.5 overflow-hidden">
                <div className="animate-scroll-code space-y-[3px]">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="flex gap-1">
                      <div
                        className="h-[2px] rounded-full bg-status-online/60"
                        style={{ width: `${10 + Math.random() * 24}px` }}
                      />
                      <div
                        className="h-[2px] rounded-full bg-accent/40"
                        style={{ width: `${6 + Math.random() * 16}px` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full h-full bg-surface-0/90" />
            )}
          </div>
          {/* Monitor stand */}
          <div className="mx-auto w-3 h-3 bg-surface-3/60" />
          <div className="mx-auto w-10 h-[3px] rounded-b bg-surface-3/60" />
        </div>

        {/* === Desk surface === */}
        <div
          className={cn(
            'absolute top-[72px] left-0 right-0 h-5 rounded-md border transition-all duration-500',
            'bg-[#2a1f14]/80',
            isWorking ? theme.border : 'border-border/40',
            isWorking && theme.glow,
          )}
        >
          {/* Keyboard on desk */}
          <div className="absolute -top-[2px] left-1/2 -translate-x-1/2 w-14 h-[6px] rounded-sm bg-surface-3/70 border border-border/30">
            {isWorking && (
              <div className="absolute inset-0 flex items-center justify-center gap-[2px]">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-[3px] h-[2px] rounded-[1px] bg-text-muted/60 animate-typing"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Coffee mug */}
          <div className="absolute -top-[6px] right-3 w-[6px] h-[6px] rounded-full bg-surface-3/50 border border-border/30" />
        </div>

        {/* === Desk legs === */}
        <div className="absolute top-[87px] left-3 w-[3px] h-10 bg-[#2a1f14]/60 rounded-b" />
        <div className="absolute top-[87px] right-3 w-[3px] h-10 bg-[#2a1f14]/60 rounded-b" />

        {/* === Chair === */}
        <div className="absolute bottom-[18px] left-1/2 -translate-x-1/2">
          {/* Chair back */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 w-[30px] h-[28px] rounded-t-lg bg-surface-3/40 border border-border/30 border-b-0" />
          {/* Chair seat */}
          <div className="relative w-[34px] h-[10px] rounded-md bg-surface-3/50 border border-border/30" />
          {/* Chair stem */}
          <div className="mx-auto w-[3px] h-3 bg-surface-3/40" />
          {/* Chair base / wheels */}
          <div className="mx-auto w-8 h-[3px] rounded-full bg-surface-3/30" />
        </div>

        {/* === Person sitting in chair === */}
        <div className="absolute bottom-[40px] left-1/2 -translate-x-1/2 z-10">
          {/* Body / torso */}
          <div
            className={cn(
              'absolute top-5 left-1/2 -translate-x-1/2 w-[22px] h-[18px] rounded-md',
              isWorking ? 'bg-surface-2/90' : 'bg-surface-2/60',
            )}
          />
          {/* Head */}
          <div
            className={cn(
              'relative w-8 h-8 rounded-full border-2 flex items-center justify-center',
              'bg-surface-1 text-[10px] font-bold font-mono',
              isWorking
                ? `${theme.border} text-text-primary`
                : 'border-border/50 text-text-muted',
            )}
          >
            {agent.name.slice(0, 2).toUpperCase()}
          </div>
          {/* Activity ring */}
          {isWorking && (
            <div
              className={cn(
                'absolute -inset-1 rounded-full border-2 animate-ping-slow opacity-50',
                theme.border,
              )}
            />
          )}
        </div>

        {/* === Status dot === */}
        <div
          className={cn(
            'absolute top-2 right-4 w-2.5 h-2.5 rounded-full z-20',
            statusDot[agent.status] || statusDot.offline,
            isWorking && 'animate-pulse',
          )}
        />

        {/* === Model badge === */}
        <div className="absolute top-2 left-4 z-20">
          <span className="text-[9px] font-mono font-bold text-text-muted/70 bg-surface-3/60 px-1 rounded">
            {modelLabel[agent.model] || agent.model.slice(0, 2).toUpperCase()}
          </span>
        </div>

        {/* === Delete button (visible on hover) === */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(agent);
          }}
          className={cn(
            'absolute top-2 left-1/2 -translate-x-1/2 z-30',
            'w-6 h-6 rounded-full flex items-center justify-center',
            'bg-status-error/80 text-white text-xs font-bold',
            'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
            'hover:bg-status-error hover:scale-110',
          )}
          title={`Remove ${agent.name}`}
        >
          ✕
        </button>

        {/* === Floor line === */}
        <div className="absolute bottom-[10px] left-0 right-0 h-[1px] bg-border/20" />
      </div>

      {/* Name plate under desk */}
      <div className="-mt-1 text-center">
        <p className="text-xs font-medium text-text-primary truncate max-w-[176px]">{agent.name}</p>
        <p className="text-[10px] text-text-muted truncate max-w-[176px]">{agent.role}</p>
        {isWorking && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <span className="w-1 h-1 rounded-full bg-status-online animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 rounded-full bg-status-online animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 rounded-full bg-status-online animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Office section ---
function OfficeSection({
  name,
  agents,
  onDelete,
}: {
  name: string;
  agents: Agent[];
  onDelete: (agent: Agent) => void;
}) {
  const theme = officeTheme[name] || defaultTheme;
  const working = agents.filter((a) => a.status === 'working').length;
  const officeActive = agents.some((a) => a.officeActive);

  return (
    <div className={cn('rounded-2xl border p-6', theme.border, theme.bg)}>
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn('w-3 h-3 rounded-full', `bg-[${theme.accent}]`)} style={{ backgroundColor: theme.accent }} />
          <h2 className={cn('text-lg font-semibold', theme.label)}>
            {name.charAt(0).toUpperCase() + name.slice(1)}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted">
            {officeActive && working === 0
              ? `1 task running · ${agents.length} agents`
              : `${working}/${agents.length} active`}
          </span>
          {(working > 0 || officeActive) && (
            <span className="flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-status-online opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-status-online" />
            </span>
          )}
        </div>
      </div>

      {/* Desks grid — arranged like office cubicles */}
      <div className="flex flex-wrap gap-4 justify-start">
        {agents.map((agent, i) => (
          <Desk key={agent.id} agent={agent} index={i} onDelete={onDelete} />
        ))}
      </div>

      {agents.length === 0 && (
        <p className="text-sm text-text-muted text-center py-8">No agents in this office</p>
      )}
    </div>
  );
}

// --- Legend ---
function Legend() {
  return (
    <div className="flex items-center gap-5 text-[10px] font-mono text-text-muted">
      <span className="uppercase tracking-wider font-medium text-text-secondary">Status:</span>
      {Object.entries({ Working: 'bg-status-online', Idle: 'bg-status-offline', Waiting: 'bg-status-warning', Error: 'bg-status-error' }).map(
        ([label, color]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', color)} />
            {label}
          </span>
        ),
      )}
    </div>
  );
}

// --- Main page ---
export default function FloorPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);

  const loadAgents = useCallback(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadAgents();
    const interval = setInterval(loadAgents, 8000);
    return () => clearInterval(interval);
  }, [loadAgents]);

  const working = agents.filter((a) => a.status === 'working').length;

  // Group agents by office
  const offices = agents.reduce<Record<string, Agent[]>>((acc, agent) => {
    (acc[agent.office] ||= []).push(agent);
    return acc;
  }, {});

  // Ensure known offices always show, even if empty
  for (const name of ['marketing', 'development', 'innovation']) {
    if (!offices[name]) offices[name] = [];
  }

  return (
    <>
      <Header
        title="Office Floor"
        description={`${working} of ${agents.length} agents working`}
      />

      <div className="p-8 animate-fade-in space-y-8">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Legend />
          <span className="text-xs font-mono text-text-muted">
            Auto-refresh: 8s
          </span>
        </div>

        {/* Office sections */}
        {Object.entries(offices)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, officeAgents]) => (
            <OfficeSection
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
