'use client';

import { useSession } from 'next-auth/react';
import { Bell, Search, Menu } from 'lucide-react';
import { useSidebar } from './sidebar-context';

interface HeaderProps {
  title: string;
  description?: string;
}

export function Header({ title, description }: HeaderProps) {
  const { data: session } = useSession();
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-30 bg-surface-0/80 backdrop-blur-xl border-b border-border">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Hamburger — mobile only */}
          <button
            onClick={toggle}
            aria-label="Open menu"
            className="lg:hidden p-2 -ml-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{title}</h1>
            {description && (
              <p className="text-xs sm:text-sm text-text-muted mt-0.5 truncate">{description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Search — hidden on smallest screens */}
          <button className="hidden sm:flex items-center gap-2 px-3 py-2 bg-surface-2 border border-border rounded-lg text-xs text-text-muted hover:border-border-hover transition-colors">
            <Search className="w-3.5 h-3.5" />
            <span>Search...</span>
            <kbd className="inline-flex items-center px-1.5 py-0.5 bg-surface-0 rounded text-[10px] font-mono border border-border ml-4">
              ⌘K
            </kbd>
          </button>

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-surface-2 transition-colors">
            <Bell className="w-4 h-4 text-text-muted" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
          </button>

          {/* User */}
          <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-border">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
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
