import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { readSkill } from '@/lib/skills-reader';
import { updateSkill, deleteSkill } from '@/lib/skills-writer';

interface RouteContext {
  params: Promise<{ scope: string; name: string }>;
}

/** GET /api/skills/{scope}/{name} — read raw SKILL.md plus parsed metadata. */
export async function GET(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scope, name } = await params;
  const skill = readSkill(scope, name);
  if (!skill) {
    return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
  }
  return NextResponse.json(skill);
}

/** PUT /api/skills/{scope}/{name} — overwrite SKILL.md with the body content. */
export async function PUT(req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scope, name } = await params;

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.content !== 'string') {
    return NextResponse.json(
      { error: 'content (string) is required' },
      { status: 400 },
    );
  }

  const result = updateSkill(scope, name, { content: body.content });
  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ success: true });
}

/** DELETE /api/skills/{scope}/{name} — remove the entire skill directory. */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { scope, name } = await params;
  const result = deleteSkill(scope, name);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
