'use client';

import { memo } from 'react';

/**
 * Color palette for a sprite. Maps a single character (used in the pattern
 * string) to a CSS color, or to the literal string "transparent".
 */
export type PixelPalette = Record<string, string>;

export interface PixelSpriteProps {
  /**
   * Multi-line ASCII pattern. Each character is one logical pixel; '.' and
   * spaces are always transparent. The first non-blank line determines the
   * width — every line is expected to be the same length.
   */
  pattern: string;
  /** Character → color map. Characters not in the map are treated as transparent. */
  palette: PixelPalette;
  /** Pixel size in CSS pixels. Default 4 (each "pixel" of the sprite renders as a 4×4 box). */
  scale?: number;
  /** Optional className applied to the wrapping <svg> element. */
  className?: string;
  /** Optional inline style on the <svg>. */
  style?: React.CSSProperties;
  /** Optional title for accessibility. */
  title?: string;
}

/**
 * Render a pixel-art sprite as inline SVG.
 *
 * Each character in `pattern` becomes a 1×1 <rect> in the SVG, fills are
 * looked up from `palette`. The whole sprite is wrapped in a <svg> with
 * width/height = sprite size × scale, and `image-rendering: pixelated` so
 * upscaling stays crisp.
 *
 * The component is memoized so re-renders don't recompute the rect list.
 */
export const PixelSprite = memo(function PixelSprite({
  pattern,
  palette,
  scale = 4,
  className,
  style,
  title,
}: PixelSpriteProps) {
  // Strip leading/trailing blank lines so callers can use template literals
  // with leading newlines without affecting the layout.
  const lines = pattern.replace(/^\n+|\n+$/g, '').split('\n');
  const height = lines.length;
  const width = lines.reduce((max, l) => Math.max(max, l.length), 0);

  const rects: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    const line = lines[y];
    for (let x = 0; x < line.length; x++) {
      const ch = line[x];
      if (ch === '.' || ch === ' ' || ch === undefined) continue;
      const fill = palette[ch];
      if (!fill || fill === 'transparent') continue;
      rects.push(
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />,
      );
    }
  }

  return (
    <svg
      className={className}
      style={{
        imageRendering: 'pixelated',
        width: width * scale,
        height: height * scale,
        ...style,
      }}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
    >
      {rects}
    </svg>
  );
});
