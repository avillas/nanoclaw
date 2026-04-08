'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/header';
import { CreateOfficeModal } from '@/components/modals/create-office-modal';
import { Building2, Users, GitBranch, DollarSign, ArrowRight, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import type { Office, OfficeName } from '@/types';

const DEFAULT_COLORS = {
  border: 'border-l-accent',
  gradient: 'text-gradient-accent',
};

const colorMap: Record<string, string> = {
  marketing: 'border-l-office-marketing',
  development: 'border-l-office-development',
  innovation: 'border-l-office-innovation',
};

const gradientMap: Record<string, string> = {
  marketing: 'text-gradient-marketing',
  development: 'text-gradient-development',
  innovation: 'text-gradient-innovation',
};

export default function OfficesPage() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadOffices = useCallback(() => {
    refreshState<Office[]>('/api/offices', setOffices);
  }, []);

  useEffect(() => {
    loadOffices();
  }, [loadOffices]);

  return (
    <>
      <Header title="Offices" description="Manage your AI agent offices" />
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 animate-fade-in">
        {/* Create button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-500 text-white hover:bg-purple-500/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Office
          </button>
        </div>

        {offices.map((office, i) => (
          <Link
            key={office.name}
            href={`/offices/${office.name}`}
            className={cn(
              'card-hover p-4 sm:p-6 flex flex-col md:flex-row md:items-center gap-4 md:gap-6 border-l-4 animate-slide-up group',
              colorMap[office.name] || DEFAULT_COLORS.border
            )}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="flex-1 min-w-0">
              <h3 className={cn('text-base sm:text-lg font-bold', gradientMap[office.name] || DEFAULT_COLORS.gradient)}>{office.displayName}</h3>
              <p className="text-xs sm:text-sm text-text-muted mt-1">{office.description}</p>
            </div>

            <div className="grid grid-cols-4 gap-3 sm:gap-4 md:gap-8 text-sm md:flex md:items-center">
              <div className="text-center">
                <p className="stat-label mb-1">Agents</p>
                <p className="font-mono font-bold text-xs sm:text-sm">{office.activeAgents}/{office.agentCount}</p>
              </div>
              <div className="text-center">
                <p className="stat-label mb-1">Pipeline</p>
                <p className="font-mono font-bold text-xs sm:text-sm">{office.pipeline.length} <span className="hidden sm:inline">stages</span></p>
              </div>
              <div className="text-center">
                <p className="stat-label mb-1">Daily Cost</p>
                <p className="font-mono font-bold text-xs sm:text-sm">R$ {office.dailySpent.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="stat-label mb-1">Status</p>
                <span className={cn('badge', office.status === 'operational' ? 'badge-online' : 'badge-warning')}>
                  {office.status}
                </span>
              </div>
            </div>

            <ArrowRight className="hidden md:block w-5 h-5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        ))}
      </div>

      <CreateOfficeModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadOffices}
      />
    </>
  );
}
