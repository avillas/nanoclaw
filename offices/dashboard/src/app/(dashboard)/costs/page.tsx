'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { DollarSign, TrendingUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { CostSummary, OfficeName } from '@/types';

const officeThemes: Record<OfficeName, { gradient: string; bar: string; glow: string }> = {
  marketing: { gradient: 'text-gradient-marketing', bar: 'from-amber-400 to-orange-400', glow: 'glow-marketing' },
  development: { gradient: 'text-gradient-development', bar: 'from-blue-400 to-indigo-400', glow: 'glow-development' },
  innovation: { gradient: 'text-gradient-innovation', bar: 'from-purple-400 to-violet-400', glow: 'glow-innovation' },
};

export default function CostsPage() {
  const [costs, setCosts] = useState<CostSummary[]>([]);

  useEffect(() => {
    fetch('/api/costs').then((r) => r.json()).then(setCosts);
  }, []);

  const totalDaily = costs.reduce((s, c) => s + c.dailySpent, 0);
  const totalMonthly = costs.reduce((s, c) => s + c.monthlySpent, 0);
  const totalDailyBudget = costs.reduce((s, c) => s + c.dailyBudget, 0);
  const totalMonthlyBudget = costs.reduce((s, c) => s + c.monthlyBudget, 0);

  return (
    <>
      <Header title="Cost Monitor" description="Budget tracking across all offices" />

      <div className="p-8 space-y-8 animate-fade-in">
        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card p-6 glow-accent">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-accent" />
              <span className="stat-label">Daily Total</span>
            </div>
            <p className="stat-value text-3xl text-accent mb-3">R$ {totalDaily.toFixed(2)}</p>
            <div className="flex justify-between text-xs font-mono text-text-muted mb-1.5">
              <span>Budget: R$ {totalDailyBudget.toFixed(2)}</span>
              <span>{((totalDaily / totalDailyBudget) * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent to-cyan-400 rounded-full transition-all" style={{ width: `${Math.min((totalDaily / totalDailyBudget) * 100, 100)}%` }} />
            </div>
          </div>

          <div className="card p-6 glow-accent">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-accent" />
              <span className="stat-label">Monthly Total</span>
            </div>
            <p className="stat-value text-3xl text-accent mb-3">R$ {totalMonthly.toFixed(2)}</p>
            <div className="flex justify-between text-xs font-mono text-text-muted mb-1.5">
              <span>Budget: R$ {totalMonthlyBudget.toFixed(2)}</span>
              <span>{((totalMonthly / totalMonthlyBudget) * 100).toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-accent to-cyan-400 rounded-full transition-all" style={{ width: `${Math.min((totalMonthly / totalMonthlyBudget) * 100, 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Per-office breakdown */}
        <div>
          <h2 className="text-sm font-mono text-text-muted uppercase tracking-widest mb-4">Per-office Breakdown</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {costs.map((cost, i) => {
              const theme = officeThemes[cost.office] || officeThemes.development;
              const dailyPct = cost.dailyPercentage;
              const monthlyPct = cost.monthlyPercentage;
              const dailyAlert = dailyPct >= 75;
              const monthlyAlert = monthlyPct >= 75;

              return (
                <div key={cost.office} className={cn('card p-6 animate-slide-up', theme.glow)} style={{ animationDelay: `${i * 100}ms` }}>
                  <h3 className={cn('text-lg font-bold mb-4', theme.gradient)}>
                    {cost.office.charAt(0).toUpperCase() + cost.office.slice(1)}
                  </h3>

                  {/* Daily */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-muted">Daily</span>
                      <div className="flex items-center gap-1">
                        {dailyAlert && <AlertTriangle className="w-3 h-3 text-status-warning" />}
                        <span className="text-xs font-mono">R$ {cost.dailySpent.toFixed(2)} / R$ {cost.dailyBudget.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', dailyAlert ? 'bg-gradient-to-r from-amber-400 to-orange-400' : `bg-gradient-to-r ${theme.bar}`)}
                        style={{ width: `${Math.min(dailyPct, 100)}%` }}
                      />
                    </div>
                    <p className="text-right text-[10px] font-mono text-text-muted mt-0.5">{dailyPct.toFixed(1)}%</p>
                  </div>

                  {/* Monthly */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text-muted">Monthly</span>
                      <div className="flex items-center gap-1">
                        {monthlyAlert && <AlertTriangle className="w-3 h-3 text-status-warning" />}
                        <span className="text-xs font-mono">R$ {cost.monthlySpent.toFixed(2)} / R$ {cost.monthlyBudget.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', monthlyAlert ? 'bg-gradient-to-r from-amber-400 to-orange-400' : `bg-gradient-to-r ${theme.bar}`)}
                        style={{ width: `${Math.min(monthlyPct, 100)}%` }}
                      />
                    </div>
                    <p className="text-right text-[10px] font-mono text-text-muted mt-0.5">{monthlyPct.toFixed(1)}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
