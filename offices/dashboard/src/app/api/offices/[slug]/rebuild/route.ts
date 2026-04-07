import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { regenerateOfficeClaudeMd } from '@/lib/offices-writer';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const result = regenerateOfficeClaudeMd(slug);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
