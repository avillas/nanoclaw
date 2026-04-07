import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPipelineExecutions, getPipelineStages } from '@/lib/db';
import { getOffices } from '@/lib/offices-reader';
import { readActiveSubagents } from '@/lib/active-agent';
import type { Pipeline, PipelineStageExecution } from '@/types';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  // Get real executions from DB
  const executions = getPipelineExecutions(status, limit);
  const activeExecutions: Pipeline[] = executions.map((exec: any) => {
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

  // Get pipeline definitions from office workflows (always show these).
  // When the DB has no running execution for an office but the container has
  // an `active-agent.json` marker, fall back to lighting up that stage so the
  // UI reflects reality when the orchestrator never calls the spawn tool.
  const offices = getOffices();
  const activeMarkers = readActiveSubagents();
  const definitions = offices.map((office) => {
    // Check if there's an active execution for this office
    const active = activeExecutions.find(
      (e) => e.office === office.name && (e.status === 'running' || e.status === 'pending')
    );
    if (active) return active;

    const marker = activeMarkers.get(office.name);

    // Show the pipeline definition, marking the matching stage as running
    // when we have an active-agent marker for this office.
    const stages: PipelineStageExecution[] = office.pipeline.map((s) => {
      const slugified = s.agentName.toLowerCase().replace(/\s+/g, '-');
      const isRunning =
        !!marker && slugified === marker.subagent.toLowerCase();
      return {
        position: s.position,
        agentName: s.agentName,
        status: isRunning ? ('running' as const) : ('pending' as const),
        startedAt: isRunning ? marker?.started_at : undefined,
      };
    });

    const hasRunning = stages.some((s) => s.status === 'running');
    return {
      id: marker ? `live-${office.name}` : `def-${office.name}`,
      office: office.name,
      triggeredBy: marker ? marker.source || 'agent' : '—',
      triggeredAt: marker?.started_at || '',
      status: hasRunning ? ('running' as const) : ('pending' as const),
      currentStage: hasRunning
        ? stages.findIndex((s) => s.status === 'running') + 1
        : 0,
      stages,
    };
  });

  // Merge: active executions first, then definitions for offices without active runs
  const activeOffices = new Set(activeExecutions.map((e) => e.office));
  const completedExecutions = activeExecutions.filter(
    (e) => e.status === 'completed' || e.status === 'failed'
  );

  const result = [
    ...definitions,
    ...completedExecutions,
  ];

  return NextResponse.json(result);
}
