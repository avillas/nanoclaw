'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fetchJson } from '@/lib/api-fetch';
import type { Office } from '@/types';

interface CreateSkillModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** Pre-selected scope (e.g. "shared" or office name). Optional. */
  preselectedScope?: string;
}

export function CreateSkillModal({
  open,
  onClose,
  onCreated,
  preselectedScope,
}: CreateSkillModalProps) {
  const [offices, setOffices] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [scope, setScope] = useState<string>(preselectedScope || 'shared');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Auto-derive slug from a free-text name when the user types it
  const onNameChange = (v: string) => {
    setName(v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''));
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setSuccess(false);
    setName('');
    setDescription('');
    setScope(preselectedScope || 'shared');

    fetchJson<Office[]>('/api/offices').then((data) => {
      if (Array.isArray(data)) {
        setOffices(data.map((o) => o.name));
      }
    });
  }, [open, preselectedScope]);

  const canSubmit = scope && name && description && !submitting;

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, name, description }),
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create skill');
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }, [scope, name, description, onCreated, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Create Skill</h2>
              <p className="text-xs text-text-muted">Add a new SKILL.md</p>
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
              <p className="text-lg font-bold">Skill Created!</p>
              <p className="text-sm text-text-muted">{name} added to {scope}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Scope</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
                >
                  <option value="shared">shared (all offices)</option>
                  {offices.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
                <p className="text-[10px] text-text-muted mt-1">
                  <strong className="text-text-secondary">shared</strong> is mounted in every office&apos;s container.
                  An office-specific scope is only mounted in that office.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Name (kebab-case)</label>
                <input
                  type="text"
                  placeholder="e.g. competitive-analysis"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors font-mono"
                />
                <p className="text-[10px] text-text-muted mt-1">Used as the folder name. Auto-formatted as you type.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Description</label>
                <input
                  type="text"
                  placeholder="What does this skill do, in one sentence?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
                />
                <p className="text-[10px] text-text-muted mt-1">
                  Goes into the YAML frontmatter. Agents see this when deciding whether to use the skill.
                </p>
              </div>

              <p className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
                A starter SKILL.md template is generated for you. You can immediately edit it after creation
                using the <strong className="text-text-secondary">Edit</strong> button.
              </p>

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
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Create
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
