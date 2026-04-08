// ============================================================================
// NanoClaw Mission Control — Skills Writer
// Create / update / delete / duplicate SKILL.md files in
// offices/shared/skills/ and offices/<office>/skills/.
// ============================================================================
import fs from 'fs';
import path from 'path';
import {
  type SkillScope,
  getSkillDir,
  getSkillMdPath,
  skillExists,
  discoverOfficeNames,
} from './skills-reader';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

function validateSlug(name: string): string | null {
  if (!name) return 'Name is required';
  if (!SLUG_RE.test(name)) {
    return 'Name must be kebab-case (lowercase letters, digits and hyphens, no leading/trailing hyphen)';
  }
  if (name.length > 64) return 'Name must be 64 characters or fewer';
  return null;
}

function validateScope(scope: string): string | null {
  if (!scope) return 'Scope is required';
  if (scope === 'shared') return null;
  // Must be a real office
  if (!discoverOfficeNames().includes(scope)) {
    return `Unknown office "${scope}"`;
  }
  return null;
}

function validateContent(content: string): string | null {
  if (!content || content.trim().length === 0) return 'Content is required';
  if (!/^---\n[\s\S]*?\n---/.test(content)) {
    return 'Content must start with a YAML frontmatter block (--- ... ---)';
  }
  // Check that frontmatter has at least name and description
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return 'Invalid frontmatter';
  const fm: Record<string, string> = {};
  for (const line of fmMatch[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  if (!fm.name) return 'Frontmatter must include a "name" field';
  if (!fm.description) return 'Frontmatter must include a "description" field';
  return null;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
function defaultSkillContent(name: string, description: string): string {
  const display = name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `---
name: ${name}
description: ${description}
---

# ${display}

## When to use

Describe the situations in which an agent should reach for this skill.

## How to use

Step-by-step instructions for the agent. Be specific — agents follow these
literally. Include example commands or tool invocations when relevant.

## Notes

Any caveats, edge cases or things to watch out for.
`;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export interface CreateSkillInput {
  scope: SkillScope;
  /** kebab-case slug — also used as the directory name */
  name: string;
  /** Description for the frontmatter (single line) */
  description: string;
  /** Optional pre-written content. If omitted, a starter template is used. */
  content?: string;
}

export function createSkill(input: CreateSkillInput): {
  success: boolean;
  error?: string;
} {
  const scopeErr = validateScope(input.scope);
  if (scopeErr) return { success: false, error: scopeErr };

  const slugErr = validateSlug(input.name);
  if (slugErr) return { success: false, error: slugErr };

  if (!input.description || !input.description.trim()) {
    return { success: false, error: 'Description is required' };
  }

  if (skillExists(input.scope, input.name)) {
    return {
      success: false,
      error: `Skill "${input.name}" already exists in scope "${input.scope}"`,
    };
  }

  const content =
    input.content && input.content.trim()
      ? input.content
      : defaultSkillContent(input.name, input.description);

  const contentErr = validateContent(content);
  if (contentErr) return { success: false, error: contentErr };

  const skillDir = getSkillDir(input.scope, input.name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

  return { success: true };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
export interface UpdateSkillInput {
  /** Full new content for SKILL.md (frontmatter + body) */
  content: string;
}

export function updateSkill(
  scope: SkillScope,
  name: string,
  input: UpdateSkillInput,
): { success: boolean; error?: string } {
  if (!skillExists(scope, name)) {
    return {
      success: false,
      error: `Skill "${name}" not found in scope "${scope}"`,
    };
  }

  const contentErr = validateContent(input.content);
  if (contentErr) return { success: false, error: contentErr };

  fs.writeFileSync(getSkillMdPath(scope, name), input.content, 'utf-8');
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------
export function deleteSkill(
  scope: SkillScope,
  name: string,
): { success: boolean; error?: string } {
  if (!skillExists(scope, name)) {
    return {
      success: false,
      error: `Skill "${name}" not found in scope "${scope}"`,
    };
  }

  const skillDir = getSkillDir(scope, name);
  // Recursive remove — nukes any extra files (scripts, assets) too. The user
  // is warned about this in the dashboard's delete confirmation modal.
  fs.rmSync(skillDir, { recursive: true, force: true });
  return { success: true };
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------
export interface DuplicateSkillInput {
  fromScope: SkillScope;
  fromName: string;
  toScope: SkillScope;
  /** New name in the destination scope. If omitted, keep the original name. */
  toName?: string;
}

export function duplicateSkill(input: DuplicateSkillInput): {
  success: boolean;
  error?: string;
} {
  const srcDir = getSkillDir(input.fromScope, input.fromName);
  if (!fs.existsSync(srcDir)) {
    return {
      success: false,
      error: `Source skill "${input.fromName}" not found in scope "${input.fromScope}"`,
    };
  }

  const destName = input.toName || input.fromName;

  const scopeErr = validateScope(input.toScope);
  if (scopeErr) return { success: false, error: scopeErr };

  const slugErr = validateSlug(destName);
  if (slugErr) return { success: false, error: slugErr };

  if (skillExists(input.toScope, destName)) {
    return {
      success: false,
      error: `Skill "${destName}" already exists in scope "${input.toScope}"`,
    };
  }

  // Same source and destination — that's a no-op the user almost certainly
  // didn't want.
  if (input.fromScope === input.toScope && input.fromName === destName) {
    return { success: false, error: 'Source and destination are identical' };
  }

  const dstDir = getSkillDir(input.toScope, destName);
  fs.mkdirSync(path.dirname(dstDir), { recursive: true });
  fs.cpSync(srcDir, dstDir, { recursive: true });

  // If the slug changed, update the `name:` field in the new SKILL.md so it
  // matches the new directory name. Description and body stay the same.
  if (destName !== input.fromName) {
    const skillMdPath = getSkillMdPath(input.toScope, destName);
    if (fs.existsSync(skillMdPath)) {
      const original = fs.readFileSync(skillMdPath, 'utf-8');
      const updated = original.replace(
        /^(name:\s*).+$/m,
        `$1${destName}`,
      );
      fs.writeFileSync(skillMdPath, updated, 'utf-8');
    }
  }

  return { success: true };
}
