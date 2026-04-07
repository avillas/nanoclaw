import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOfficeByName, getAgentsByOffice } from '@/lib/offices-reader';
import { getPipelineExecutions, getPipelineStages } from '@/lib/db';
import { readActiveSubagents, enrichAgentsWithActive } from '@/lib/active-agent';
import type { OfficeName, Pipeline, PipelineStageExecution } from '@/types';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const office = getOfficeByName(slug);
  if (!office) return NextResponse.json({ error: 'Office not found' }, { status: 404 });

  const activeMarkers = readActiveSubagents();
  const agents = enrichAgentsWithActive(getAgentsByOffice(slug as OfficeName), activeMarkers);
  const activeMarker = activeMarkers.get(slug);

  // Load recent pipeline executions for this office and attach their stages.
  // Stages are written by the container-side pipeline-tracker hook via IPC.
  const allExecutions = getPipelineExecutions(undefined, 20);
  const executedPipelines: Pipeline[] = allExecutions
    .filter((exec: any) => exec.office === slug)
    .map((exec: any) => {
      const stages = getPipelineStages(exec.id);
      return {
        id: exec.id,
        office: exec.office,
        triggeredBy: exec.triggered_by || 'system',
        triggeredAt: exec.triggered_at || exec.started_at,
        status: exec.status,
        currentStage: exec.current_stage || 0,
        totalDuration: undefined,
        stages: stages.map((s: any) => ({
          position: s.position,
          agentName: s.agent_name,
          status: s.status,
          startedAt: s.started_at,
          completedAt: s.completed_at,
          duration: s.duration_ms,
          output: s.output,
          score: s.score,
          gateResult: s.score != null ? (s.score >= 5 ? 'passed' : 'failed') : undefined,
        })),
      };
    });

  // Fabricate a synthetic "live" pipeline from the active-agent marker so the
  // UI reflects the currently-active agent even when the orchestrator never
  // calls the sub-agent spawn tool (no rows in pipeline_executions yet).
  let pipelines: Pipeline[] = executedPipelines;
  const hasRunningExec = executedPipelines.some((p) => p.status === 'running');
  if (activeMarker && !hasRunningExec && office.pipeline.length > 0) {
    const stages: PipelineStageExecution[] = office.pipeline.map((s) => {
      const slugMatches =
        s.agentName
          .toLowerCase()
          .replace(/\s+/g, '-') === activeMarker.subagent.toLowerCase();
      return {
        position: s.position,
        agentName: s.agentName,
        status: slugMatches ? ('running' as const) : ('pending' as const),
        startedAt: slugMatches ? activeMarker.started_at : undefined,
      };
    });
    pipelines = [
      {
        id: `live-${slug}`,
        office: slug as any,
        triggeredBy: activeMarker.source || 'agent',
        triggeredAt: activeMarker.started_at || '',
        status: 'running' as const,
        currentStage: stages.findIndex((s) => s.status === 'running') + 1,
        stages,
      },
      ...executedPipelines,
    ];
  }

  return NextResponse.json({ office, agents, pipelines });
}
