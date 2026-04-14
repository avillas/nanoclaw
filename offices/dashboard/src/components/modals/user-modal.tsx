'use client';

import { useEffect, useState } from 'react';
import { X, UserIcon, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface UserFormValues {
  id?: number;
  email: string;
  name: string;
  password: string;
}

interface UserModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: { id: number; email: string; name: string };
  onClose: () => void;
  onSaved: () => void;
}

export function UserModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: UserModalProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(initial?.email ?? '');
    setName(initial?.name ?? '');
    setPassword('');
    setError('');
    setSuccess(false);
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === 'edit';
  const passwordRequired = !isEdit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !name.trim()) {
      setError('Email and name are required.');
      return;
    }
    if (passwordRequired && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!passwordRequired && password.length > 0 && password.length < 8) {
      setError('New password must be at least 8 characters (or leave blank).');
      return;
    }

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/users/${initial?.id}` : '/api/users';
      const method = isEdit ? 'PUT' : 'POST';
      const body: Record<string, string> = { email, name };
      if (password) body.password = password;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      setSuccess(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <UserIcon className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold">
                {isEdit ? 'Edit User' : 'Create User'}
              </h2>
              <p className="text-xs text-text-muted">
                {isEdit
                  ? 'Update the user details or reset the password.'
                  : 'Add a new user who can access the dashboard.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="px-6 py-5 space-y-4 overflow-y-auto flex-1"
        >
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {isEdit ? 'New password (optional)' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isEdit ? 'Leave blank to keep current' : 'Minimum 8 characters'
              }
              className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
              autoComplete="new-password"
            />
            <p className="mt-1 text-[10px] text-text-muted">
              Stored as a bcrypt hash — the server never sees the plain
              password after this request.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-status-error/10 border border-status-error/30 rounded-lg text-xs text-status-error">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-status-online/10 border border-status-online/30 rounded-lg text-xs text-status-online">
              <CheckCircle className="w-4 h-4" />
              <span>{isEdit ? 'User updated.' : 'User created.'}</span>
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || success}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-medium bg-accent text-surface-0 hover:bg-accent/90 transition-colors disabled:opacity-40 flex items-center gap-2',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving
              </>
            ) : isEdit ? (
              'Save changes'
            ) : (
              'Create user'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
