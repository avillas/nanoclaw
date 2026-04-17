import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createSchedule, listSchedules } from '@/lib/schedules';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(listSchedules());
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const task = createSchedule(body);
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create schedule' },
      { status: 400 },
    );
  }
}
