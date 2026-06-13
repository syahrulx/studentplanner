// Pick a readable foreground (near-black or white) for text/icons placed on top
// of a colored surface. Used for gradient cards so they stay legible across all
// themes — including the Mono theme where primary is pure white.

/** Returns '#0a0a0a' on light backgrounds, '#ffffff' on dark ones. */
export function contrastText(hex: string): string {
  const h = (hex || '').replace('#', '').slice(0, 6);
  if (h.length < 6) return '#ffffff';
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return '#ffffff';
  // Perceived luminance (0–1).
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.62 ? '#0a0a0a' : '#ffffff';
}

/** Same color with an alpha suffix (e.g. for muted subtitles or icon chips). */
export function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`;
}
