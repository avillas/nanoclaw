'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Bot, ChevronRight, ChevronLeft, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface CreateAgentModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  preselectedOffice?: string;
}

const MODEL_OPTIONS = [
  { value: 'haiku', label: 'Haiku', desc: 'Fast, cheap — validation, formatting' },
  { value: 'sonnet', label: 'Sonnet', desc: 'Balanced — creation, analysis, implementation' },
  { value: 'opus', label: 'Opus', desc: 'Powerful — complex decisions only' },
] as const;

const STEPS = ['Basics', 'Identity', 'Rules', 'Review'] as const;

export function CreateAgentModal({ open, onClose, onCreated, preselectedOffice }: CreateAgentModalProps) {
  // Meta data
  const [offices, setOffices] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);

  // Form state
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    name: '',
    displayName: '',
    office: preselectedOffice || '',
    skill: '',
    model: 'sonnet' as string,
    pipelinePosition: 1,
    receivesFrom: '',
    deliversTo: '',
    identity: '',
    mission: '',
    operatingRules: '',
    deliverables: '',
    completionCriteria: '',
    modelEscalation: '',
  });

  // Auto-generate slug from display name
  useEffect(() => {
    if (form.displayName) {
      const slug = form.displayName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      setForm((f) => ({ ...f, name: slug }));
    }
  }, [form.displayName]);

  // Load meta
  useEffect(() => {
    if (!open) return;
    fetch('/api/agents/meta').then((r) => r.json()).then((d) => {
      setOffices(d.offices || []);
    });
  }, [open]);

  // Load skills when office changes
  useEffect(() => {
    if (!form.office) return;
    fetch(`/api/agents/meta?office=${form.office}`).then((r) => r.json()).then((d) => {
      setSkills(d.skills || []);
    });
  }, [form.office]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0);
      setError('');
      setSuccess(false);
      setForm((f) => ({ ...f, office: preselectedOffice || f.office }));
    }
  }, [open, preselectedOffice]);

  const update = useCallback((field: string, value: string | number) => {
    setForm((f) => ({ ...f, [field]: value }));
  }, []);

  const canNext = () => {
    if (step === 0) return form.displayName && form.office && form.model;
    if (step === 1) return form.identity && form.mission;
    if (step === 2) return form.operatingRules && form.deliverables;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create agent');
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-1 border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Create Agent</h2>
              <p className="text-xs text-text-muted">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-2 transition-colors">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={cn(
                'h-1 rounded-full transition-colors',
                i <= step ? 'bg-accent' : 'bg-surface-3'
              )} />
              <p className={cn('text-[10px] mt-1 font-mono uppercase tracking-wider', i <= step ? 'text-accent' : 'text-text-muted')}>{s}</p>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[60vh] space-y-4">
          {/* Step 0: Basics */}
          {step === 0 && (
            <>
              <Field label="Display Name" placeholder="e.g. Content Writer" value={form.displayName} onChange={(v) => update('displayName', v)} />
              <Field label="Slug" placeholder="auto-generated" value={form.name} onChange={(v) => update('name', v)} hint="Used as filename" />
              <SelectField label="Office" value={form.office} options={offices.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }))} onChange={(v) => update('office', v)} />
              <div className="grid grid-cols-2 gap-4">
                <SelectField label="Model" value={form.model} options={MODEL_OPTIONS.map((m) => ({ value: m.value, label: `${m.label} — ${m.desc}` }))} onChange={(v) => update('model', v)} />
                <Field label="Pipeline Position" type="number" value={String(form.pipelinePosition)} onChange={(v) => update('pipelinePosition', parseInt(v) || 1)} />
              </div>
              <SelectField label="Primary Skill" value={form.skill} options={skills.map((s) => ({ value: s, label: s }))} onChange={(v) => update('skill', v)} placeholder="Select office first" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Receives From" placeholder="e.g. Content Writer" value={form.receivesFrom} onChange={(v) => update('receivesFrom', v)} />
                <Field label="Delivers To" placeholder="e.g. Content Reviewer" value={form.deliversTo} onChange={(v) => update('deliversTo', v)} />
              </div>
            </>
          )}

          {/* Step 1: Identity */}
          {step === 1 && (
            <>
              <TextArea label="Identity" placeholder="Who is this agent? What is their specialty?" value={form.identity} onChange={(v) => update('identity', v)} rows={4} />
              <TextArea label="Mission" placeholder="What is this agent's primary mission?" value={form.mission} onChange={(v) => update('mission', v)} rows={4} />
            </>
          )}

          {/* Step 2: Rules */}
          {step === 2 && (
            <>
              <TextArea label="Operating Rules" placeholder="- ALWAYS do X&#10;- NEVER do Y&#10;- ..." value={form.operatingRules} onChange={(v) => update('operatingRules', v)} rows={5} />
              <TextArea label="Deliverables" placeholder="What must this agent produce?" value={form.deliverables} onChange={(v) => update('deliverables', v)} rows={4} />
              <TextArea label="Completion Criteria" placeholder="When is the task considered done?" value={form.completionCriteria} onChange={(v) => update('completionCriteria', v)} rows={3} />
              <TextArea label="Model Escalation" placeholder="When to use a different model?" value={form.modelEscalation} onChange={(v) => update('modelEscalation', v)} rows={3} />
            </>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-3">
              {success ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle className="w-12 h-12 text-status-online" />
                  <p className="text-lg font-bold">Agent Created!</p>
                  <p className="text-sm text-text-muted">{form.displayName} added to {form.office}</p>
                </div>
              ) : (
                <>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">Summary</h3>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
                      <ReviewRow label="Name" value={form.displayName} />
                      <ReviewRow label="Office" value={form.office} />
                      <ReviewRow label="Model" value={form.model} />
                      <ReviewRow label="Skill" value={form.skill || '—'} />
                      <ReviewRow label="Pipeline #" value={String(form.pipelinePosition)} />
                      <ReviewRow label="Receives From" value={form.receivesFrom || '—'} />
                      <ReviewRow label="Delivers To" value={form.deliversTo || '—'} />
                    </div>
                  </div>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-2">Identity</h3>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{form.identity}</p>
                  </div>
                  <div className="bg-surface-0 rounded-xl p-4 border border-border">
                    <h3 className="font-mono text-xs text-text-muted uppercase tracking-wider mb-2">Mission</h3>
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">{form.mission}</p>
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
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
                  canNext() ? 'bg-accent text-black hover:bg-accent/90' : 'bg-surface-3 text-text-muted cursor-not-allowed'
                )}
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-accent text-black hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Create Agent
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form components
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
        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none font-mono text-xs"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange, placeholder }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
      >
        <option value="">{placeholder || `Select ${label.toLowerCase()}...`}</option>
        {options.map((o) => (
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
