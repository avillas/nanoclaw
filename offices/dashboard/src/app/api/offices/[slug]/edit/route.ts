import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getOfficeRawContent, updateOffice } from '@/lib/offices-writer';
import type { UpdateOfficeInput } from '@/lib/offices-writer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const result = getOfficeRawContent(slug);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({
    claudeMd: result.claudeMd,
    soulMd: result.soulMd,
    metadata: result.metadata,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { slug } = await params;
  const body = (await req.json()) as UpdateOfficeInput;

  if (!body.mode || !['metadata', 'claudemd', 'soul'].includes(body.mode)) {
    return NextResponse.json(
      { error: 'Invalid mode — must be "metadata", "claudemd", or "soul"' },
      { status: 400 },
    );
  }

  const result = updateOffice(slug, body);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
