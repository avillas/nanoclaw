/**
 * Pixel-art sprite definitions for the Office Floor page.
 *
 * Every sprite is a multi-line ASCII pattern paired with a character → color
 * palette. The PixelSprite component turns each character into a 1×1 SVG
 * rect, and the whole sprite is then scaled up via the `scale` prop.
 *
 * Design notes:
 * - All sprites are kept small (≤32 logical pixels per axis) so they remain
 *   readably "pixel art" when scaled up.
 * - Office accent colors are applied at runtime (via the `palette` arg of
 *   each helper) so the same agent sprite renders with a marketing-amber
 *   shirt for marketing agents, dev-blue for development, etc.
 */

import type { PixelPalette } from './pixel-sprite';

// ---------------------------------------------------------------------------
// Shared color constants
// ---------------------------------------------------------------------------
const HAIR = '#2c1f17';
const SKIN = '#f4c2a1';
const SKIN_DARK = '#d4a081';
const WOOD_DARK = '#3a2a1a';
const WOOD_LIGHT = '#9c7a52';
const WOOD_HIGHLIGHT = '#bd9466';
const MONITOR_FRAME = '#181a20';
const MONITOR_OFF = '#0a0c12';
const MONITOR_ON = '#22d3ee';
const MONITOR_ERROR = '#ef4444';
const MONITOR_WAIT = '#f59e0b';
const CHAIR = '#2a2f3d';
const CHAIR_HIGHLIGHT = '#3a4252';
const PLANT_LEAF = '#15803d';
const PLANT_LEAF_LIGHT = '#22c55e';
const PLANT_POT = '#9a3412';
const PLANT_POT_DARK = '#6b2410';

// ---------------------------------------------------------------------------
// Agent — top-down character (16×16)
// ---------------------------------------------------------------------------
// H = hair, F = face/skin, T = shirt (parameterized), N = neck (skin)
export const AGENT_PATTERN = `
................
................
.....HHHHHH.....
....HHHHHHHH....
....HFFFFFFH....
....HFFFFFFH....
....HFFFFFFH....
....HFFFFFFH....
.....NFFFFN.....
.....TTTTTT.....
....TTTTTTTT....
....TTTTTTTT....
....TTTTTTTT....
....TTTTTTTT....
.....TTTTTT.....
................
`;

export function agentPalette(shirtColor: string): PixelPalette {
  return {
    H: HAIR,
    F: SKIN,
    N: SKIN_DARK,
    T: shirtColor,
  };
}

// ---------------------------------------------------------------------------
// Desk — top-down with monitor (20×8)
// ---------------------------------------------------------------------------
// D = dark wood outline, B = wood surface, H = wood highlight,
// K = monitor frame, M = monitor screen
export const DESK_PATTERN = `
DDDDDDDDDDDDDDDDDDDD
DBHHHHHHHHHHHHHHHHBD
DBBBBKKKKKKKKKKBBBBD
DBBBBKMMMMMMMMKBBBBD
DBBBBKMMMMMMMMKBBBBD
DBBBBKKKKKKKKKKBBBBD
DBBBBBBBBBBBBBBBBBBD
DDDDDDDDDDDDDDDDDDDD
`;

const DESK_BASE: PixelPalette = {
  D: WOOD_DARK,
  B: WOOD_LIGHT,
  H: WOOD_HIGHLIGHT,
  K: MONITOR_FRAME,
};

export const deskPaletteIdle: PixelPalette = { ...DESK_BASE, M: MONITOR_OFF };
export const deskPaletteWorking: PixelPalette = { ...DESK_BASE, M: MONITOR_ON };
export const deskPaletteError: PixelPalette = { ...DESK_BASE, M: MONITOR_ERROR };
export const deskPaletteWaiting: PixelPalette = { ...DESK_BASE, M: MONITOR_WAIT };

// ---------------------------------------------------------------------------
// Chair — top-down view of swivel chair back (14×5)
// ---------------------------------------------------------------------------
// C = chair fabric, H = highlight rim
export const CHAIR_PATTERN = `
.HHHHHHHHHHHH.
HCCCCCCCCCCCCH
HCCCCCCCCCCCCH
.HCCCCCCCCCCH.
..HHHHHHHHHH..
`;

export const chairPalette: PixelPalette = {
  C: CHAIR,
  H: CHAIR_HIGHLIGHT,
};

// ---------------------------------------------------------------------------
// Plant — decoration (10×11)
// ---------------------------------------------------------------------------
// L = leaf dark, l = leaf highlight, S = stem (dark leaf), P = pot, p = pot dark
export const PLANT_PATTERN = `
...LLll...
..LLLLll..
.LLLLLLLL.
.LLLlllLL.
.LLLLLLLL.
..LLLSSL..
....SS....
..PPPPPP..
.PPPPPPPP.
.PpPPPPpP.
..pppppp..
`;

export const plantPalette: PixelPalette = {
  L: PLANT_LEAF,
  l: PLANT_LEAF_LIGHT,
  S: PLANT_LEAF,
  P: PLANT_POT,
  p: PLANT_POT_DARK,
};

// ---------------------------------------------------------------------------
// Coffee mug — small desk decoration (5×5)
// ---------------------------------------------------------------------------
// W = mug, C = coffee, H = highlight
export const COFFEE_PATTERN = `
WWWWW
WCCCW
WCCCW
WCCCW
WWWWW
`;

export const coffeePalette: PixelPalette = {
  W: '#e2e8f0',
  C: '#5a3a1a',
};

// ---------------------------------------------------------------------------
// Office accent colors per office (shirt color for the agent sprite)
// ---------------------------------------------------------------------------
export const OFFICE_SHIRT_COLOR: Record<string, string> = {
  marketing: '#f59e0b',
  development: '#3b82f6',
  innovation: '#a855f7',
};

export function getShirtColor(office: string): string {
  return OFFICE_SHIRT_COLOR[office] || '#06b6d4';
}
