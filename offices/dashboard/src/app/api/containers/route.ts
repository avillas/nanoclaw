import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listNanoClawContainers, getContainerStats } from '@/lib/container';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const containers = await listNanoClawContainers();

  const withStats = await Promise.all(
    containers.map(async (c) => {
      const stats = c.state === 'running' ? await getContainerStats(c.id) : null;
      return { ...c, stats };
    })
  );

  return NextResponse.json(withStats);
}
