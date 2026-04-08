import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { auth } from '@/lib/auth';
import { resolveReportPath, getReportsRoot } from '@/lib/reports-reader';

interface RouteContext {
  params: Promise<{ office: string; path: string[] }>;
}

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * GET /api/reports/{office}/{...path}
 *
 * Streams a single report file as a download. The path is validated against
 * directory traversal in resolveReportPath() — anything that resolves outside
 * data/reports/<office>/ returns 404.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { office, path: pathSegments } = await params;
  const relativePath = pathSegments.join('/');
  const resolved = resolveReportPath(office, relativePath);

  if (!resolved) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const data = fs.readFileSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const filename = path.basename(resolved);

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * DELETE /api/reports/{office}/{...path}
 *
 * Permanently removes a single report file. Path traversal protection is the
 * same as the GET handler — resolveReportPath() refuses anything that escapes
 * the office reports dir. After deleting the file we also walk back up and
 * remove any empty parent directories (but never the office root itself, so
 * the container-runner mount target stays intact).
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { office, path: pathSegments } = await params;
  const relativePath = pathSegments.join('/');
  const resolved = resolveReportPath(office, relativePath);

  if (!resolved) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  try {
    fs.unlinkSync(resolved);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to delete file: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // Prune empty parent directories up to (but not including) the office root.
  // This keeps the tree tidy when reports are organized into subfolders.
  const officeRoot = path.join(getReportsRoot(), office);
  let parent = path.dirname(resolved);
  while (parent !== officeRoot && parent.startsWith(officeRoot + path.sep)) {
    try {
      const remaining = fs.readdirSync(parent);
      if (remaining.length === 0) {
        fs.rmdirSync(parent);
        parent = path.dirname(parent);
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return NextResponse.json({ success: true });
}
