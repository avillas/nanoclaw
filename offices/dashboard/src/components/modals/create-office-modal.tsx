'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Building2, ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MODEL_GROUPS } from '@/lib/model-options';

interface CreateOfficeModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = ['Basics', 'Soul (pt. 1)', 'Soul (pt. 2)', 'Review'] as const;

export function CreateOfficeModal({ open, onClose, onCreated }: CreateOfficeModalProps) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    displayName: '',
    mission: '',
    defaultModel: 'sonnet',
    dailyBudget: 15,
    monthlyBudget: 100,
    soul: {
      quemSomos: '',
      comoPensamos: '',
      comoNosComunicamos: '',
      nossosValores: '',
      comoRaciocinamos: '',
      oQueNaoToleramos: '',
      relacaoComOutrosEscritorios: '',
      estiloDeEntrega: '',
    },
  });

  // Auto-generate slug
  useEffect(() => {
    if (form.displayName) {
      const slug = form.displayName
        .toLowerCase()
        .replace(/\s*office\s*/gi, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setForm((f) => ({ ...f, name: slug }));
    }
  }, [form.displayName]);

  useEffect(() => {
    if (open) {
      setStep(0);
      setError('');
      setSuccess(false);
    }
  }, [open]);

  const update = useCallback((field: string, value: string | number) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  const updateSoul = useCallback((field: string, value: string) => {
    setForm((f) => ({ ...f, soul: { ...f.soul, [field]: value } }));
  }, []);

  const canNext = () => {
    if (step === 0) return form.displayName && form.mission && form.dailyBudget > 0;
    if (step === 1) return form.soul.quemSomos && form.soul.comoPensamos && form.soul.comoNosComunicamos && form.soul.nossosValores;
    if (step === 2) return form.soul.comoRaciocinamos && form.soul.oQueNaoToleramos;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create office');
      setSuccess(true);
      setTimeout(() => {
        onCreated();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-surface-1 border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-purple-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Create Office</h2>
              <p className="text-xs text-text-muted truncate">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
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
              <div className={cn('h-1 rounded-full transition-colors', i <= step ? 'bg-purple-400' : 'bg-surface-3')} />
              <p className={cn('text-[10px] mt-1 font-mono uppercase tracking-wider', i <= step ? 'text-purple-400' : 'text-text-muted')}>{s}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 space-y-4">
          {/* Step 0: Basics */}
          {step === 0 && (
            <>
              <Field label="Office Name" placeholder="e.g. Sales Office" value={form.displayName} onChange={(v) => update('displayName', v)} />
              <Field label="Slug" placeholder="auto-generated" value={form.name} onChange={(v) => update('name', v)} hint="Used as folder name" />
              <TextArea label="Mission" placeholder="What does this office do? What's its focus?" value={form.mission} onChange={(v) => update('mission', v)} rows={3} />
              <SelectField label="Default Model" value={form.defaultModel} groups={MODEL_GROUPS} onChange={(v) => update('defaultModel', v)} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Daily Budget (USD)" type="number" value={String(form.dailyBudget)} onChange={(v) => update('dailyBudget', parseFloat(v) || 0)} />
                <Field label="Monthly Budget (USD)" type="number" value={String(form.monthlyBudget)} onChange={(v) => update('monthlyBudget', parseFloat(v) || 0)} />
              </div>
            </>
          )}

          {/* Step 1: Soul pt 1 */}
          {step === 1 && (
            <>
              <p className="text-xs text-text-muted bg-surface-0 p-3 rounded-lg border border-border">
                O SOUL.md define a personalidade do escritório — como pensa, se comunica e entrega. Escreva em português.
              </p>
              <TextArea label="Quem somos" placeholder="Descreva a identidade coletiva do escritório..." value={form.soul.quemSomos} onChange={(v) => updateSoul('quemSomos', v)} rows={3} />
              <TextArea label="Como pensamos" placeholder="Descreva o modelo mental da equipe..." value={form.soul.comoPensamos} onChange={(v) => updateSoul('comoPensamos', v)} rows={3} />
              <TextArea label="Como nos comunicamos" placeholder="Tom e estilo de comunicação..." value={form.soul.comoNosComunicamos} onChange={(v) => updateSoul('comoNosComunicamos', v)} rows={3} />
              <TextArea label="Nossos valores" placeholder="4-6 valores fundamentais..." value={form.soul.nossosValores} onChange={(v) => updateSoul('nossosValores', v)} rows={3} />
            </>
          )}

          {/* Step 2: Soul pt 2 */}
          {step === 2 && (
            <>
              <TextArea label="Como raciocinamos" placeholder="Processo de raciocínio passo a passo diante de uma demanda..." value={form.soul.comoRaciocinamos} onChange={(v) => updateSoul('comoRaciocinamos', v)} rows={3} />
              <TextArea label="O que não toleramos" placeholder="Comportamentos e práticas inaceitáveis..." value={form.soul.oQueNaoToleramos} onChange={(v) => updateSoul('oQueNaoToleramos', v)} rows={3} />
              <TextArea label="Relação com outros escritórios" placeholder="Como interage com os demais escritórios..." value={form.soul.relacaoComOutrosEscritorios} onChange={(v) => updateSoul('relacaoComOutrosEscritorios', v)} rows={3} />
              <TextArea label="Estilo de entrega" placeholder="Formato preferido das entregas..." value={form.soul.estiloDeEntrega} onChange={(v) => updateSoul('estiloDeEntrega', v)} rows={3} />
            </>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-3">
              {success ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle className="w-12 h-12 text-status-online" />
                  <p className="text-lg font-bold">Office Created!</p>
                  <p className="text-sm text-text-muted">{form.displayName} is ready to receive agents</p>
                </div>
              ) : (
                <>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">Summary</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                      <ReviewRow label="Name" value={form.displayName} />
                      <ReviewRow label="Slug" value={form.name} />
                      <ReviewRow label="Model" value={form.defaultModel} />
                      <ReviewRow label="Daily Budget" value={`${form.dailyBudget.toFixed(2)}`} />
                      <ReviewRow label="Monthly Budget" value={`${form.monthlyBudget.toFixed(2)}`} />
                    </div>
                  </div>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-2">Mission</h3>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{form.mission}</p>
                  </div>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-2">SOUL.md</h3>
                    <div className="space-y-2 text-xs text-text-secondary">
                      <p><span className="text-text-muted">Quem somos:</span> {form.soul.quemSomos.slice(0, 80)}...</p>
                      <p><span className="text-text-muted">Como pensamos:</span> {form.soul.comoPensamos.slice(0, 80)}...</p>
                      <p><span className="text-text-muted">Valores:</span> {form.soul.nossosValores.slice(0, 80)}...</p>
                    </div>
                  </div>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-2">Will create</h3>
                    <div className="font-mono text-xs text-text-secondary space-y-1">
                      <p>📁 {form.name}/CLAUDE.md</p>
                      <p>📁 {form.name}/SOUL.md</p>
                      <p>📁 {form.name}/agents/</p>
                      <p>📁 {form.name}/skills/</p>
                      <p>📁 {form.name}/workflows/</p>
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-status-error flex-shrink-0" />
                      <p className="text-sm text-status-error">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-border">
            <button
              onClick={() => step > 0 ? setStep(step - 1) : onClose()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {step > 0 ? 'Back' : 'Cancel'}
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className={cn(
                  'flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                  canNext() ? 'bg-purple-500 text-white hover:bg-purple-500/90' : 'bg-surface-3 text-text-muted cursor-not-allowed'
                )}
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-purple-500 text-white hover:bg-purple-500/90 transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Create Office
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form components (same pattern as CreateAgentModal)
// ---------------------------------------------------------------------------

function Field({ label, placeholder, value, onChange, type = 'text', hint }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void; type?: string; hint?: string;
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
      {hint && <p className="text-[10px] text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

function TextArea({ label, placeholder, value, onChange, rows = 4 }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void; rows?: number;
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

function SelectField({ label, value, options, groups, onChange }: {
  label: string;
  value: string;
  options?: { value: string; label: string }[];
  groups?: { group: string; options: { value: string; label: string }[] }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
      >
        {groups
          ? groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </optgroup>
            ))
          : (options || []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
      </select>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </>
  );
}
