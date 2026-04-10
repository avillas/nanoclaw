'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Building2, Loader2, CheckCircle, AlertCircle,
  Settings, FileText, Heart,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Office } from '@/types';

interface EditOfficeModalProps {
  office: Office | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type Tab = 'metadata' | 'claudemd' | 'soul';

interface MetadataState {
  displayName: string;
  mission: string;
  dailyBudget: string;
  monthlyBudget: string;
}

const EMPTY_META: MetadataState = {
  displayName: '',
  mission: '',
  dailyBudget: '0',
  monthlyBudget: '0',
};

export function EditOfficeModal({ office, open, onClose, onSaved }: EditOfficeModalProps) {
  const [tab, setTab] = useState<Tab>('metadata');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [meta, setMeta] = useState<MetadataState>(EMPTY_META);
  const [claudeMd, setClaudeMd] = useState('');
  const [soulMd, setSoulMd] = useState('');

  useEffect(() => {
    if (!open || !office) return;
    setTab('metadata');
    setError('');
    setSuccess(false);
    setLoading(true);

    fetch(`/api/offices/${encodeURIComponent(office.name)}/edit`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const m = data.metadata || {};
        setMeta({
          displayName: m.displayName || office.displayName,
          mission: m.mission || '',
          dailyBudget: m.dailyBudget || String(office.dailyBudget),
          monthlyBudget: m.monthlyBudget || String(office.monthlyBudget),
        });
        setClaudeMd(data.claudeMd || '');
        setSoulMd(data.soulMd || '');
      })
      .catch((err) => setError(err.message || 'Failed to load office data'))
      .finally(() => setLoading(false));
  }, [open, office]);

  const updateMeta = useCallback(<K extends keyof MetadataState>(field: K, value: MetadataState[K]) => {
    setMeta((s) => ({ ...s, [field]: value }));
  }, []);

  const handleSave = async () => {
    if (!office) return;
    setSubmitting(true);
    setError('');
    try {
      let body: any;
      if (tab === 'metadata') {
        body = { mode: 'metadata', metadata: meta };
      } else if (tab === 'claudemd') {
        body = { mode: 'claudemd', rawMarkdown: claudeMd };
      } else {
        body = { mode: 'soul', rawMarkdown: soulMd };
      }

      const res = await fetch(
        `/api/offices/${encodeURIComponent(office.name)}/edit`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update office');
      setSuccess(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !office) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Editar Escritorio</h2>
              <p className="text-xs text-text-muted truncate">
                offices/{office.name}/
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-4 sm:px-6">
          <TabButton
            active={tab === 'metadata'}
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Dados"
            onClick={() => setTab('metadata')}
          />
          <TabButton
            active={tab === 'claudemd'}
            icon={<FileText className="w-3.5 h-3.5" />}
            label="CLAUDE.md"
            onClick={() => setTab('claudemd')}
          />
          <TabButton
            active={tab === 'soul'}
            icon={<Heart className="w-3.5 h-3.5" />}
            label="SOUL.md"
            onClick={() => setTab('soul')}
          />
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="w-12 h-12 text-status-online" />
              <p className="text-lg font-bold">Salvo!</p>
              <p className="text-sm text-text-muted">{office.displayName} atualizado</p>
            </div>
          ) : tab === 'metadata' ? (
            <>
              <Field
                label="Nome do Escritorio"
                value={meta.displayName}
                onChange={(v) => updateMeta('displayName', v)}
                placeholder="e.g. Marketing Office"
              />
              <TextAreaField
                label="Missao (focused on ...)"
                value={meta.mission}
                onChange={(v) => updateMeta('mission', v)}
                placeholder="e.g. creating, reviewing, optimizing, and publishing digital marketing campaigns"
                rows={3}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Budget Diario (R$)"
                  type="text"
                  value={meta.dailyBudget}
                  onChange={(v) => updateMeta('dailyBudget', v)}
                  placeholder="e.g. 15.00"
                />
                <Field
                  label="Budget Mensal (R$)"
                  type="text"
                  value={meta.monthlyBudget}
                  onChange={(v) => updateMeta('monthlyBudget', v)}
                  placeholder="e.g. 100.00"
                />
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
                Salvar nesta aba atualiza o titulo, a missao e os budgets no CLAUDE.md —
                as secoes de Team, Pipeline e regras operacionais sao preservadas.
                Para editar o arquivo completo, use a aba <strong className="text-text-secondary">CLAUDE.md</strong>.
              </p>
            </>
          ) : tab === 'claudemd' ? (
            <>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                CLAUDE.md (instrucoes do escritorio)
              </label>
              <textarea
                value={claudeMd}
                onChange={(e) => setClaudeMd(e.target.value)}
                spellCheck={false}
                className="w-full h-[60vh] sm:h-[55vh] px-3 py-2 bg-surface-0 border border-border rounded-lg text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none leading-relaxed"
              />
              <p className="text-[10px] text-text-muted leading-relaxed">
                Salvar nesta aba sobrescreve o CLAUDE.md inteiro. As secoes <code className="text-text-secondary">{'<!-- AGENTS:START -->'}</code> / <code className="text-text-secondary">{'<!-- AGENTS:END -->'}</code> serao
                regeneradas automaticamente a partir dos agentes.
              </p>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                SOUL.md (personalidade do escritorio)
              </label>
              <textarea
                value={soulMd}
                onChange={(e) => setSoulMd(e.target.value)}
                spellCheck={false}
                className="w-full h-[60vh] sm:h-[55vh] px-3 py-2 bg-surface-0 border border-border rounded-lg text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none leading-relaxed"
              />
              <p className="text-[10px] text-text-muted leading-relaxed">
                Salvar nesta aba sobrescreve o SOUL.md inteiro. Este arquivo define
                a personalidade, valores e estilo de comunicacao do escritorio.
              </p>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
              <p className="text-sm text-status-error">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={submitting || loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-accent text-black hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              Salvar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local form components
// ---------------------------------------------------------------------------

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors -mb-px',
        active
          ? 'border-accent text-accent'
          : 'border-transparent text-text-muted hover:text-text-secondary',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
      />
    </div>
  );
}

function TextAreaField({
  label,
  placeholder,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none"
      />
    </div>
  );
}
