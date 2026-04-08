import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { duplicateSkill } from '@/lib/skills-writer';

/**
 * POST /api/skills/duplicate
 * Body: { fromScope, fromName, toScope, toName? }
 *
 * Copies a skill (including any extra files) from one scope to another. If
 * toName is omitted the original slug is reused. The destination scope must
 * exist and not already contain a skill with that name.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    fromScope?: string;
    fromName?: string;
    toScope?: string;
    toName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.fromScope || !body.fromName || !body.toScope) {
    return NextResponse.json(
      { error: 'fromScope, fromName and toScope are required' },
      { status: 400 },
    );
  }

  const result = duplicateSkill({
    fromScope: body.fromScope,
    fromName: body.fromName,
    toScope: body.toScope,
    toName: body.toName,
  });

  if (!result.success) {
    const status = result.error?.includes('not found') ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ success: true }, { status: 201 });
}
