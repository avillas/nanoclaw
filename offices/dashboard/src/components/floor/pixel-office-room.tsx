'use client';

import { cn } from '@/lib/cn';
import type { Agent } from '@/types';
import { PixelSprite } from './pixel-sprite';
import { PixelWorkstation } from './pixel-workstation';
import { PLANT_PATTERN, plantPalette } from './sprites';

interface PixelOfficeRoomProps {
  name: string;
  agents: Agent[];
  onDelete: (agent: Agent) => void;
  /** Pixel scale forwarded to every workstation. Default 4. */
  scale?: number;
}

const OFFICE_THEME: Record<
  string,
  { accent: string; bg: string; ring: string; label: string }
> = {
  marketing: {
    accent: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.04)',
    ring: 'border-office-marketing/30',
    label: 'text-office-marketing',
  },
  development: {
    accent: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.04)',
    ring: 'border-office-development/30',
    label: 'text-office-development',
  },
  innovation: {
    accent: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.04)',
    ring: 'border-office-innovation/30',
    label: 'text-office-innovation',
  },
};

const DEFAULT_THEME = {
  accent: '#06b6d4',
  bg: 'rgba(6, 182, 212, 0.04)',
  ring: 'border-accent/30',
  label: 'text-accent',
};

/**
 * A "room" for one office: a bordered card with a tiled floor pattern, a
 * name plate at the top, plant decorations in the corners, and the office's
 * agents rendered as PixelWorkstations that flex-wrap inside.
 */
export function PixelOfficeRoom({
  name,
  agents,
  onDelete,
  scale = 4,
}: PixelOfficeRoomProps) {
  const theme = OFFICE_THEME[name] || DEFAULT_THEME;
  const working = agents.filter((a) => a.status === 'working').length;
  const officeActive = agents.some((a) => a.officeActive);

  return (
    <div
      className={cn(
        'relative rounded-2xl border-4 overflow-hidden',
        'pixel-floor-pattern',
        theme.ring,
      )}
      style={{ backgroundColor: theme.bg }}
    >
      {/* Top wall — solid bar with the office name like a door sign */}
      <div
        className="px-4 py-2 border-b-2 flex items-center justify-between gap-2"
        style={{
          backgroundColor: `${theme.accent}22`,
          borderBottomColor: `${theme.accent}55`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: theme.accent }}
          />
          <h2
            className={cn(
              'text-sm font-bold uppercase tracking-widest font-mono',
              theme.label,
            )}
          >
            {name}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted">
          <span>
            {officeActive && working === 0
              ? `1 task running · ${agents.length} agents`
              : `${working}/${agents.length} active`}
          </span>
          {(working > 0 || officeActive) && (
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-75"
                style={{ backgroundColor: theme.accent }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: theme.accent }}
              />
            </span>
          )}
        </div>
      </div>

      {/* Floor area with workstations */}
      <div className="relative p-6 sm:p-8">
        {/* Corner plants */}
        <div className="absolute top-3 left-3 opacity-90 pointer-events-none">
          <PixelSprite
            pattern={PLANT_PATTERN}
            palette={plantPalette}
            scale={scale}
            className="pixel-art"
          />
        </div>
        <div className="absolute top-3 right-3 opacity-90 pointer-events-none">
          <PixelSprite
            pattern={PLANT_PATTERN}
            palette={plantPalette}
            scale={scale}
            className="pixel-art"
          />
        </div>
        <div className="absolute bottom-3 left-3 opacity-90 pointer-events-none">
          <PixelSprite
            pattern={PLANT_PATTERN}
            palette={plantPalette}
            scale={scale}
            className="pixel-art"
          />
        </div>
        <div className="absolute bottom-3 right-3 opacity-90 pointer-events-none">
          <PixelSprite
            pattern={PLANT_PATTERN}
            palette={plantPalette}
            scale={scale}
            className="pixel-art"
          />
        </div>

        {/* Workstations grid */}
        {agents.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">
            No agents in this office
          </p>
        ) : (
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-8 py-2 px-12">
            {agents.map((agent) => (
              <PixelWorkstation
                key={agent.id}
                agent={agent}
                onDelete={onDelete}
                scale={scale}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
