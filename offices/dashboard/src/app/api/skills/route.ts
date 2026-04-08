import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listAllSkills } from '@/lib/skills-reader';
import { createSkill } from '@/lib/skills-writer';

/** GET /api/skills — list every skill in shared + every office. */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json(listAllSkills());
}

/** POST /api/skills — create a new skill. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    scope?: string;
    name?: string;
    description?: string;
    content?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.scope || !body.name || !body.description) {
    return NextResponse.json(
      { error: 'scope, name and description are required' },
      { status: 400 },
    );
  }

  const result = createSkill({
    scope: body.scope,
    name: body.name,
    description: body.description,
    content: body.content,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true }, { status: 201 });
}
