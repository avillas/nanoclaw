import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getGlobalBotConfig,
  saveGlobalBotToken,
  getRawBotToken,
  getAllOfficeGroupConfigs,
  getOfficeGroupConfig,
  linkGroupToOffice,
  testBotToken,
  getChatIdFromToken,
} from '@/lib/telegram-manager';

/** GET /api/telegram — returns bot config and/or office group status */
export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const office = url.searchParams.get('office');
  const scope = url.searchParams.get('scope'); // "global" | "offices" | undefined

  // Global bot config
  if (scope === 'global') {
    return NextResponse.json(getGlobalBotConfig());
  }

  // Single office group config
  if (office) {
    return NextResponse.json(getOfficeGroupConfig(office));
  }

  // All offices + global bot status
  const global = getGlobalBotConfig();
  const offices = getAllOfficeGroupConfigs();
  return NextResponse.json({ global, offices });
}

/** POST /api/telegram — actions: test-token, get-chats, save-token, link-group */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action } = body;

    // Action: test-token — validate a token against Telegram API
    if (action === 'test-token') {
      const result = await testBotToken(body.token);
      return NextResponse.json(result);
    }

    // Action: save-token — save the global bot token
    if (action === 'save-token') {
      const tokenRegex = /^\d+:[A-Za-z0-9_-]{35,}$/;
      if (!tokenRegex.test(body.token)) {
        return NextResponse.json({ error: 'Invalid token format' }, { status: 400 });
      }
      saveGlobalBotToken(body.token);
      return NextResponse.json({ success: true });
    }

    // Action: get-chats — list chats the bot has seen (uses global token or provided)
    if (action === 'get-chats') {
      const token = body.token || getRawBotToken();
      if (!token) {
        return NextResponse.json({ chats: [], error: 'No bot token configured' });
      }
      const result = await getChatIdFromToken(token);
      return NextResponse.json(result);
    }

    // Action: link-group — associate a group to an office (register + restart)
    if (action === 'link-group') {
      const result = linkGroupToOffice({
        office: body.office,
        groupId: body.groupId,
        triggerWord: body.triggerWord,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed' }, { status: 500 });
  }
}
