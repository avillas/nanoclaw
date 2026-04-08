'use client';

import { cn } from '@/lib/cn';
import type { Agent } from '@/types';
import { PixelSprite } from './pixel-sprite';
import {
  AGENT_PATTERN,
  agentPalette,
  CHAIR_PATTERN,
  chairPalette,
  DESK_PATTERN,
  deskPaletteError,
  deskPaletteIdle,
  deskPaletteWaiting,
  deskPaletteWorking,
  getShirtColor,
} from './sprites';

interface PixelWorkstationProps {
  agent: Agent;
  /** Pixel size in CSS pixels per logical sprite pixel. Default 4. */
  scale?: number;
  /** Called when the user clicks the small remove icon. */
  onDelete?: (agent: Agent) => void;
}

function deskPaletteFor(status: Agent['status']) {
  switch (status) {
    case 'working':
      return deskPaletteWorking;
    case 'error':
      return deskPaletteError;
    case 'waiting':
      return deskPaletteWaiting;
    default:
      return deskPaletteIdle;
  }
}

const STATUS_DOT_COLOR: Record<string, string> = {
  working: 'bg-status-online',
  idle: 'bg-status-offline',
  waiting: 'bg-status-warning',
  error: 'bg-status-error',
  offline: 'bg-gray-600',
};

/**
 * One agent rendered as a pixel-art workstation: a desk with monitor at the
 * top, the character below it (sitting at the desk), and a swivel chair
 * tucked beneath. The whole tile is sized so it tiles cleanly inside the
 * office room with `flex-wrap`.
 *
 * Visual states:
 *  - working: monitor lit cyan, character bobs, monitor flickers, "..." bubble
 *  - waiting: monitor amber
 *  - error:   monitor red, "!" bubble
 *  - idle:    monitor dark, no animation
 *
 * The character's shirt color is taken from the agent's office accent.
 */
export function PixelWorkstation({
  agent,
  scale = 4,
  onDelete,
}: PixelWorkstationProps) {
  const isWorking = agent.status === 'working';
  const isError = agent.status === 'error';
  const shirtColor = getShirtColor(agent.office);

  // Logical sprite dimensions (must match the patterns in sprites.ts)
  const DESK_W = 20;
  const AGENT_W = 16;
  const CHAIR_W = 14;

  // Each tile is `DESK_W * scale` wide. We center the agent + chair under the
  // desk so the workstation visually reads as a single unit.
  const tileWidth = DESK_W * scale;
  const agentOffset = ((DESK_W - AGENT_W) * scale) / 2;
  const chairOffset = ((DESK_W - CHAIR_W) * scale) / 2;

  return (
    <div
      className="relative group/workstation flex flex-col items-center"
      style={{ width: tileWidth }}
    >
      {/* Status bubble — appears above the desk when working/error */}
      {(isWorking || isError) && (
        <div
          className={cn(
            'absolute -top-3 left-1/2 -translate-x-1/2 z-20',
            'px-1.5 py-0.5 rounded-md text-[9px] font-mono font-bold',
            'animate-pixel-bubble',
            isError
              ? 'bg-status-error/90 text-white border border-red-300'
              : 'bg-accent/90 text-black border border-cyan-200',
          )}
        >
          {isError ? '!' : <span className="animate-pixel-cursor">...</span>}
        </div>
      )}

      {/* Delete button — visible on hover (desktop) and always on mobile */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(agent);
          }}
          className={cn(
            'absolute top-0 right-0 z-30',
            'w-5 h-5 rounded-full flex items-center justify-center',
            'bg-status-error/80 text-white text-[10px] font-bold leading-none',
            'opacity-100 lg:opacity-0 lg:group-hover/workstation:opacity-100',
            'transition-opacity duration-150 hover:bg-status-error',
          )}
          title={`Remove ${agent.name}`}
        >
          ×
        </button>
      )}

      {/* Desk + monitor */}
      <PixelSprite
        pattern={DESK_PATTERN}
        palette={deskPaletteFor(agent.status)}
        scale={scale}
        className={cn('pixel-art', isWorking && 'animate-pixel-flicker')}
      />

      {/* Agent character — overlaps the desk slightly so they "touch" */}
      <div
        className={cn('relative', isWorking && 'animate-pixel-bob')}
        style={{ marginLeft: agentOffset, marginTop: -scale * 1 }}
      >
        <PixelSprite
          pattern={AGENT_PATTERN}
          palette={agentPalette(shirtColor)}
          scale={scale}
          className="pixel-art"
        />
      </div>

      {/* Chair behind the character */}
      <div style={{ marginLeft: chairOffset, marginTop: -scale * 6 }}>
        <PixelSprite
          pattern={CHAIR_PATTERN}
          palette={chairPalette}
          scale={scale}
          className="pixel-art"
        />
      </div>

      {/* Name plate — small label below */}
      <div className="mt-1 text-center w-full">
        <div className="flex items-center justify-center gap-1">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full flex-shrink-0',
              STATUS_DOT_COLOR[agent.status] || STATUS_DOT_COLOR.offline,
              isWorking && 'animate-pulse',
            )}
          />
          <p className="text-[10px] font-medium text-text-primary truncate max-w-full">
            {agent.name}
          </p>
        </div>
        <p className="text-[9px] text-text-muted truncate max-w-full font-mono uppercase tracking-wider">
          {agent.model}
        </p>
      </div>
    </div>
  );
}
