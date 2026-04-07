// ============================================================================
// NanoClaw Mission Control — Telegram Manager
// Single bot model: one bot token shared across all offices, each office has
// its own Telegram group. The bot routes messages by group ID → office.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { compileGroupForOffice } from './offices-writer';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
function getNanoClawRoot(): string {
  return process.env.NANOCLAW_ROOT
    ? path.resolve(process.env.NANOCLAW_ROOT, '..')
    : path.resolve(process.cwd(), '..', '..');
}

function getEnvPath(): string {
  return path.join(getNanoClawRoot(), '.env');
}

// ---------------------------------------------------------------------------
// .env file helpers
// ---------------------------------------------------------------------------
function readEnvFile(): string {
  const envPath = getEnvPath();
  try {
    return fs.readFileSync(envPath, 'utf-8');
  } catch {
    return '';
  }
}

function writeEnvFile(content: string): void {
  const envPath = getEnvPath();
  fs.writeFileSync(envPath, content, 'utf-8');
}

function getEnvVar(key: string): string | null {
  const content = readEnvFile();
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : null;
}

function setEnvVar(key: string, value: string): void {
  let content = readEnvFile();
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    if (key.startsWith('TELEGRAM_') && !content.includes('# Telegram')) {
      content += '\n# Telegram — single bot, multiple groups\n';
    }
    content += `${key}=${value}\n`;
  }

  writeEnvFile(content);
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
const BOT_TOKEN_KEY = 'TELEGRAM_BOT_TOKEN';

function officeToGroupEnvKey(officeName: string): string {
  return `TELEGRAM_GROUP_ID_${officeName.toUpperCase().replace(/-/g, '_')}`;
}

// ---------------------------------------------------------------------------
// Global bot config
// ---------------------------------------------------------------------------
export interface GlobalBotConfig {
  botToken: string | null;
  botTokenMasked: string | null;
  botUsername?: string;
}

/** Get the global bot token (masked for frontend display) */
export function getGlobalBotConfig(): GlobalBotConfig {
  const token = getEnvVar(BOT_TOKEN_KEY);
  return {
    botToken: token,
    botTokenMasked: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : null,
  };
}

/** Save the global bot token */
export function saveGlobalBotToken(token: string): void {
  setEnvVar(BOT_TOKEN_KEY, token);
  // Sync to data/env/env
  try {
    const nanoRoot = getNanoClawRoot();
    const dataEnvDir = path.join(nanoRoot, 'data', 'env');
    if (!fs.existsSync(dataEnvDir)) {
      fs.mkdirSync(dataEnvDir, { recursive: true });
    }
    fs.copyFileSync(getEnvPath(), path.join(dataEnvDir, 'env'));
  } catch {
    // Non-fatal
  }
}

/** Get the raw (unmasked) bot token — used internally only */
export function getRawBotToken(): string | null {
  return getEnvVar(BOT_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Per-office group config
// ---------------------------------------------------------------------------
export interface OfficeGroupConfig {
  office: string;
  groupId: string | null;
  isRegistered: boolean;
  hasGlobalBot: boolean;
}

/** Get group config for a specific office */
export function getOfficeGroupConfig(officeName: string): OfficeGroupConfig {
  const groupKey = officeToGroupEnvKey(officeName);
  const groupId = getEnvVar(groupKey);
  const hasGlobalBot = !!getEnvVar(BOT_TOKEN_KEY);

  let isRegistered = false;
  if (groupId) {
    try {
      const dbPath = path.join(getNanoClawRoot(), 'store', 'messages.db');
      if (fs.existsSync(dbPath)) {
        const result = execSync(
          `sqlite3 "${dbPath}" "SELECT COUNT(*) FROM registered_groups WHERE jid LIKE 'tg:${groupId.replace('tg:', '')}%'"`,
          { encoding: 'utf-8', timeout: 5000 }
        ).trim();
        isRegistered = parseInt(result) > 0;
      }
    } catch {
      isRegistered = !!(hasGlobalBot && groupId);
    }
  }

  return { office: officeName, groupId, isRegistered, hasGlobalBot };
}

/** Get group config for ALL offices */
export function getAllOfficeGroupConfigs(): OfficeGroupConfig[] {
  const officesRoot = path.join(getNanoClawRoot(), 'offices');
  try {
    const dirs = fs.readdirSync(officesRoot).filter((name) => {
      if (name.startsWith('_') || name.startsWith('.') || name === 'shared' || name === 'dashboard' || name === 'docs' || name === 'store') return false;
      return fs.existsSync(path.join(officesRoot, name, 'CLAUDE.md'));
    });
    return dirs.map(getOfficeGroupConfig);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Link a group to an office (save group ID + register + restart)
// ---------------------------------------------------------------------------
export interface LinkGroupInput {
  office: string;
  groupId: string;
  triggerWord?: string;
}

export interface ConfigureResult {
  success: boolean;
  steps: { step: string; status: 'ok' | 'error'; detail?: string }[];
  error?: string;
}

export function linkGroupToOffice(input: LinkGroupInput): ConfigureResult {
  const steps: ConfigureResult['steps'] = [];

  // Check that global bot token exists
  const botToken = getEnvVar(BOT_TOKEN_KEY);
  if (!botToken) {
    return {
      success: false,
      steps: [{ step: 'Check global bot token', status: 'error', detail: 'No bot token configured. Set it in Telegram Settings first.' }],
      error: 'No global bot token',
    };
  }
  steps.push({ step: 'Check global bot token', status: 'ok' });

  // Save group ID to .env
  try {
    const groupKey = officeToGroupEnvKey(input.office);
    const groupId = input.groupId.startsWith('tg:') ? input.groupId : `tg:${input.groupId}`;
    setEnvVar(groupKey, groupId);
    steps.push({ step: `Save ${groupKey} to .env`, status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'Save group ID to .env', status: 'error', detail: err.message });
    return { success: false, steps, error: 'Failed to save group ID' };
  }

  // Sync .env to data/env/env
  try {
    const nanoRoot = getNanoClawRoot();
    const dataEnvDir = path.join(nanoRoot, 'data', 'env');
    if (!fs.existsSync(dataEnvDir)) {
      fs.mkdirSync(dataEnvDir, { recursive: true });
    }
    fs.copyFileSync(getEnvPath(), path.join(dataEnvDir, 'env'));
    steps.push({ step: 'Sync .env to data/env/env', status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'Sync .env to data/env/env', status: 'error', detail: err.message });
  }

  // Ensure groups/<folder>/CLAUDE.md exists before registering, otherwise the
  // orchestrator will fail to spawn the agent container on first message.
  const folder = `telegram_${input.office.replace(/-/g, '_')}`;
  try {
    compileGroupForOffice(input.office, folder);
    steps.push({ step: `Compile groups/${folder}/CLAUDE.md`, status: 'ok' });
  } catch (err: any) {
    steps.push({
      step: `Compile groups/${folder}/CLAUDE.md`,
      status: 'error',
      detail: err.message?.slice(0, 200),
    });
    return { success: false, steps, error: 'Failed to compile group CLAUDE.md' };
  }

  // Register group via setup CLI
  try {
    const nanoRoot = getNanoClawRoot();
    const trigger = input.triggerWord || `@${input.office}`;
    const jid = input.groupId.startsWith('tg:') ? input.groupId : `tg:${input.groupId}`;
    const displayName = input.office.charAt(0).toUpperCase() + input.office.slice(1) + ' Office';

    const registerCmd = [
      `cd "${nanoRoot}"`,
      `npx tsx setup/index.ts --step register --`,
      `--jid "${jid}"`,
      `--name "${displayName}"`,
      `--folder "${folder}"`,
      `--trigger "${trigger}"`,
      `--channel telegram`,
      `--no-trigger-required`,
      `--is-main`,
    ].join(' ');

    execSync(registerCmd, { encoding: 'utf-8', timeout: 30000, cwd: nanoRoot });
    steps.push({ step: 'Register group in NanoClaw', status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'Register group in NanoClaw', status: 'error', detail: err.message?.slice(0, 200) });
  }

  // Restart NanoClaw via PM2
  try {
    execSync('pm2 restart nanoclaw 2>/dev/null || pm2 restart all', {
      encoding: 'utf-8',
      timeout: 15000,
    });
    steps.push({ step: 'Restart NanoClaw (PM2)', status: 'ok' });
  } catch (err: any) {
    steps.push({ step: 'Restart NanoClaw (PM2)', status: 'error', detail: 'Could not restart. Run: pm2 restart nanoclaw' });
  }

  const hasErrors = steps.some((s) => s.status === 'error');
  return {
    success: !hasErrors,
    steps,
    error: hasErrors ? 'Some steps had errors — check details' : undefined,
  };
}

// ---------------------------------------------------------------------------
// Test bot connection (validate token against Telegram API)
// ---------------------------------------------------------------------------
export async function testBotToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok && data.result) {
      return { valid: true, username: data.result.username };
    }
    return { valid: false, error: data.description || 'Invalid token' };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Connection failed' };
  }
}

// ---------------------------------------------------------------------------
// Get chat ID from recent updates (helper for users)
// ---------------------------------------------------------------------------
export async function getChatIdFromToken(token: string): Promise<{ chats: { id: string; title: string; type: string }[]; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=20`);
    const data = await res.json();
    if (!data.ok) return { chats: [], error: data.description };

    const seenIds = new Set<string>();
    const chats: { id: string; title: string; type: string }[] = [];

    for (const update of data.result || []) {
      const msg = update.message || update.my_chat_member?.chat;
      if (!msg?.chat) continue;
      const chatId = String(msg.chat.id);
      if (seenIds.has(chatId)) continue;
      seenIds.add(chatId);
      chats.push({
        id: chatId,
        title: msg.chat.title || msg.chat.first_name || chatId,
        type: msg.chat.type || 'unknown',
      });
    }

    return { chats };
  } catch (err: any) {
    return { chats: [], error: err.message };
  }
}
