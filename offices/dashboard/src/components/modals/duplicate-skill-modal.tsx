'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Copy, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fetchJson } from '@/lib/api-fetch';
import type { Skill, Office } from '@/types';

interface DuplicateSkillModalProps {
  skill: Skill | null;
  open: boolean;
  onClose: () => void;
  onDuplicated: () => void;
}

export function DuplicateSkillModal({
  skill,
  open,
  onClose,
  onDuplicated,
}: DuplicateSkillModalProps) {
  const [offices, setOffices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [toScope, setToScope] = useState('shared');
  const [toName, setToName] = useState('');

  useEffect(() => {
    if (!open || !skill) return;
    setError('');
    setSuccess(false);
    setToName(skill.name);
    setToScope(skill.scope === 'shared' ? 'shared' : 'shared');

    fetchJson<Office[]>('/api/offices').then((data) => {
      if (Array.isArray(data)) setOffices(data.map((o) => o.name));
    });
  }, [open, skill]);

  const onNameChange = (v: string) => {
    setToName(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  };

  const isNoOp =
    skill && toScope === skill.scope && toName === skill.name;
  const canSubmit = skill && toScope && toName && !submitting && !isNoOp;

  const handleSubmit = useCallback(async () => {
    if (!skill) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/skills/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromScope: skill.scope,
          fromName: skill.name,
          toScope,
          toName,
        }),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to duplicate');
      setSuccess(true);
      setTimeout(() => {
        onDuplicated();
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [skill, toScope, toName, onDuplicated, onClose]);

  if (!open || !skill) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Copy className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Duplicate Skill</h2>
              <p className="text-xs text-text-muted truncate">
                from {skill.scope}/{skill.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-2 transition-colors">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 space-y-4">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="w-12 h-12 text-status-online" />
              <p className="text-lg font-bold">Duplicated!</p>
              <p className="text-sm text-text-muted">{toScope}/{toName}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Destination scope</label>
                <select
                  value={toScope}
                  onChange={(e) => setToScope(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
                >
                  <option value="shared">shared (all offices)</option>
                  {offices.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">New name</label>
                <input
                  type="text"
                  value={toName}
                  onChange={(e) => onNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors font-mono"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Defaults to the original name. Change if you want a variant under the same scope.
                </p>
              </div>

              {skill.hasExtraFiles && (
                <p className="text-[10px] text-text-muted bg-surface-2 rounded-lg p-3 leading-relaxed">
                  This skill ships extra files ({skill.extraFiles.join(', ')}). They will be copied along with
                  the SKILL.md.
                </p>
              )}

              {isNoOp && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-status-warning flex-shrink-0" />
                  <p className="text-xs text-status-warning">
                    Source and destination are identical. Change scope or name.
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                  <p className="text-sm text-status-error">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {!success && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-border">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                canSubmit ? 'bg-accent text-black hover:bg-accent/90' : 'bg-surface-3 text-text-muted cursor-not-allowed',
              )}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
              Duplicate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
