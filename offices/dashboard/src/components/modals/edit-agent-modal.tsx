'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X, Bot, Loader2, CheckCircle, AlertCircle, FileText, Settings,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Agent } from '@/types';

interface EditAgentModalProps {
  agent: Agent | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const MODEL_OPTIONS = [
  { value: 'haiku', label: 'Haiku — fast / cheap' },
  { value: 'sonnet', label: 'Sonnet — balanced' },
  { value: 'opus', label: 'Opus — most capable' },
  { value: 'ollama-llama3.2', label: 'Ollama Llama 3.2 (local)' },
  { value: 'ollama-qwen3', label: 'Ollama Qwen3 (local)' },
] as const;

type Tab = 'attributes' | 'markdown';

interface AttrState {
  displayName: string;
  model: string;
  skill: string;
  pipelinePosition: number;
  receivesFrom: string;
  deliversTo: string;
}

const EMPTY_ATTRS: AttrState = {
  displayName: '',
  model: 'sonnet',
  skill: '',
  pipelinePosition: 1,
  receivesFrom: '',
  deliversTo: '',
};

export function EditAgentModal({ agent, open, onClose, onSaved }: EditAgentModalProps) {
  const [tab, setTab] = useState<Tab>('attributes');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [skills, setSkills] = useState<string[]>([]);
  const [attrs, setAttrs] = useState<AttrState>(EMPTY_ATTRS);
  const [rawMarkdown, setRawMarkdown] = useState('');

  // Reset and load whenever the modal opens for a new agent.
  useEffect(() => {
    if (!open || !agent) return;
    setTab('attributes');
    setError('');
    setSuccess(false);
    setLoading(true);

    fetch(`/api/agents/${encodeURIComponent(agent.office)}/${encodeURIComponent(agent.slug)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const fm = (data.frontmatter || {}) as Record<string, string>;
        setAttrs({
          displayName: data.displayName || agent.name,
          model: fm.model || agent.model || 'sonnet',
          skill: fm.skill || (agent.skills?.[0] ?? ''),
          pipelinePosition: parseInt(fm.pipeline_position || String(agent.pipelinePosition), 10) || 1,
          receivesFrom: fm.receives_from || '',
          deliversTo: fm.delivers_to || '',
        });
        setRawMarkdown(data.rawContent || '');
      })
      .catch((err) => setError(err.message || 'Failed to load agent'))
      .finally(() => setLoading(false));
  }, [open, agent]);

  // Load office skill list for the skill dropdown.
  useEffect(() => {
    if (!open || !agent) return;
    fetch(`/api/agents/meta?office=${encodeURIComponent(agent.office)}`)
      .then((r) => r.json())
      .then((d) => setSkills(d.skills || []))
      .catch(() => setSkills([]));
  }, [open, agent]);

  const updateAttr = useCallback(<K extends keyof AttrState>(field: K, value: AttrState[K]) => {
    setAttrs((s) => ({ ...s, [field]: value }));
  }, []);

  const handleSave = async () => {
    if (!agent) return;
    setSubmitting(true);
    setError('');
    try {
      const body =
        tab === 'attributes'
          ? { mode: 'attributes' as const, attributes: attrs }
          : { mode: 'markdown' as const, rawMarkdown };

      const res = await fetch(
        `/api/agents/${encodeURIComponent(agent.office)}/${encodeURIComponent(agent.slug)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update agent');
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

  if (!open || !agent) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface-1 border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl animate-slide-up flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Edit Agent</h2>
              <p className="text-xs text-text-muted">
                {agent.office} / {agent.slug}.md
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          <TabButton
            active={tab === 'attributes'}
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Atributos"
            onClick={() => setTab('attributes')}
          />
          <TabButton
            active={tab === 'markdown'}
            icon={<FileText className="w-3.5 h-3.5" />}
            label="Markdown"
            onClick={() => setTab('markdown')}
          />
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle className="w-12 h-12 text-status-online" />
              <p className="text-lg font-bold">Saved!</p>
              <p className="text-sm text-text-muted">{agent.name} updated</p>
            </div>
          ) : tab === 'attributes' ? (
            <>
              <Field
                label="Display Name"
                value={attrs.displayName}
                onChange={(v) => updateAttr('displayName', v)}
                placeholder="e.g. Content Writer"
              />
              <div className="grid grid-cols-2 gap-4">
                <SelectField
                  label="Model"
                  value={attrs.model}
                  options={MODEL_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
                  onChange={(v) => updateAttr('model', v)}
                />
                <Field
                  label="Pipeline Position"
                  type="number"
                  value={String(attrs.pipelinePosition)}
                  onChange={(v) => updateAttr('pipelinePosition', parseInt(v, 10) || 1)}
                />
              </div>
              <Field
                label="Skills"
                value={attrs.skill}
                onChange={(v) => updateAttr('skill', v)}
                placeholder={
                  skills.length > 0
                    ? `e.g. ${skills.slice(0, 3).join(', ')}`
                    : 'Comma-separated skill names'
                }
              />
              {skills.length > 0 && (
                <p className="text-[10px] text-text-muted -mt-2">
                  Available in this office: {skills.join(', ')}
                </p>
              )}
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Receives From"
                  value={attrs.receivesFrom}
                  onChange={(v) => updateAttr('receivesFrom', v)}
                  placeholder="e.g. Content Writer"
                />
                <Field
                  label="Delivers To"
                  value={attrs.deliversTo}
                  onChange={(v) => updateAttr('deliversTo', v)}
                  placeholder="e.g. Content Reviewer"
                />
              </div>
              <p className="text-[10px] text-text-muted leading-relaxed border-t border-border pt-3">
                Salvar nesta aba atualiza apenas o frontmatter e o título do agente —
                o conteúdo do corpo (Identity, Mission, Operating rules, etc.) é preservado.
                Para editar o corpo, use a aba <strong className="text-text-secondary">Markdown</strong>.
              </p>
            </>
          ) : (
            <>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Conteúdo .md (frontmatter + corpo)
              </label>
              <textarea
                value={rawMarkdown}
                onChange={(e) => setRawMarkdown(e.target.value)}
                spellCheck={false}
                className="w-full h-[55vh] px-3 py-2 bg-surface-0 border border-border rounded-lg text-xs font-mono text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors resize-none leading-relaxed"
              />
              <p className="text-[10px] text-text-muted leading-relaxed">
                Salvar nesta aba sobrescreve o arquivo inteiro com o conteúdo acima.
                Mantenha o bloco de frontmatter <code className="text-text-secondary">---</code> no início.
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-colors"
            >
              Cancel
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
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local form components (mirrors create-agent-modal styling)
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

function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  allowEmpty,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-surface-0 border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors"
      >
        {(allowEmpty || !value) && (
          <option value="">{placeholder || `Select ${label.toLowerCase()}...`}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
