'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { TelegramConfigModal } from '@/components/modals/telegram-config-modal';
import {
  Send, CheckCircle, AlertCircle, Loader2, ExternalLink,
  MessageCircle, RefreshCw, Settings, Link2,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface GlobalBot {
  botToken: string | null;
  botTokenMasked: string | null;
  botUsername?: string;
}

interface OfficeGroup {
  office: string;
  groupId: string | null;
  isRegistered: boolean;
  hasGlobalBot: boolean;
}

export default function TelegramPage() {
  const [globalBot, setGlobalBot] = useState<GlobalBot | null>(null);
  const [offices, setOffices] = useState<OfficeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Token config state
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenTesting, setTokenTesting] = useState(false);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenUsername, setTokenUsername] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [saving, setSaving] = useState(false);

  // Group link modal
  const [linkOffice, setLinkOffice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setGlobalBot(data.global || null);
        setOffices(data.offices || []);
      }
    } catch {
      // Network error — keep previously loaded state instead of clobbering it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTestToken = async () => {
    setTokenTesting(true);
    setTokenError('');
    setTokenValid(false);
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-token', token: tokenInput }),
      });
      const data = await res.json();
      if (data.valid) {
        setTokenValid(true);
        setTokenUsername(data.username || '');
      } else {
        setTokenError(data.error || 'Invalid token');
      }
    } catch {
      setTokenError('Connection failed');
    } finally {
      setTokenTesting(false);
    }
  };

  const handleSaveToken = async () => {
    setSaving(true);
    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-token', token: tokenInput }),
      });
      setShowTokenForm(false);
      setTokenInput('');
      setTokenValid(false);
      setTokenUsername('');
      await loadData();
    } catch {
      setTokenError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const connectedCount = offices.filter((o) => o.groupId && o.hasGlobalBot).length;
  const hasBot = !!globalBot?.botTokenMasked;

  if (loading) {
    return (
      <>
        <Header title="Telegram" description="Bot configuration and office group mapping" />
        <div className="p-4 sm:p-6 lg:p-8 flex justify-center">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Telegram" description="Bot configuration and office group mapping" />

      <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">

        {/* Global Bot Card */}
        <div className={cn(
          'card p-6',
          hasBot ? 'border-green-500/20' : 'border-amber-500/20'
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
              hasBot ? 'bg-green-500/10' : 'bg-amber-500/10'
            )}>
              <Send className={cn('w-6 h-6', hasBot ? 'text-status-online' : 'text-status-warning')} />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold mb-1">Bot Telegram</h2>
              {hasBot ? (
                <div className="space-y-1">
                  <p className="text-sm text-text-secondary">
                    Token: <span className="font-mono text-text-muted">{globalBot!.botTokenMasked}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {connectedCount} de {offices.length} escritorios conectados
                  </p>
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  Nenhum bot configurado. Configure o token do @BotFather para conectar escritorios ao Telegram.
                </p>
              )}
            </div>

            <button
              onClick={() => { setShowTokenForm(!showTokenForm); setTokenError(''); setTokenValid(false); setTokenInput(''); }}
              className={cn(
                'px-4 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0',
                hasBot
                  ? 'bg-surface-2 text-text-secondary hover:bg-surface-3'
                  : 'bg-blue-500 text-white hover:bg-blue-500/90'
              )}
            >
              <Settings className="w-3.5 h-3.5" />
              {hasBot ? 'Alterar Token' : 'Configurar Bot'}
            </button>
          </div>

          {/* Token form (expandable) */}
          {showTokenForm && (
            <div className="mt-5 pt-5 border-t border-border space-y-4">
              <div className="bg-surface-0 rounded-lg p-3 border border-border text-xs text-text-muted space-y-2">
                <p>1. Abra o Telegram e procure <span className="font-mono text-text-secondary">@BotFather</span></p>
                <p>2. Envie <span className="font-mono text-text-secondary">/newbot</span> e siga as instrucoes</p>
                <p>3. Copie o token e cole abaixo</p>
                <p>4. Desabilite Group Privacy: <span className="font-mono text-text-secondary">BotFather → /mybots → Bot Settings → Group Privacy → Turn off</span></p>
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:underline">
                  Abrir BotFather <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Bot Token</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    value={tokenInput}
                    onChange={(e) => { setTokenInput(e.target.value); setTokenValid(false); setTokenError(''); }}
                    className="flex-1 px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition-colors font-mono text-xs"
                  />
                  <button
                    onClick={handleTestToken}
                    disabled={!tokenInput || tokenTesting}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-500/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {tokenTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Validar
                  </button>
                </div>
              </div>

              {tokenValid && (
                <div className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-status-online flex-shrink-0" />
                    <p className="text-sm text-status-online">Valido! Bot: <span className="font-mono">@{tokenUsername}</span></p>
                  </div>
                  <button
                    onClick={handleSaveToken}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-500/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Salvar
                  </button>
                </div>
              )}

              {tokenError && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                  <p className="text-sm text-status-error">{tokenError}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Office Groups */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono text-text-muted uppercase tracking-widest">
              Grupos por Escritorio
            </h2>
            {!hasBot && (
              <span className="text-xs text-status-warning">Configure o bot acima primeiro</span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {offices.map((office) => {
              const connected = office.hasGlobalBot && !!office.groupId;
              return (
                <div
                  key={office.office}
                  className={cn(
                    'card p-5 transition-all',
                    connected ? 'border-green-500/20' : 'border-border'
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center',
                      connected ? 'bg-green-500/10' : 'bg-surface-3'
                    )}>
                      <MessageCircle className={cn('w-4 h-4', connected ? 'text-status-online' : 'text-text-muted')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold capitalize">{office.office}</p>
                      <p className="text-[10px] font-mono text-text-muted">
                        {connected ? `Grupo: ${office.groupId}` : 'Sem grupo vinculado'}
                      </p>
                    </div>
                    {connected && <CheckCircle className="w-4 h-4 text-status-online flex-shrink-0" />}
                  </div>

                  {office.isRegistered && (
                    <p className="text-[10px] text-status-online mb-3">Registrado no NanoClaw</p>
                  )}

                  <button
                    onClick={() => setLinkOffice(office.office)}
                    disabled={!hasBot}
                    className={cn(
                      'w-full px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                      hasBot
                        ? connected
                          ? 'bg-surface-2 text-text-secondary hover:bg-surface-3'
                          : 'bg-blue-500 text-white hover:bg-blue-500/90'
                        : 'bg-surface-3 text-text-muted cursor-not-allowed'
                    )}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    {connected ? 'Alterar Grupo' : 'Vincular Grupo'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* How it works */}
        <div className="card p-5 border-border">
          <h3 className="text-xs font-mono text-text-muted uppercase tracking-widest mb-3">Como funciona</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-text-muted">
            <div className="space-y-1">
              <p className="font-medium text-text-secondary">1. Bot unico</p>
              <p>Um unico bot Telegram atende todos os escritorios. Configure o token acima.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-text-secondary">2. Grupos distintos</p>
              <p>Cada escritorio tem seu proprio grupo. O bot identifica o escritorio pelo grupo de origem.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-text-secondary">3. Resposta contextual</p>
              <p>Mensagens no grupo de Marketing ativam agentes de Marketing. Mesmo bot, contextos diferentes.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Group link modal */}
      {linkOffice && (
        <TelegramConfigModal
          open={true}
          onClose={() => setLinkOffice(null)}
          onConfigured={() => { setLinkOffice(null); loadData(); }}
          officeName={linkOffice}
          officeDisplayName={linkOffice.charAt(0).toUpperCase() + linkOffice.slice(1)}
        />
      )}
    </>
  );
}
