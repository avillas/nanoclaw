// ============================================================================
// NanoClaw Mission Control — Type Definitions
// ============================================================================

// --- Offices ---
/** Built-in offices + any dynamically created office */
export type OfficeName = 'marketing' | 'development' | 'innovation' | (string & {});

export interface Office {
  name: OfficeName;
  displayName: string;
  description: string;
  agentCount: number;
  activeAgents: number;
  pipeline: PipelineStage[];
  dailyBudget: number;
  monthlyBudget: number;
  dailySpent: number;
  monthlySpent: number;
  status: OfficeStatus;
}

export type OfficeStatus = 'operational' | 'degraded' | 'offline';

// --- Agents ---
export interface Agent {
  id: string;
  slug: string;
  name: string;
  office: OfficeName;
  role: string;
  model: ModelTier;
  status: AgentStatus;
  containerId?: string;
  containerStatus?: ContainerStatus;
  officeActive?: boolean;
  pipelinePosition: number;
  skills: string[];
  lastActiveAt?: string;
  tasksCompleted: number;
  tokensUsed: number;
  costToday: number;
}

export type AgentStatus = 'idle' | 'working' | 'waiting' | 'error' | 'offline';
export type ContainerStatus = 'running' | 'paused' | 'stopped' | 'not_found';
export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'ollama-llama3.2' | 'ollama-qwen3';

// --- Pipelines ---
export interface Pipeline {
  id: string;
  office: OfficeName;
  triggeredBy: string;
  triggeredAt: string;
  status: PipelineStatus;
  currentStage: number;
  stages: PipelineStageExecution[];
  totalDuration?: number;
}

export type PipelineStatus = 'running' | 'completed' | 'failed' | 'paused' | 'pending';

export interface PipelineStage {
  position: number;
  agentName: string;
  action: string;
  gate?: string;
  onFail?: string;
}

export interface PipelineStageExecution {
  position: number;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  output?: string;
  score?: number;
  gateResult?: 'passed' | 'failed' | 'pending';
}

// --- Activity ---
export interface ActivityEvent {
  id: string;
  timestamp: string;
  office: OfficeName;
  agent: string;
  action: string;
  detail: string;
  level: 'info' | 'warning' | 'error' | 'success';
}

// --- Costs ---
export interface CostEntry {
  date: string;
  office: OfficeName;
  agent: string;
  model: ModelTier;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface CostSummary {
  office: OfficeName;
  dailyBudget: number;
  monthlyBudget: number;
  dailySpent: number;
  monthlySpent: number;
  dailyPercentage: number;
  monthlyPercentage: number;
}

// --- Messages (from NanoClaw SQLite) ---
export interface NanoClawMessage {
  id: number;
  jid: string;
  sender: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  chatName?: string;
}

// --- Container Runtime ---
export type ContainerRuntime = 'docker' | 'apple-container' | 'mock';

// --- Containers ---
export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: ContainerStatus;
  created: string;
  ports: string[];
  labels: Record<string, string>;
  runtime: ContainerRuntime;
  stats?: ContainerStats;
}

export interface ContainerStats {
  cpuPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercent: number;
  networkRx: number;
  networkTx: number;
}

// --- Dashboard KPIs ---
export interface DashboardKPIs {
  totalAgents: number;
  activeAgents: number;
  runningPipelines: number;
  completedToday: number;
  totalCostToday: number;
  totalCostMonth: number;
  offices: Office[];
}
