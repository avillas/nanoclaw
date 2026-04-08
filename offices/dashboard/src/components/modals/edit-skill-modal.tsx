'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Skill, SkillWithContent } from '@/types';

interface EditSkillModalProps {
  skill: Skill | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EditSkillModal({ skill, open, onClose, onSaved }: EditSkillModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [content, setContent] = useState('');
  const [extraFiles, setExtraFiles] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !skill) return;
    setError('');
    setSuccess(false);
    setLoading(true);
    setContent('');
    setExtraFiles([]);

    fetch(
      `/api/skills/${encodeURIComponent(skill.scope)}/${encodeURIComponent(skill.name)}`,
      { cache: 'no-store' },
    )
      .then((r) => r.json())
      .then((data: SkillWithContent | { error?: string }) => {
        if ('error' in data && data.error) {
          setError(data.error);
          return;
        }
        const sk = data as SkillWithContent;
        setContent(sk.rawContent || '');
        setExtraFiles(sk.extraFiles || []);
      })
      .catch((err) => setError(err.message || 'Failed to load skill'))
      .finally(() => setLoading(false));
  }, [open, skill]);

  const handleSave = async () => {
    if (!skill) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.scope)}/${encodeURIComponent(skill.name)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          cache: 'no-store',
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update skill');
      setSuccess(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !skill) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Edit Skill</h2>
              <p className="text-xs text-text-muted truncate">
                {skill.scope} / {skill.name}/SKILL.md
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="w-12 h-12 text-status-online" />
              <p className="text-lg font-bold">Saved!</p>
              <p className="text-sm text-text-muted">{skill.name} updated</p>
            </div>
          ) : (
            <>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                SKILL.md content (frontmatter + body)
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className="w-full h-[55vh] sm:h-[50vh] px-3 py-2 bg-surface-0 border border-border rounded-lg text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none leading-relaxed"
              />
              <p className="text-[10px] text-text-muted leading-relaxed">
                Frontmatter must include <code className="text-text-secondary">name</code> and{' '}
                <code className="text-text-secondary">description</code>. Body is free-form Markdown.
              </p>

              {extraFiles.length > 0 && (
                <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-3 flex gap-2">
                  <FileText className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-text-secondary">
                    <p className="font-medium text-amber-400 mb-1">This skill ships extra files</p>
                    <p className="text-text-muted">
                      {extraFiles.join(', ')} — these are not editable here. The dashboard editor only
                      modifies <code className="text-text-secondary">SKILL.md</code>; scripts and assets must
                      be edited directly on the host filesystem.
                    </p>
                  </div>
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
              onClick={handleSave}
              disabled={submitting || loading}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                'bg-accent text-black hover:bg-accent/90 disabled:opacity-50',
              )}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
