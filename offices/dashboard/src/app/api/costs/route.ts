import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCostSummaries } from '@/lib/offices-reader';
import { getOfficeCosts } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const office = searchParams.get('office');
  const days = parseInt(searchParams.get('days') || '7', 10);

  if (office) {
    // Return detailed costs for a specific office
    const dateTo = new Date().toISOString().slice(0, 10);
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const costs = getOfficeCosts(office, dateFrom, dateTo);
    return NextResponse.json({ office, dateFrom, dateTo, records: costs });
  }

  // Return summary for all offices
  return NextResponse.json(getCostSummaries());
}
