'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/header';
import { ExternalLink, KeyRound } from 'lucide-react';

const ONECLI_PORT = 10254;

export default function SecretsPage() {
  const [vaultUrl, setVaultUrl] = useState<string | null>(null);

  useEffect(() => {
    // Build OneCLI URL from the host the user is currently on, swapping the port.
    const proto = window.location.protocol;
    const host = window.location.hostname;
    setVaultUrl(`${proto}//${host}:${ONECLI_PORT}`);
  }, []);

  return (
    <>
      <Header
        title="Vault"
        description="OneCLI credential vault — manage API keys and secrets"
      />

      <div className="flex flex-col h-[calc(100vh-64px)]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-2 border-b border-border bg-surface-1">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <KeyRound className="w-3.5 h-3.5" />
            <span>
              Embedded from{' '}
              {vaultUrl ? (
                <code className="font-mono text-text-secondary">{vaultUrl}</code>
              ) : (
                <span className="text-text-muted">…</span>
              )}
            </span>
          </div>
          {vaultUrl && (
            <a
              href={vaultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
          )}
        </div>

        {vaultUrl ? (
          <iframe
            src={vaultUrl}
            title="OneCLI Vault"
            className="flex-1 w-full border-0 bg-white"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
            Loading vault…
          </div>
        )}
      </div>
    </>
  );
}
