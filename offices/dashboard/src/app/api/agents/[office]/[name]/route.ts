import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getAgentRawContent,
  updateAgent,
  type UpdateAgentInput,
} from '@/lib/offices-writer';

interface RouteContext {
  params: Promise<{ office: string; name: string }>;
}

/**
 * GET /api/agents/{office}/{name}
 * Returns the raw markdown content of an agent file plus parsed frontmatter
 * and the display name extracted from the H1 heading.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { office, name } = await params;
  const result = getAgentRawContent(office, name);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    office,
    name,
    rawContent: result.rawContent,
    frontmatter: result.frontmatter,
    displayName: result.displayName,
  });
}

/**
 * PUT /api/agents/{office}/{name}
 * Update an agent. Body must be one of:
 *   { mode: 'attributes', attributes: { displayName?, model?, skill?, ... } }
 *   { mode: 'markdown',   rawMarkdown: string }
 */
export async function PUT(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { office, name } = await params;

  let body: UpdateAgentInput;
  try {
    body = (await req.json()) as UpdateAgentInput;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || (body.mode !== 'attributes' && body.mode !== 'markdown')) {
    return NextResponse.json(
      { error: 'Body must include mode: "attributes" | "markdown"' },
      { status: 400 },
    );
  }

  const result = updateAgent(office, name, body);
  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true });
}
