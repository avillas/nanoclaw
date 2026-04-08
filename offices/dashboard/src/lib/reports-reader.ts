// ============================================================================
// NanoClaw Mission Control — Reports Reader
// Lists files that agents have written to data/reports/<office>/. The
// container-runner mounts each office's reports dir at /workspace/reports/
// inside the container, scoped to the office, so agents only see their own.
// On the host the dashboard reads them all and serves them back to the user.
// ============================================================================
import fs from 'fs';
import path from 'path';

/**
 * Files older than this are considered stale and removed by cleanupOldReports.
 * The dashboard's GET /api/reports handler runs the cleanup lazily before
 * returning the listing — no separate cron is needed.
 */
const RETENTION_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/** Resolve project root the same way other dashboard libs do. */
function getProjectRoot(): string {
  if (process.env.NANOCLAW_OFFICES_ROOT) {
    return path.resolve(process.env.NANOCLAW_OFFICES_ROOT, '..');
  }
  if (process.env.NANOCLAW_ROOT) {
    return path.resolve(process.env.NANOCLAW_ROOT, '..');
  }
  return path.resolve(process.cwd(), '..', '..');
}

export function getReportsRoot(): string {
  return path.join(getProjectRoot(), 'data', 'reports');
}

export interface ReportFile {
  /** Office that produced the report (folder name under data/reports/) */
  office: string;
  /** Path relative to the office reports dir (may contain subdirectories) */
  path: string;
  /** Bare filename */
  name: string;
  /** Size in bytes */
  size: number;
  /** ISO timestamp from the file mtime */
  modifiedAt: string;
}

/**
 * Walk the reports tree and return metadata for every file. Skips dotfiles
 * and anything Node refuses to stat. Subdirectories below an office are
 * traversed recursively so agents can organize reports into folders.
 */
export function listAllReports(): ReportFile[] {
  const root = getReportsRoot();
  if (!fs.existsSync(root)) return [];

  const out: ReportFile[] = [];
  let officeDirs: string[] = [];
  try {
    officeDirs = fs.readdirSync(root);
  } catch {
    return [];
  }

  for (const office of officeDirs) {
    const officeRoot = path.join(root, office);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(officeRoot);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    walk(officeRoot, '', office, out);
  }

  // Newest first
  out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return out;
}

function walk(
  baseDir: string,
  relativePrefix: string,
  office: string,
  out: ReportFile[],
): void {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(baseDir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = path.join(baseDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    const rel = relativePrefix ? `${relativePrefix}/${entry}` : entry;
    if (stat.isDirectory()) {
      walk(full, rel, office, out);
    } else if (stat.isFile()) {
      out.push({
        office,
        path: rel,
        name: entry,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
}

/**
 * Remove files older than RETENTION_MS from every office reports dir. Empty
 * subdirectories are also pruned (but the office root is left in place because
 * the container-runner expects it to exist when spawning a new container).
 *
 * Returns the number of files removed for logging/observability.
 */
export function cleanupOldReports(): number {
  const root = getReportsRoot();
  if (!fs.existsSync(root)) return 0;
  const cutoff = Date.now() - RETENTION_MS;
  let removed = 0;

  const cleanupDir = (dir: string, isOfficeRoot: boolean) => {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        cleanupDir(full, false);
        // Prune empty subdirectories (but never the office root)
        try {
          const remaining = fs.readdirSync(full);
          if (remaining.length === 0 && !isOfficeRoot) {
            fs.rmdirSync(full);
          }
        } catch {
          /* ignore */
        }
      } else if (stat.isFile() && stat.mtimeMs < cutoff) {
        try {
          fs.unlinkSync(full);
          removed++;
        } catch {
          /* ignore */
        }
      }
    }
  };

  let officeDirs: string[] = [];
  try {
    officeDirs = fs.readdirSync(root);
  } catch {
    return 0;
  }
  for (const office of officeDirs) {
    const officeRoot = path.join(root, office);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(officeRoot);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    cleanupDir(officeRoot, true);
  }

  return removed;
}

/**
 * Return the absolute path of a report file, validating that it does not
 * escape the office reports dir via path traversal (..). Returns null if the
 * file does not exist or the path is invalid.
 */
export function resolveReportPath(
  office: string,
  relativePath: string,
): string | null {
  // Reject anything that tries to break out of the office dir
  if (
    !office ||
    office.includes('/') ||
    office.includes('\\') ||
    office.startsWith('.')
  ) {
    return null;
  }
  const officeRoot = path.join(getReportsRoot(), office);
  const resolved = path.resolve(officeRoot, relativePath);
  // Resolved must still live under officeRoot
  if (!resolved.startsWith(officeRoot + path.sep) && resolved !== officeRoot) {
    return null;
  }
  if (!fs.existsSync(resolved)) return null;
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return null;
  return resolved;
}
