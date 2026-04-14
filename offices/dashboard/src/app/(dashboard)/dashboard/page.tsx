'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { refreshState } from '@/lib/api-fetch';
import {
  Bot, GitBranch, CheckCircle, DollarSign,
  TrendingUp, ArrowUpRight, ArrowDownRight, Minus,
  Building2, Zap,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DashboardKPIs, Office, OfficeName } from '@/types';

const officeColors: Record<OfficeName, { text: string; bg: string; border: string; glow: string; gradient: string }> = {
  marketing: { text: 'text-office-marketing', bg: 'bg-office-marketing-dim', border: 'border-office-marketing/20', glow: 'glow-marketing', gradient: 'text-gradient-marketing' },
  development: { text: 'text-office-development', bg: 'bg-office-development-dim', border: 'border-office-development/20', glow: 'glow-development', gradient: 'text-gradient-development' },
  innovation: { text: 'text-office-innovation', bg: 'bg-office-innovation-dim', border: 'border-office-innovation/20', glow: 'glow-innovation', gradient: 'text-gradient-innovation' },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardKPIs | null>(null);

  useEffect(() => {
    const load = () => refreshState<DashboardKPIs>('/api/dashboard', setData);
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <>
        <Header title="Dashboard" description="Loading..." />
        <div className="p-4 sm:p-6 lg:p-8 flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  const kpis = [
    { label: 'Total Agents', value: data.totalAgents, icon: Bot, color: 'text-accent' },
    { label: 'Active Now', value: data.activeAgents, icon: Zap, color: 'text-status-online' },
    { label: 'Running Pipelines', value: data.runningPipelines, icon: GitBranch, color: 'text-office-development' },
    { label: 'Completed Today', value: data.completedToday, icon: CheckCircle, color: 'text-status-online' },
    { label: 'Cost Today', value: `$ ${data.totalCostToday.toFixed(2)}`, icon: DollarSign, color: 'text-office-marketing' },
    { label: 'Cost This Month', value: `$ ${data.totalCostMonth.toFixed(2)}`, icon: TrendingUp, color: 'text-office-innovation' },
  ];

  return (
    <>
      <Header title="Dashboard" description="Real-time overview of all NanoClaw offices" />

      <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8 animate-fade-in">
        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((kpi, i) => (
            <div key={kpi.label} className="card p-4 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="flex items-center gap-2 mb-3">
                <kpi.icon className={cn('w-4 h-4', kpi.color)} />
                <span className="stat-label">{kpi.label}</span>
              </div>
              <p className={cn('stat-value', kpi.color)}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Office Cards */}
        <div>
          <h2 className="text-sm font-mono text-text-muted uppercase tracking-widest mb-4">Offices</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {data.offices.map((office, i) => (
              <OfficeCard key={office.name} office={office} delay={i * 100} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function OfficeCard({ office, delay }: { office: Office; delay: number }) {
  const colors = officeColors[office.name];
  const dailyPct = (office.dailySpent / office.dailyBudget) * 100;
  const budgetStatus = dailyPct > 75 ? 'warning' : dailyPct > 90 ? 'error' : 'ok';

  return (
    <a
      href={`/offices/${office.name}`}
      className={cn('card-hover p-6 block group', colors.glow)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colors.bg)}>
            <Building2 className={cn('w-5 h-5', colors.text)} />
          </div>
          <div>
            <h3 className={cn('font-bold text-lg', colors.gradient)}>{office.displayName.replace(' Office', '')}</h3>
            <p className="text-xs text-text-muted">{office.description}</p>
          </div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <p className="stat-label">Agents</p>
          <p className="text-lg font-bold font-mono">
            <span className={colors.text}>{office.activeAgents}</span>
            <span className="text-text-muted">/{office.agentCount}</span>
          </p>
        </div>
        <div>
          <p className="stat-label">Pipeline</p>
          <p className="text-lg font-bold font-mono">{office.pipeline.length} <span className="text-xs text-text-muted">stages</span></p>
        </div>
        <div>
          <p className="stat-label">Status</p>
          <span className={cn('badge mt-1', office.status === 'operational' ? 'badge-online' : office.status === 'degraded' ? 'badge-warning' : 'badge-offline')}>
            {office.status}
          </span>
        </div>
      </div>

      {/* Budget bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Daily Budget</span>
          <span className="text-xs font-mono">
            <span className={budgetStatus === 'ok' ? colors.text : budgetStatus === 'warning' ? 'text-status-warning' : 'text-status-error'}>
              ${office.dailySpent.toFixed(2)}
            </span>
            <span className="text-text-muted"> / ${office.dailyBudget.toFixed(2)}</span>
          </span>
        </div>
        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              budgetStatus === 'ok' ? `bg-gradient-to-r from-accent to-cyan-400` :
              budgetStatus === 'warning' ? 'bg-gradient-to-r from-amber-400 to-orange-400' :
              'bg-gradient-to-r from-red-400 to-red-500'
            )}
            style={{ width: `${Math.min(dailyPct, 100)}%` }}
          />
        </div>
      </div>
    </a>
  );
}
