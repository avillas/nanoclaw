// ============================================================================
// NanoClaw Mission Control — Skills Reader
// Lists and reads skill .md files from offices/shared/skills/ and
// offices/<office>/skills/. Skills are markdown instruction files (with YAML
// frontmatter) that agents Read at runtime to gain a capability.
// ============================================================================
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Path resolution — must match offices-writer.ts so we read from the same root
// ---------------------------------------------------------------------------
function getOfficesRoot(): string {
  if (process.env.NANOCLAW_OFFICES_ROOT) {
    return path.resolve(process.env.NANOCLAW_OFFICES_ROOT);
  }
  if (process.env.NANOCLAW_ROOT) {
    return path.resolve(process.env.NANOCLAW_ROOT);
  }
  return path.resolve(process.cwd(), '..');
}

/**
 * Skill scope. "shared" means offices/shared/skills/, anything else is the
 * name of an office (development, marketing, innovation, ...).
 */
export type SkillScope = 'shared' | (string & {});

export interface SkillSummary {
  /** "shared" or office name */
  scope: SkillScope;
  /** kebab-case folder name */
  name: string;
  /** First line of the description from frontmatter */
  description: string;
  /** Display name from frontmatter (defaults to slug) */
  displayName: string;
  /** Whether the skill ships extra files (scripts, assets) alongside SKILL.md */
  hasExtraFiles: boolean;
  /** List of extra file names (relative to skill dir) */
  extraFiles: string[];
}

export interface SkillContent extends SkillSummary {
  /** Raw SKILL.md content */
  rawContent: string;
}

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

function extractDisplayName(content: string, fallback: string): string {
  const m = content.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Returns the host path of a skill directory for a given scope. */
function getSkillDir(scope: SkillScope, name: string): string {
  const root = getOfficesRoot();
  if (scope === 'shared') {
    return path.join(root, 'shared', 'skills', name);
  }
  return path.join(root, scope, 'skills', name);
}

/** Returns the host path of the SKILL.md file for a given (scope, name). */
function getSkillMdPath(scope: SkillScope, name: string): string {
  return path.join(getSkillDir(scope, name), 'SKILL.md');
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

/**
 * List all offices that have a skills/ directory. Excludes _template, shared,
 * and any hidden/special folders. Mirrors discoverOfficeNames in offices-reader.
 */
function discoverOfficeNames(): string[] {
  const root = getOfficesRoot();
  try {
    return fs.readdirSync(root).filter((name) => {
      if (
        name.startsWith('_') ||
        name.startsWith('.') ||
        name === 'shared' ||
        name === 'dashboard' ||
        name === 'docs' ||
        name === 'store'
      )
        return false;
      return fs.existsSync(path.join(root, name, 'CLAUDE.md'));
    });
  } catch {
    return [];
  }
}

function readSkillSummariesFromDir(
  scope: SkillScope,
  skillsDir: string,
): SkillSummary[] {
  if (!fs.existsSync(skillsDir)) return [];
  const entries: SkillSummary[] = [];
  for (const dirName of fs.readdirSync(skillsDir)) {
    const skillDir = path.join(skillsDir, dirName);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    let content = '';
    try {
      content = fs.readFileSync(skillMdPath, 'utf-8');
    } catch {
      continue;
    }

    const fm = parseFrontmatter(content);
    const extraFiles = fs
      .readdirSync(skillDir)
      .filter((f) => f !== 'SKILL.md');

    entries.push({
      scope,
      name: dirName,
      description: fm.description || '',
      displayName: fm.name || extractDisplayName(content, dirName),
      hasExtraFiles: extraFiles.length > 0,
      extraFiles,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/** Returns every skill in shared + every office, sorted by scope then name. */
export function listAllSkills(): SkillSummary[] {
  const root = getOfficesRoot();
  const all: SkillSummary[] = [];

  // Shared skills
  all.push(
    ...readSkillSummariesFromDir('shared', path.join(root, 'shared', 'skills')),
  );

  // Per-office skills
  for (const office of discoverOfficeNames()) {
    all.push(
      ...readSkillSummariesFromDir(office, path.join(root, office, 'skills')),
    );
  }

  return all;
}

/**
 * Read the raw content of a single skill plus its parsed metadata. Returns
 * null if the skill does not exist.
 */
export function readSkill(scope: SkillScope, name: string): SkillContent | null {
  const skillMdPath = getSkillMdPath(scope, name);
  if (!fs.existsSync(skillMdPath)) return null;

  const rawContent = fs.readFileSync(skillMdPath, 'utf-8');
  const fm = parseFrontmatter(rawContent);
  const skillDir = getSkillDir(scope, name);
  const extraFiles = fs
    .readdirSync(skillDir)
    .filter((f) => f !== 'SKILL.md');

  return {
    scope,
    name,
    description: fm.description || '',
    displayName: fm.name || extractDisplayName(rawContent, name),
    hasExtraFiles: extraFiles.length > 0,
    extraFiles,
    rawContent,
  };
}

/** Returns true if a skill with this (scope, name) already exists. */
export function skillExists(scope: SkillScope, name: string): boolean {
  return fs.existsSync(getSkillMdPath(scope, name));
}

// Re-export the path helpers so the writer can share them.
export { getSkillDir, getSkillMdPath, discoverOfficeNames };
