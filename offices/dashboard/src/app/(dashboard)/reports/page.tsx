'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { FileDown, Filter, Download, Inbox, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import { DeleteReportModal } from '@/components/modals/delete-report-modal';
import type { Report } from '@/types';

const officeBadge: Record<string, string> = {
  marketing: 'badge-marketing',
  development: 'badge-development',
  innovation: 'badge-innovation',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fileExtIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  const map: Record<string, string> = {
    pdf: 'PDF',
    md: 'MD',
    csv: 'CSV',
    json: 'JSON',
    txt: 'TXT',
    html: 'HTML',
    docx: 'DOC',
    xlsx: 'XLS',
    zip: 'ZIP',
    png: 'IMG',
    jpg: 'IMG',
    jpeg: 'IMG',
    svg: 'IMG',
  };
  return map[ext] || ext.toUpperCase().slice(0, 4) || '???';
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);

  const loadReports = useCallback(() => {
    refreshState<Report[]>('/api/reports', setReports);
  }, []);

  useEffect(() => {
    loadReports();
    // Refresh every 30s so newly produced files appear without a manual reload
    const interval = setInterval(loadReports, 30000);
    return () => clearInterval(interval);
  }, [loadReports]);

  const offices = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => set.add(r.office));
    return Array.from(set).sort();
  }, [reports]);

  const filtered = reports.filter((r) => {
    if (officeFilter !== 'all' && r.office !== officeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.path.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  const totalSize = filtered.reduce((sum, r) => sum + r.size, 0);

  return (
    <>
      <Header
        title="Reports"
        description={
          reports.length === 0
            ? 'No reports yet'
            : `${filtered.length} of ${reports.length} files · ${formatBytes(totalSize)}`
        }
      />

      <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6">
          <Filter className="w-4 h-4 text-text-muted hidden sm:block" />
          <button
            onClick={() => setOfficeFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              officeFilter === 'all'
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent',
            )}
          >
            All
          </button>
          {offices.map((o) => (
            <button
              key={o}
              onClick={() => setOfficeFilter(o)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                officeFilter === o
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent',
              )}
            >
              {o}
            </button>
          ))}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-surface-2 border border-border ml-auto">
            <Search className="w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none w-32 sm:w-48"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="card p-12 flex flex-col items-center gap-3 text-center">
            <Inbox className="w-10 h-10 text-text-muted" />
            <p className="text-sm text-text-secondary">
              {reports.length === 0
                ? 'No reports yet — agents will populate this page when they save deliverables to /workspace/reports/'
                : 'No reports match your filters'}
            </p>
            <p className="text-[10px] text-text-muted max-w-md">
              Files are auto-deleted 60 days after they were created.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest">File</th>
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest">Office</th>
                    <th className="text-left px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest hidden md:table-cell">Modified</th>
                    <th className="text-right px-3 sm:px-4 py-3 text-[10px] font-mono text-text-muted uppercase tracking-widest">Size</th>
                    <th className="w-20 px-3 sm:px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const downloadHref = `/api/reports/${encodeURIComponent(r.office)}/${r.path
                      .split('/')
                      .map((seg) => encodeURIComponent(seg))
                      .join('/')}`;
                    return (
                      <tr
                        key={`${r.office}/${r.path}`}
                        className="border-b border-border/50 hover:bg-surface-2/50 transition-colors animate-slide-up"
                        style={{ animationDelay: `${i * 15}ms` }}
                      >
                        <td className="px-3 sm:px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-accent/10 text-accent border border-accent/20 flex-shrink-0">
                              {fileExtIcon(r.name)}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{r.name}</p>
                              {r.path !== r.name && (
                                <p className="text-[10px] font-mono text-text-muted truncate">{r.path}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={cn('badge', officeBadge[r.office] || 'bg-surface-3 text-text-muted')}>{r.office}</span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-xs font-mono text-text-secondary hidden md:table-cell">
                          {formatDate(r.modifiedAt)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right text-xs font-mono text-text-secondary">
                          {formatBytes(r.size)}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a
                              href={downloadHref}
                              download={r.name}
                              className="inline-flex items-center justify-center p-2 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
                              title={`Download ${r.name}`}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => setDeleteTarget(r)}
                              className="inline-flex items-center justify-center p-2 rounded hover:bg-status-error/10 text-text-muted hover:text-status-error transition-colors"
                              title={`Delete ${r.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
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
        )}

        <p className="text-[10px] text-text-muted mt-4 text-center">
          Files are auto-deleted 60 days after creation. Auto-refreshes every 30s.
        </p>
      </div>

      <DeleteReportModal
        report={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={loadReports}
      />
    </>
  );
}
