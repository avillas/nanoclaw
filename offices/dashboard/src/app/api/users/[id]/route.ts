import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { countUsers, deleteUser, findUserById, updateUser } from '@/lib/users';

interface Context {
  params: Promise<{ id: string }>;
}

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export async function GET(_req: Request, ctx: Context) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const user = findUserById(id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json(user);
}

export async function PUT(req: Request, ctx: Context) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };
    const user = await updateUser(id, body);
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to update user',
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, ctx: Context) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  // Prevent removing the last user — would brick login since env-var
  // fallback only kicks in on an empty table.
  if (countUsers() <= 1) {
    return NextResponse.json(
      { error: 'Cannot delete the last remaining user' },
      { status: 400 },
    );
  }

  try {
    const ok = deleteUser(id);
    if (!ok) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to delete user',
      },
      { status: 400 },
    );
  }
}
