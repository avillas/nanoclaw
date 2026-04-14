import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/users';

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(listUsers());
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      name?: string;
      password?: string;
    };
    if (!body.email || !body.name || !body.password) {
      return NextResponse.json(
        { error: 'email, name, and password are required' },
        { status: 400 },
      );
    }
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to create user',
      },
      { status: 400 },
    );
  }
}
