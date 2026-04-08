'use client';

import { useState, useCallback } from 'react';
import type { Skill } from '@/types';

export function DeleteSkillModal({
  skill,
  open,
  onClose,
  onDeleted,
}: {
  skill: Skill | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.scope)}/${encodeURIComponent(skill.name)}`,
        { method: 'DELETE', cache: 'no-store' },
      );
      if (res.ok) {
        onDeleted();
        onClose();
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  }, [skill, onDeleted, onClose]);

  if (!open || !skill) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/70 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-surface-1 border border-border rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <h3 className="text-lg font-semibold text-text-primary mb-2">Remove Skill</h3>
        <p className="text-sm text-text-secondary mb-1">
          Are you sure you want to remove{' '}
          <span className="font-semibold text-text-primary">{skill.name}</span> from the{' '}
          <span className="font-semibold text-text-primary">{skill.scope}</span> scope?
        </p>
        <p className="text-xs text-text-muted mb-6">
          This will delete the entire skill directory{skill.hasExtraFiles ? ' (including its extra files)' : ''}.
          This action cannot be undone.
        </p>
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
            {deleting ? 'Removing...' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}
