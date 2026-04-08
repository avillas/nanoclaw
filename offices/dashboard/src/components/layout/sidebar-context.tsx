'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface SidebarState {
  /** Whether the sidebar is currently open on mobile (always considered open on lg+). */
  open: boolean;
  /** Open the sidebar. */
  show: () => void;
  /** Close the sidebar. */
  hide: () => void;
  /** Toggle the sidebar open/closed. */
  toggle: () => void;
}

const SidebarContext = createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <SidebarContext.Provider value={{ open, show, hide, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider — keeps things
    // safe at runtime even if a page forgets to wrap with the layout.
    return {
      open: false,
      show: () => {},
      hide: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
