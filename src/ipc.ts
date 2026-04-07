import fs from 'fs';
import path from 'path';

import { CronExpressionParser } from 'cron-parser';

import { DATA_DIR, IPC_POLL_INTERVAL, TIMEZONE } from './config.js';
import { AvailableGroup } from './container-runner.js';
import {
  createPipelineExecution,
  createPipelineStage,
  createTask,
  deleteTask,
  getTaskById,
  recordAgentCost,
  updatePipelineExecution,
  updateTask,
} from './db.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  syncGroups: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    availableGroups: AvailableGroup[],
    registeredJids: Set<string>,
  ) => void;
  onTasksChanged: () => void;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    // Scan all group IPC directories (identity determined by directory)
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((f) => {
        const stat = fs.statSync(path.join(ipcBaseDir, f));
        return stat.isDirectory() && f !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredGroups = deps.registeredGroups();

    // Build folder→isMain lookup from registered groups
    const folderIsMain = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) folderIsMain.set(group.folder, true);
    }

    for (const sourceGroup of groupFolders) {
      const isMain = folderIsMain.get(sourceGroup) === true;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');
      const costsDir = path.join(ipcBaseDir, sourceGroup, 'costs');
      const pipelinesDir = path.join(ipcBaseDir, sourceGroup, 'pipelines');

      // Process messages from this group's IPC directory
      try {
        if (fs.existsSync(messagesDir)) {
          const messageFiles = fs
            .readdirSync(messagesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of messageFiles) {
            const filePath = path.join(messagesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (data.type === 'message' && data.chatJid && data.text) {
                // Authorization: verify this group can send to this chatJid
                const targetGroup = registeredGroups[data.chatJid];
                if (
                  isMain ||
                  (targetGroup && targetGroup.folder === sourceGroup)
                ) {
                  await deps.sendMessage(data.chatJid, data.text);
                  logger.info(
                    { chatJid: data.chatJid, sourceGroup },
                    'IPC message sent',
                  );
                } else {
                  logger.warn(
                    { chatJid: data.chatJid, sourceGroup },
                    'Unauthorized IPC message attempt blocked',
                  );
                }
              }
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC message',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC messages directory',
        );
      }

      // Process tasks from this group's IPC directory
      try {
        if (fs.existsSync(tasksDir)) {
          const taskFiles = fs
            .readdirSync(tasksDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of taskFiles) {
            const filePath = path.join(tasksDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              // Pass source group identity to processTaskIpc for authorization
              await processTaskIpc(data, sourceGroup, isMain, deps);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC task',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
      }

      // Process cost reports from this group's IPC directory
      try {
        if (fs.existsSync(costsDir)) {
          const costFiles = fs
            .readdirSync(costsDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of costFiles) {
            const filePath = path.join(costsDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              processCostFile(data, sourceGroup);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC cost report',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC costs directory',
        );
      }

      // Process pipeline progress from this group's IPC directory
      try {
        if (fs.existsSync(pipelinesDir)) {
          const pipelineFiles = fs
            .readdirSync(pipelinesDir)
            .filter((f) => f.endsWith('.json'));
          for (const file of pipelineFiles) {
            const filePath = path.join(pipelinesDir, file);
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              processPipelineFile(data, sourceGroup);
              fs.unlinkSync(filePath);
            } catch (err) {
              logger.error(
                { file, sourceGroup, err },
                'Error processing IPC pipeline file',
              );
              const errorDir = path.join(ipcBaseDir, 'errors');
              fs.mkdirSync(errorDir, { recursive: true });
              fs.renameSync(
                filePath,
                path.join(errorDir, `${sourceGroup}-${file}`),
              );
            }
          }
        }
      } catch (err) {
        logger.error(
          { err, sourceGroup },
          'Error reading IPC pipelines directory',
        );
      }
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

// --- Cost report processing ---

// Pricing per 1M tokens in BRL
const COST_TABLE: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  opus: { input: 75, output: 375, cacheRead: 7.5, cacheWrite: 93.75 },
  sonnet: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  haiku: { input: 1.25, output: 6.25, cacheRead: 0.125, cacheWrite: 1.5625 },
  ollama: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function resolveModelTier(model: string): string {
  const lower = (model || '').toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  if (lower.includes('ollama') || lower.includes('llama')) return 'ollama';
  // Default to sonnet pricing for unknown models
  return 'sonnet';
}

function computeCostBrl(
  model: string,
  tokensIn: number,
  tokensOut: number,
  tokensCacheRead: number,
  tokensCacheWrite: number,
): number {
  const tier = resolveModelTier(model);
  const rates = COST_TABLE[tier] || COST_TABLE.sonnet;
  const cost =
    (tokensIn / 1_000_000) * rates.input +
    (tokensOut / 1_000_000) * rates.output +
    (tokensCacheRead / 1_000_000) * rates.cacheRead +
    (tokensCacheWrite / 1_000_000) * rates.cacheWrite;
  return Math.round(cost * 10000) / 10000; // 4 decimal places
}

function extractOfficeFromGroupFolder(groupFolder: string): string {
  // e.g. "telegram_development" → "development", "slack_ops_team" → "ops_team"
  // Convention: channel prefix separated by first underscore
  const underscoreIdx = groupFolder.indexOf('_');
  if (underscoreIdx > 0) {
    return groupFolder.substring(underscoreIdx + 1);
  }
  // No underscore — use the folder name itself as the office
  return groupFolder;
}

function processCostFile(
  data: {
    agent_name?: string;
    model?: string;
    tokens_in?: number;
    tokens_out?: number;
    tokens_cache_read?: number;
    tokens_cache_write?: number;
    container_name?: string;
    date?: string;
  },
  sourceGroup: string,
): void {
  const agentName = data.agent_name || 'unknown';
  const model = data.model || 'unknown';
  const tokensIn = data.tokens_in || 0;
  const tokensOut = data.tokens_out || 0;
  const tokensCacheRead = data.tokens_cache_read || 0;
  const tokensCacheWrite = data.tokens_cache_write || 0;
  const containerName = data.container_name || '';
  const date = data.date || new Date().toISOString().split('T')[0];
  const office = extractOfficeFromGroupFolder(sourceGroup);
  const costBrl = computeCostBrl(
    model,
    tokensIn,
    tokensOut,
    tokensCacheRead,
    tokensCacheWrite,
  );

  const costId = `cost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  recordAgentCost({
    id: costId,
    office,
    agentName,
    groupFolder: sourceGroup,
    date,
    tokensIn,
    tokensOut,
    tokensCacheRead,
    tokensCacheWrite,
    costBrl,
    modelUsed: model,
    containerName,
  });

  logger.info(
    { costId, office, agentName, model, costBrl, sourceGroup },
    'Agent cost recorded via IPC',
  );
}

// --- Pipeline progress processing ---

function processPipelineFile(
  data: {
    execution_id?: string;
    stage?: number;
    total_stages?: number;
    status?: string;
    agent_name?: string;
    chat_jid?: string;
    triggered_by?: string;
    output?: string;
    score?: number;
    duration_ms?: number;
    started_at?: string;
    completed_at?: string;
  },
  sourceGroup: string,
): void {
  if (!data.execution_id) {
    logger.warn({ sourceGroup }, 'Pipeline file missing execution_id');
    return;
  }

  const office = extractOfficeFromGroupFolder(sourceGroup);
  const now = new Date().toISOString();

  if (data.status === 'started' && data.stage === 1) {
    // First stage started — create a new pipeline execution
    createPipelineExecution({
      id: data.execution_id,
      office,
      groupFolder: sourceGroup,
      chatJid: data.chat_jid || '',
      triggeredBy: data.triggered_by || null,
      totalStages: data.total_stages || 0,
    });

    // Also record the first stage
    const stageId = `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createPipelineStage({
      id: stageId,
      executionId: data.execution_id,
      position: 1,
      agentName: data.agent_name || 'unknown',
      status: 'running',
      output: data.output || null,
      score: data.score ?? null,
      durationMs: data.duration_ms ?? null,
      startedAt: data.started_at || now,
      completedAt: data.completed_at || null,
    });

    logger.info(
      {
        executionId: data.execution_id,
        office,
        totalStages: data.total_stages,
        sourceGroup,
      },
      'Pipeline execution created via IPC',
    );
  } else if (data.status === 'completed' && data.stage !== undefined) {
    // Final stage completed — record the stage and mark execution as completed
    const stageId = `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createPipelineStage({
      id: stageId,
      executionId: data.execution_id,
      position: data.stage,
      agentName: data.agent_name || 'unknown',
      status: 'completed',
      output: data.output || null,
      score: data.score ?? null,
      durationMs: data.duration_ms ?? null,
      startedAt: data.started_at || null,
      completedAt: data.completed_at || now,
    });

    updatePipelineExecution(data.execution_id, {
      currentStage: data.stage,
      status: 'completed',
      completedAt: data.completed_at || now,
    });

    logger.info(
      { executionId: data.execution_id, stage: data.stage, sourceGroup },
      'Pipeline execution completed via IPC',
    );
  } else if (data.stage !== undefined) {
    // Intermediate stage update — record stage and update current position
    const stageId = `stage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    createPipelineStage({
      id: stageId,
      executionId: data.execution_id,
      position: data.stage,
      agentName: data.agent_name || 'unknown',
      status: data.status || 'running',
      output: data.output || null,
      score: data.score ?? null,
      durationMs: data.duration_ms ?? null,
      startedAt: data.started_at || now,
      completedAt: data.completed_at || null,
    });

    updatePipelineExecution(data.execution_id, {
      currentStage: data.stage,
    });

    logger.info(
      {
        executionId: data.execution_id,
        stage: data.stage,
        status: data.status,
        sourceGroup,
      },
      'Pipeline stage recorded via IPC',
    );
  }
}

export async function processTaskIpc(
  data: {
    type: string;
    taskId?: string;
    prompt?: string;
    schedule_type?: string;
    schedule_value?: string;
    context_mode?: string;
    script?: string;
    groupFolder?: string;
    chatJid?: string;
    targetJid?: string;
    // For register_group
    jid?: string;
    name?: string;
    folder?: string;
    trigger?: string;
    requiresTrigger?: boolean;
    containerConfig?: RegisteredGroup['containerConfig'];
  },
  sourceGroup: string, // Verified identity from IPC directory
  isMain: boolean, // Verified from directory path
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task':
      if (
        data.prompt &&
        data.schedule_type &&
        data.schedule_value &&
        data.targetJid
      ) {
        // Resolve the target group from JID
        const targetJid = data.targetJid as string;
        const targetGroupEntry = registeredGroups[targetJid];

        if (!targetGroupEntry) {
          logger.warn(
            { targetJid },
            'Cannot schedule task: target group not registered',
          );
          break;
        }

        const targetFolder = targetGroupEntry.folder;

        // Authorization: non-main groups can only schedule for themselves
        if (!isMain && targetFolder !== sourceGroup) {
          logger.warn(
            { sourceGroup, targetFolder },
            'Unauthorized schedule_task attempt blocked',
          );
          break;
        }

        const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';

        let nextRun: string | null = null;
        if (scheduleType === 'cron') {
          try {
            const interval = CronExpressionParser.parse(data.schedule_value, {
              tz: TIMEZONE,
            });
            nextRun = interval.next().toISOString();
          } catch {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid cron expression',
            );
            break;
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(data.schedule_value, 10);
          if (isNaN(ms) || ms <= 0) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid interval',
            );
            break;
          }
          nextRun = new Date(Date.now() + ms).toISOString();
        } else if (scheduleType === 'once') {
          const date = new Date(data.schedule_value);
          if (isNaN(date.getTime())) {
            logger.warn(
              { scheduleValue: data.schedule_value },
              'Invalid timestamp',
            );
            break;
          }
          nextRun = date.toISOString();
        }

        const taskId =
          data.taskId ||
          `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const contextMode =
          data.context_mode === 'group' || data.context_mode === 'isolated'
            ? data.context_mode
            : 'isolated';
        createTask({
          id: taskId,
          group_folder: targetFolder,
          chat_jid: targetJid,
          prompt: data.prompt,
          script: data.script || null,
          schedule_type: scheduleType,
          schedule_value: data.schedule_value,
          context_mode: contextMode,
          next_run: nextRun,
          status: 'active',
          created_at: new Date().toISOString(),
        });
        logger.info(
          { taskId, sourceGroup, targetFolder, contextMode },
          'Task created via IPC',
        );
        deps.onTasksChanged();
      }
      break;

    case 'pause_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'paused' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task paused via IPC',
          );
          deps.onTasksChanged();
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task pause attempt',
          );
        }
      }
      break;

    case 'resume_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          updateTask(data.taskId, { status: 'active' });
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task resumed via IPC',
          );
          deps.onTasksChanged();
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task resume attempt',
          );
        }
      }
      break;

    case 'cancel_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (task && (isMain || task.group_folder === sourceGroup)) {
          deleteTask(data.taskId);
          logger.info(
            { taskId: data.taskId, sourceGroup },
            'Task cancelled via IPC',
          );
          deps.onTasksChanged();
        } else {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task cancel attempt',
          );
        }
      }
      break;

    case 'update_task':
      if (data.taskId) {
        const task = getTaskById(data.taskId);
        if (!task) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Task not found for update',
          );
          break;
        }
        if (!isMain && task.group_folder !== sourceGroup) {
          logger.warn(
            { taskId: data.taskId, sourceGroup },
            'Unauthorized task update attempt',
          );
          break;
        }

        const updates: Parameters<typeof updateTask>[1] = {};
        if (data.prompt !== undefined) updates.prompt = data.prompt;
        if (data.script !== undefined) updates.script = data.script || null;
        if (data.schedule_type !== undefined)
          updates.schedule_type = data.schedule_type as
            | 'cron'
            | 'interval'
            | 'once';
        if (data.schedule_value !== undefined)
          updates.schedule_value = data.schedule_value;

        // Recompute next_run if schedule changed
        if (data.schedule_type || data.schedule_value) {
          const updatedTask = {
            ...task,
            ...updates,
          };
          if (updatedTask.schedule_type === 'cron') {
            try {
              const interval = CronExpressionParser.parse(
                updatedTask.schedule_value,
                { tz: TIMEZONE },
              );
              updates.next_run = interval.next().toISOString();
            } catch {
              logger.warn(
                { taskId: data.taskId, value: updatedTask.schedule_value },
                'Invalid cron in task update',
              );
              break;
            }
          } else if (updatedTask.schedule_type === 'interval') {
            const ms = parseInt(updatedTask.schedule_value, 10);
            if (!isNaN(ms) && ms > 0) {
              updates.next_run = new Date(Date.now() + ms).toISOString();
            }
          }
        }

        updateTask(data.taskId, updates);
        logger.info(
          { taskId: data.taskId, sourceGroup, updates },
          'Task updated via IPC',
        );
        deps.onTasksChanged();
      }
      break;

    case 'refresh_groups':
      // Only main group can request a refresh
      if (isMain) {
        logger.info(
          { sourceGroup },
          'Group metadata refresh requested via IPC',
        );
        await deps.syncGroups(true);
        // Write updated snapshot immediately
        const availableGroups = deps.getAvailableGroups();
        deps.writeGroupsSnapshot(
          sourceGroup,
          true,
          availableGroups,
          new Set(Object.keys(registeredGroups)),
        );
      } else {
        logger.warn(
          { sourceGroup },
          'Unauthorized refresh_groups attempt blocked',
        );
      }
      break;

    case 'register_group':
      // Only main group can register new groups
      if (!isMain) {
        logger.warn(
          { sourceGroup },
          'Unauthorized register_group attempt blocked',
        );
        break;
      }
      if (data.jid && data.name && data.folder && data.trigger) {
        if (!isValidGroupFolder(data.folder)) {
          logger.warn(
            { sourceGroup, folder: data.folder },
            'Invalid register_group request - unsafe folder name',
          );
          break;
        }
        // Defense in depth: agent cannot set isMain via IPC.
        // Preserve isMain from the existing registration so IPC config
        // updates (e.g. adding additionalMounts) don't strip the flag.
        const existingGroup = registeredGroups[data.jid];
        deps.registerGroup(data.jid, {
          name: data.name,
          folder: data.folder,
          trigger: data.trigger,
          added_at: new Date().toISOString(),
          containerConfig: data.containerConfig,
          requiresTrigger: data.requiresTrigger,
          isMain: existingGroup?.isMain,
        });
      } else {
        logger.warn(
          { data },
          'Invalid register_group request - missing required fields',
        );
      }
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
