'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Building2, Bot, GitBranch, Activity,
  DollarSign, LogOut, Cpu, ChevronRight, Container, Apple, Send,
  Monitor, Sun, Moon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/cn';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/offices', label: 'Offices', icon: Building2 },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/floor', label: 'Office Floor', icon: Monitor },
  { href: '/pipelines', label: 'Pipelines', icon: GitBranch },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/costs', label: 'Costs', icon: DollarSign },
  { href: '/telegram', label: 'Telegram', icon: Send },
];

const KNOWN_OFFICE_COLORS: Record<string, string> = {
  marketing: 'bg-office-marketing',
  development: 'bg-office-development',
  innovation: 'bg-office-innovation',
};

function RuntimeBadge() {
  const [runtime, setRuntime] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/runtime')
      .then((r) => r.json())
      .then((data) => setRuntime(data.runtime))
      .catch(() => setRuntime('mock'));
  }, []);

  if (!runtime) return null;

  const label = runtime === 'docker' ? 'Docker' : runtime === 'apple-container' ? 'Apple Container' : 'No Runtime';
  const Icon = runtime === 'apple-container' ? Apple : Container;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-mono text-text-muted">
      <Icon className="w-3 h-3" />
      <span className="uppercase tracking-wider">{label}</span>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors w-full"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [officeNames, setOfficeNames] = useState<string[]>(['marketing', 'development', 'innovation']);
  const [telegramStatuses, setTelegramStatuses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/offices')
      .then((r) => r.json())
      .then((offices: any[]) => {
        if (Array.isArray(offices)) {
          setOfficeNames(offices.map((o) => o.name));
        }
      })
      .catch(() => {});

    fetch('/api/telegram')
      .then((r) => r.json())
      .then((data: any) => {
        if (data?.offices && Array.isArray(data.offices)) {
          const map: Record<string, boolean> = {};
          data.offices.forEach((c: any) => {
            map[c.office] = !!(c.hasGlobalBot && c.groupId);
          });
          setTelegramStatuses(map);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-surface-1 border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
            <Cpu className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-text-primary">NanoClaw</h1>
            <p className="text-[10px] font-mono text-text-muted uppercase tracking-[0.2em]">Mission Control</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="px-3 pt-3 pb-2 text-[10px] font-mono text-text-muted uppercase tracking-[0.2em]">
          Navigation
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary border border-transparent'
              )}
            >
              <item.icon className={cn('w-4 h-4', isActive ? 'text-accent' : 'text-text-muted group-hover:text-text-secondary')} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-3 h-3 text-accent/50" />}
            </Link>
          );
        })}

        {/* Office status */}
        <div className="mt-6 pt-4 border-t border-border">
          <p className="px-3 pb-2 text-[10px] font-mono text-text-muted uppercase tracking-[0.2em]">
            Offices
          </p>
          {officeNames.map((name) => {
            const tgConnected = telegramStatuses[name];
            return (
              <Link key={name} href={`/offices/${name}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2 rounded-lg transition-colors">
                <span className={cn('w-2 h-2 rounded-full animate-pulse-slow', KNOWN_OFFICE_COLORS[name] || 'bg-accent')} />
                <span className="text-xs text-text-secondary flex-1">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                {tgConnected !== undefined && (
                  <Send className={cn('w-3 h-3', tgConnected ? 'text-status-online' : 'text-text-muted opacity-30')} />
                )}
                <span className="text-[10px] font-mono text-status-online">ONLINE</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Runtime + Footer */}
      <div className="p-3 border-t border-border space-y-1">
        <RuntimeBadge />
        <ThemeToggle />
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-muted hover:text-status-error hover:bg-red-500/5 transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
