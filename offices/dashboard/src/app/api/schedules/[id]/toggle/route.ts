import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { toggleScheduleStatus } from '@/lib/schedules';

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteCtx) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  try {
    const task = toggleScheduleStatus(id);
    return NextResponse.json(task);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to toggle' },
      { status: 400 },
    );
  }
}
