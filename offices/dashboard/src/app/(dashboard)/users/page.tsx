'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import {
  Plus,
  Pencil,
  Trash2,
  Users as UsersIcon,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import { UserModal } from '@/components/modals/user-modal';

interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    refreshState<User[]>('/api/users', setUsers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditTarget(null);
    setModalMode('create');
  }

  function openEdit(u: User) {
    setEditTarget(u);
    setModalMode('edit');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setDeleteTarget(null);
      load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Header
        title="Users"
        description="Dashboard access accounts (any user can use every feature)"
      />

      <div className="p-4 sm:p-6 lg:p-8 animate-fade-in space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <UsersIcon className="w-3.5 h-3.5" />
            <span>
              {users.length} user{users.length === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 py-2 bg-accent text-surface-0 hover:bg-accent/90 rounded-lg text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New user
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-xs text-text-muted uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 font-medium text-xs text-text-muted uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 font-medium text-xs text-text-muted uppercase tracking-wider hidden md:table-cell">
                    Created
                  </th>
                  <th className="px-4 py-3 font-medium text-xs text-text-muted uppercase tracking-wider hidden lg:table-cell">
                    Last login
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-text-muted"
                    >
                      No users yet. Create the first one to disable the
                      env-var bootstrap admin.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-border last:border-b-0 hover:bg-surface-2/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-text-secondary font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs hidden md:table-cell">
                        {formatDate(u.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs hidden lg:table-cell">
                        {formatDate(u.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(u)}
                            className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={users.length <= 1}
                            className={cn(
                              'p-2 rounded-lg transition-colors',
                              users.length <= 1
                                ? 'opacity-30 cursor-not-allowed'
                                : 'text-text-muted hover:text-status-error hover:bg-status-error/10',
                            )}
                            aria-label={
                              users.length <= 1
                                ? 'Cannot delete last user'
                                : 'Delete'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <UserModal
        open={modalMode !== null}
        mode={modalMode === 'edit' ? 'edit' : 'create'}
        initial={
          editTarget
            ? { id: editTarget.id, email: editTarget.email, name: editTarget.name }
            : undefined
        }
        onClose={() => setModalMode(null)}
        onSaved={load}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-md shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-status-error/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-status-error" />
              </div>
              <h2 className="text-base font-bold">Delete user</h2>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Delete <span className="font-medium">{deleteTarget.name}</span>{' '}
              (<span className="font-mono text-xs">{deleteTarget.email}</span>)?
              This cannot be undone — the account will be removed immediately.
            </p>
            {deleteError && (
              <div className="mb-4 p-3 bg-status-error/10 border border-status-error/30 rounded-lg text-xs text-status-error">
                {deleteError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError('');
                }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-status-error text-surface-0 hover:bg-status-error/90 transition-colors disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
