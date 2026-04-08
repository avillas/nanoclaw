'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { CreateSkillModal } from '@/components/modals/create-skill-modal';
import { EditSkillModal } from '@/components/modals/edit-skill-modal';
import { DuplicateSkillModal } from '@/components/modals/duplicate-skill-modal';
import { DeleteSkillModal } from '@/components/modals/delete-skill-modal';
import { Sparkles, Filter, Plus, Pencil, Copy, Trash2, FileText } from 'lucide-react';
import { cn } from '@/lib/cn';
import { refreshState } from '@/lib/api-fetch';
import type { Skill } from '@/types';

const scopeBadgeClass = (scope: string) => {
  if (scope === 'shared') return 'bg-accent/15 text-accent border-accent/20';
  if (scope === 'marketing') return 'badge-marketing';
  if (scope === 'development') return 'badge-development';
  if (scope === 'innovation') return 'badge-innovation';
  return 'bg-surface-3 text-text-muted';
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Skill | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Skill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);

  const loadSkills = useCallback(() => {
    refreshState<Skill[]>('/api/skills', setSkills);
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const scopes = useMemo(() => {
    const set = new Set<string>(['shared']);
    skills.forEach((s) => set.add(s.scope));
    return Array.from(set);
  }, [skills]);

  const filtered = skills.filter((s) => {
    if (scopeFilter !== 'all' && s.scope !== scopeFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (
        !s.name.toLowerCase().includes(q) &&
        !s.displayName.toLowerCase().includes(q) &&
        !s.description.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  // Group filtered skills by scope for the rendering
  const grouped = filtered.reduce<Record<string, Skill[]>>((acc, s) => {
    (acc[s.scope] ||= []).push(s);
    return acc;
  }, {});

  return (
    <>
      <Header title="Skills" description={`${skills.length} skills available`} />

      <div className="p-4 sm:p-6 lg:p-8 animate-fade-in">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4 sm:mb-6">
          <Filter className="w-4 h-4 text-text-muted hidden sm:block" />
          <button
            onClick={() => setScopeFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              scopeFilter === 'all'
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent',
            )}
          >
            All
          </button>
          {scopes.map((s) => (
            <button
              key={s}
              onClick={() => setScopeFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                scopeFilter === s
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'bg-surface-2 text-text-muted hover:text-text-secondary border border-transparent',
              )}
            >
              {s}
            </button>
          ))}
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 w-32 sm:w-48"
          />
          <span className="ml-auto text-xs font-mono text-text-muted mr-1 sm:mr-3">{filtered.length}</span>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-black hover:bg-accent/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Skill
          </button>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="card p-12 flex flex-col items-center gap-3 text-center">
            <Sparkles className="w-10 h-10 text-text-muted" />
            <p className="text-sm text-text-secondary">No skills match your filters</p>
            <button
              onClick={() => setShowCreate(true)}
              className="text-xs text-accent hover:underline"
            >
              Create your first skill
            </button>
          </div>
        )}

        {/* Grouped by scope */}
        {Object.keys(grouped).sort((a, b) => {
          if (a === 'shared') return -1;
          if (b === 'shared') return 1;
          return a.localeCompare(b);
        }).map((scope) => (
          <div key={scope} className="mb-6 sm:mb-8">
            <h2 className="text-xs font-mono text-text-muted uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className={cn('badge', scopeBadgeClass(scope))}>{scope}</span>
              <span>{grouped[scope].length} skill{grouped[scope].length === 1 ? '' : 's'}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {grouped[scope].map((skill, i) => (
                <div
                  key={`${skill.scope}/${skill.name}`}
                  className="card p-4 animate-slide-up group/card relative"
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{skill.displayName}</p>
                      <p className="text-[10px] font-mono text-text-muted truncate">{skill.name}</p>
                    </div>
                    {skill.hasExtraFiles && (
                      <div title={`Ships extra files: ${skill.extraFiles.join(', ')}`}>
                        <FileText className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-3 mb-3 min-h-[3em]">
                    {skill.description || <span className="text-text-muted italic">No description</span>}
                  </p>
                  <div className="flex items-center gap-1 -mr-1">
                    <button
                      onClick={() => setEditTarget(skill)}
                      className="p-1.5 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
                      title="Edit SKILL.md"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDuplicateTarget(skill)}
                      className="p-1.5 rounded hover:bg-accent/10 text-text-muted hover:text-accent transition-colors"
                      title="Duplicate to another scope"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(skill)}
                      className="p-1.5 rounded hover:bg-status-error/10 text-text-muted hover:text-status-error transition-colors ml-auto"
                      title="Remove skill"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <CreateSkillModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={loadSkills}
      />
      <EditSkillModal
        skill={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={loadSkills}
      />
      <DuplicateSkillModal
        skill={duplicateTarget}
        open={!!duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        onDuplicated={loadSkills}
      />
      <DeleteSkillModal
        skill={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={loadSkills}
      />
    </>
  );
}
