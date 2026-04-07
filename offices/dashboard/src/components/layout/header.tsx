'use client';

import { useSession } from 'next-auth/react';
import { Bell, Search } from 'lucide-react';

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="sticky top-0 z-40 bg-surface-0/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between px-8 py-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-sm text-text-muted mt-0.5">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <button className="flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs text-text-muted hover:border-border-hover transition-colors">
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 bg-surface-0 rounded text-[10px] font-mono border border-border ml-4">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-surface-2 transition-colors">
            <Bell className="w-4 h-4 text-text-muted" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
          </button>

          {/* User */}
          <div className="flex items-center gap-2 pl-3 border-l border-border">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">
              {session?.user?.name?.charAt(0) || 'A'}
            </div>
            <span className="text-xs font-medium text-text-secondary hidden sm:inline">
              {session?.user?.name || 'Admin'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
