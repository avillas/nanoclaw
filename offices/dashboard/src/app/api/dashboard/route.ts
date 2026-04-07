import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDashboardKPIs } from '@/lib/offices-reader';
import { listNanoClawContainers } from '@/lib/container';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [kpis, containers] = await Promise.all([
    getDashboardKPIs(),
    listNanoClawContainers(),
  ]);

  const runningContainers = containers.filter((c) => c.state === 'running');

  // Count active agents per office using container labels
  const activeByOffice: Record<string, number> = {};
  for (const c of runningContainers) {
    const office = c.labels?.['com.nanoclaw.office'];
    if (office) {
      activeByOffice[office] = (activeByOffice[office] || 0) + 1;
    }
  }

  // Update each office's activeAgents count
  const offices = kpis.offices.map((o) => ({
    ...o,
    activeAgents: activeByOffice[o.name] || 0,
  }));

  const totalActive = runningContainers.length;

  return NextResponse.json({
    ...kpis,
    offices,
    activeAgents: totalActive,
    containers: {
      total: containers.length,
      running: totalActive,
    },
  });
}
