'use client';

import { useState, useCallback } from 'react';
import type { Report } from '@/types';

export function DeleteReportModal({
  report,
  open,
  onClose,
  onDeleted,
}: {
  report: Report | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = useCallback(async () => {
    if (!report) return;
    setDeleting(true);
    setError('');
    try {
      const url = `/api/reports/${encodeURIComponent(report.office)}/${report.path
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')}`;
      const res = await fetch(url, { method: 'DELETE', cache: 'no-store' });
      if (res.ok) {
        onDeleted();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setDeleting(false);
    }
  }, [report, onDeleted, onClose]);

  if (!open || !report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/70 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-surface-1 border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Delete Report</h3>
        <p className="text-sm text-text-secondary mb-1">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-text-primary break-all">{report.name}</span> from the{' '}
          <span className="font-semibold text-text-primary">{report.office}</span> office?
        </p>
        <p className="text-xs text-text-muted mb-6">
          This permanently removes the file from disk. This action cannot be undone.
        </p>
        {error && (
          <p className="text-xs text-status-error bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-4">
            {error}
          </p>
        )}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-lg border border-border text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm rounded-lg bg-status-error text-white font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
