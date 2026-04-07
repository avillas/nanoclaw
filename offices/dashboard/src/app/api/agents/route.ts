import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAllAgents } from '@/lib/offices-reader';
import { listNanoClawContainers } from '@/lib/container';
import { createAgent, deleteAgent, listAvailableSkills, listOfficeNames } from '@/lib/offices-writer';
import { readActiveSubagents, isAgentActive } from '@/lib/active-agent';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [baseAgents, containers] = await Promise.all([
    getAllAgents(),
    listNanoClawContainers(),
  ]);

  // Build a set of offices that have a running container
  const activeOffices = new Set(
    containers
      .filter((c) => c.state === 'running')
      .map((c) => c.labels?.['com.nanoclaw.office'])
      .filter(Boolean),
  );

  const activeMarkers = readActiveSubagents();

  const agents = baseAgents.map((agent) => {
    // Exact match: container label identifies this specific agent
    const exactContainer = containers.find(
      (c) => c.labels?.['com.nanoclaw.agent'] === agent.id,
    );

    const isContainerForThisAgent = exactContainer?.state === 'running';
    const officeActive = activeOffices.has(agent.office);

    // The container label tracks the *office*, not the specific sub-agent.
    // The pipeline-tracker hook writes data/ipc/<group>/active-agent.json
    // with the slug of whichever sub-agent is currently executing — match
    // that against this agent's slug to flag it as 'working'.
    const isActiveSubagent = isAgentActive(agent, activeMarkers);

    const isRunning = isContainerForThisAgent || isActiveSubagent;

    return {
      ...agent,
      containerId: exactContainer?.id,
      containerStatus: exactContainer?.state || (officeActive ? 'running' : 'not_found'),
      status: isRunning ? ('working' as const) : agent.status,
      officeActive,
    };
  });

  return NextResponse.json(agents);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const result = createAgent(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, path: result.path }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create agent' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const office = searchParams.get('office');
  const name = searchParams.get('name');

  if (!office || !name) {
    return NextResponse.json({ error: 'Missing office or name query parameter' }, { status: 400 });
  }

  const result = deleteAgent(office, name);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

/** GET /api/agents/meta — returns available offices and skills for the create form */
export { GET as _GET }; // keep default GET
