'use client';

import { useState, useEffect } from 'react';
import { X, Send, ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle, MessageCircle, RefreshCw, Link2 } from 'lucide-react';
import { cn } from '@/lib/cn';

interface TelegramConfigModalProps {
  open: boolean;
  onClose: () => void;
  onConfigured: () => void;
  officeName: string;
  officeDisplayName: string;
}

interface StepResult {
  step: string;
  status: 'ok' | 'error';
  detail?: string;
}

interface ChatInfo {
  id: string;
  title: string;
  type: string;
}

const STEPS = ['Select Group', 'Configure', 'Done'] as const;

export function TelegramConfigModal({ open, onClose, onConfigured, officeName, officeDisplayName }: TelegramConfigModalProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 0: Group selection
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatInfo | null>(null);
  const [manualGroupId, setManualGroupId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [triggerWord, setTriggerWord] = useState(`@${officeName}`);

  // Step 1: Results
  const [configSteps, setConfigSteps] = useState<StepResult[]>([]);
  const [configSuccess, setConfigSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setError('');
      setChats([]);
      setSelectedChat(null);
      setManualGroupId('');
      setShowManual(false);
      setTriggerWord(`@${officeName}`);
      setConfigSteps([]);
      setConfigSuccess(false);
    }
  }, [open, officeName]);

  // Load chats from the global bot
  const handleLoadChats = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-chats' }),
      });
      const data = await res.json();
      const groupChats = (data.chats || []).filter((c: ChatInfo) => c.type === 'group' || c.type === 'supergroup');
      setChats(groupChats);
      if (groupChats.length === 0) {
        setShowManual(true);
      }
    } catch {
      setError('Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  // Auto-load chats when opening
  useEffect(() => {
    if (open && step === 0 && chats.length === 0) {
      handleLoadChats();
    }
  }, [open, step]);

  // Link group to office
  const handleLinkGroup = async () => {
    setLoading(true);
    setError('');
    try {
      const groupId = selectedChat ? selectedChat.id : manualGroupId;
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'link-group',
          office: officeName,
          groupId,
          triggerWord,
        }),
      });
      const data = await res.json();
      setConfigSteps(data.steps || []);
      setConfigSuccess(data.success);
      if (!data.success) setError(data.error || 'Configuration had errors');
    } catch {
      setError('Failed to configure');
    } finally {
      setLoading(false);
    }
  };

  // Auto-configure when entering step 1
  useEffect(() => {
    if (step === 1 && (selectedChat || manualGroupId)) {
      handleLinkGroup();
    }
  }, [step]);

  const canNext = () => {
    if (step === 0) return selectedChat || manualGroupId;
    return true;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-xl max-h-[95vh] sm:max-h-[85vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Link2 className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Vincular Grupo</h2>
              <p className="text-xs text-text-muted truncate">{officeDisplayName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-4 sm:px-6 pt-4 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={cn('h-1 rounded-full transition-colors', i <= step ? 'bg-blue-400' : 'bg-surface-3')} />
              <p className={cn('text-[10px] mt-1 font-mono uppercase tracking-wider', i <= step ? 'text-blue-400' : 'text-text-muted')}>{s}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 space-y-4">

          {/* Step 0: Select Group */}
          {step === 0 && (
            <>
              <p className="text-xs text-text-muted">
                Selecione o grupo do Telegram que sera vinculado ao escritorio <span className="font-medium text-text-secondary">{officeDisplayName}</span>.
                O bot precisa estar no grupo e alguem deve ter enviado uma mensagem.
              </p>

              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="ml-2 text-sm text-text-muted">Buscando grupos...</span>
                </div>
              )}

              {!loading && chats.length > 0 && (
                <div className="space-y-2">
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => { setSelectedChat(chat); setManualGroupId(''); }}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                        selectedChat?.id === chat.id
                          ? 'border-blue-400/50 bg-blue-500/10'
                          : 'border-border bg-surface-0 hover:border-border-hover'
                      )}
                    >
                      <MessageCircle className={cn('w-5 h-5', selectedChat?.id === chat.id ? 'text-blue-400' : 'text-text-muted')} />
                      <div>
                        <p className="text-sm font-medium">{chat.title}</p>
                        <p className="text-xs font-mono text-text-muted">ID: {chat.id} ({chat.type})</p>
                      </div>
                      {selectedChat?.id === chat.id && <CheckCircle className="w-4 h-4 text-blue-400 ml-auto" />}
                    </button>
                  ))}
                  <button onClick={() => setShowManual(true)} className="text-xs text-blue-400 hover:underline">
                    Inserir ID manualmente
                  </button>
                </div>
              )}

              {!loading && chats.length === 0 && !showManual && (
                <div className="text-center py-6">
                  <p className="text-sm text-text-muted mb-3">Nenhum grupo encontrado. Certifique-se de que o bot foi adicionado a um grupo e alguem enviou uma mensagem.</p>
                  <div className="flex justify-center gap-2">
                    <button onClick={handleLoadChats} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-text-secondary hover:bg-surface-3 transition-colors flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                    </button>
                    <button onClick={() => setShowManual(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 text-text-secondary hover:bg-surface-3 transition-colors">
                      Inserir manualmente
                    </button>
                  </div>
                </div>
              )}

              {showManual && (
                <div className="mt-2">
                  {chats.length > 0 && (
                    <button onClick={() => setShowManual(false)} className="text-xs text-blue-400 hover:underline mb-2 block">
                      ← Voltar para lista
                    </button>
                  )}
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Chat ID do grupo (manual)</label>
                  <input
                    placeholder="-1001234567890"
                    value={manualGroupId}
                    onChange={(e) => { setManualGroupId(e.target.value); setSelectedChat(null); }}
                    className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition-colors"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    Obtenha o ID enviando uma mensagem no grupo e verificando via API do Telegram.
                  </p>
                </div>
              )}

              {(selectedChat || manualGroupId) && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-text-secondary mb-1.5">Trigger Word</label>
                  <input
                    value={triggerWord}
                    onChange={(e) => setTriggerWord(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm font-mono focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/20 transition-colors"
                  />
                  <p className="text-[10px] text-text-muted mt-1">Mensagens com este trigger ativam o escritorio. Deixe vazio para todas as mensagens.</p>
                </div>
              )}
            </>
          )}

          {/* Step 1: Configure (auto-runs) */}
          {step === 1 && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                  <span className="ml-2 text-sm text-text-muted">Vinculando grupo...</span>
                </div>
              )}

              {!loading && configSteps.length > 0 && (
                <div className="space-y-2">
                  {configSteps.map((s, i) => (
                    <div key={i} className={cn(
                      'flex items-start gap-2 p-3 rounded-lg border',
                      s.status === 'ok' ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'
                    )}>
                      {s.status === 'ok'
                        ? <CheckCircle className="w-4 h-4 text-status-online flex-shrink-0 mt-0.5" />
                        : <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0 mt-0.5" />
                      }
                      <div>
                        <p className="text-sm font-medium">{s.step}</p>
                        {s.detail && <p className="text-xs text-text-muted mt-0.5 font-mono">{s.detail}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Step 2: Done */}
          {step === 2 && (
            <div className="flex flex-col items-center gap-4 py-8">
              {configSuccess ? (
                <>
                  <CheckCircle className="w-14 h-14 text-status-online" />
                  <div className="text-center">
                    <p className="text-lg font-bold">Grupo Vinculado!</p>
                    <p className="text-sm text-text-muted mt-1">
                      O escritorio {officeDisplayName} agora recebe mensagens do grupo vinculado.
                    </p>
                  </div>
                  <div className="bg-surface-0 rounded-lg p-4 border border-border text-xs text-text-muted w-full max-w-sm">
                    <p className="font-medium text-text-secondary mb-2">Teste:</p>
                    <p>Envie uma mensagem no grupo e verifique se o bot responde em 3-5 segundos.</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-14 h-14 text-status-warning" />
                  <div className="text-center">
                    <p className="text-lg font-bold">Parcialmente Configurado</p>
                    <p className="text-sm text-text-muted mt-1">Alguns passos tiveram problemas. Verifique os detalhes acima.</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-border">
          <button
            onClick={() => step > 0 && step < 2 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 || step === 2 ? 'Fechar' : 'Voltar'}
          </button>
          {step === 0 ? (
            <button
              onClick={() => setStep(1)}
              disabled={!canNext()}
              className={cn(
                'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                canNext() ? 'bg-blue-500 text-white hover:bg-blue-500/90' : 'bg-surface-3 text-text-muted cursor-not-allowed'
              )}
            >
              Vincular <ChevronRight className="w-4 h-4" />
            </button>
          ) : step === 1 && !loading ? (
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-500/90 transition-colors"
            >
              {configSuccess ? 'Concluir' : 'Continuar'} <ChevronRight className="w-4 h-4" />
            </button>
          ) : step === 2 ? (
            <button
              onClick={() => { onConfigured(); onClose(); }}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-500/90 transition-colors"
            >
              <CheckCircle className="w-4 h-4" /> Pronto
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
