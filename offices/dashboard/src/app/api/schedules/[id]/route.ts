import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  deleteSchedule,
  getRecentRuns,
  getSchedule,
  updateSchedule,
} from '@/lib/schedules';

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteCtx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = getSchedule(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const runs = getRecentRuns(id, 20);
  return NextResponse.json({ task, runs });
}

export async function PATCH(req: Request, { params }: RouteCtx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const body = await req.json();
    const task = updateSchedule(id, body);
    return NextResponse.json(task);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update schedule' },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteCtx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    deleteSchedule(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete schedule' },
      { status: 400 },
    );
  }
}
