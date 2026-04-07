import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { listOfficeNames, listAvailableSkills } from '@/lib/offices-writer';

/** Returns metadata needed for the Create Agent form */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const office = url.searchParams.get('office');

  const offices = listOfficeNames();
  const skills = office ? listAvailableSkills(office) : [];

  return NextResponse.json({ offices, skills });
}
