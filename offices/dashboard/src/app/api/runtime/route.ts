import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getContainerRuntime } from '@/lib/container';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const runtime = await getContainerRuntime();

  return NextResponse.json({
    runtime: runtime.runtime,
    available: await runtime.isAvailable(),
  });
}
