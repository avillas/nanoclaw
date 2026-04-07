import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getMessages, getRegisteredGroups } from '@/lib/db';
import type { OfficeName } from '@/types';

/** Build a mapping of chat JID to office name using registered groups */
function buildJidToOfficeMap(): Record<string, OfficeName> {
  const groups = getRegisteredGroups();
  const map: Record<string, OfficeName> = {};

  for (const group of groups) {
    // Extract office from folder name: "telegram_development" -> "development"
    const match = group.folder?.match(/^(?:telegram|whatsapp|slack|discord)_(.+)$/);
    const office = match ? match[1] : null;
    if (office && group.jid) {
      map[group.jid] = office as OfficeName;
    }
  }
  return map;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbMessages = getMessages(50);
  const jidToOffice = buildJidToOfficeMap();

  const events = dbMessages.map((msg, i) => {
    // Timestamp may be ISO string or unix epoch — normalize
    const ts = typeof msg.timestamp === 'string' && msg.timestamp.includes('T')
      ? msg.timestamp
      : new Date(Number(msg.timestamp) * 1000).toISOString();

    return {
      id: `db-${msg.id || i}`,
      timestamp: ts,
      office: jidToOffice[msg.chat_jid] || 'main',
      agent: msg.is_from_me ? 'Agent' : (msg.sender_name || msg.sender || 'User'),
      action: msg.is_from_me ? 'bot_response' : 'message_received',
      detail: msg.content || '',
      level: 'info' as const,
    };
  });

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json(events);
}
