import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listAllReports, cleanupOldReports } from '@/lib/reports-reader';

/**
 * GET /api/reports — list every file under data/reports/<office>/.
 *
 * Runs the 60-day retention cleanup lazily before listing so stale files
 * never appear in the response. Cleanup is best-effort; if it fails the list
 * is still returned.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    cleanupOldReports();
  } catch (err) {
    console.warn('[reports] cleanup failed:', err);
  }

  return NextResponse.json(listAllReports());
}
