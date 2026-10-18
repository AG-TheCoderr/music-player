// Utilities for resolving CSS colours for canvas drawing.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

let scratchContext: CanvasRenderingContext2D | null = null;

/** A reusable 2d context is used to let the browser normalise any CSS colour. */
function getScratchContext(): CanvasRenderingContext2D | null {
  if (scratchContext) return scratchContext;
  if (typeof document === 'undefined') return null;

  try {
    scratchContext = document.createElement('canvas').getContext('2d');
  } catch {
    scratchContext = null;
  }

  return scratchContext;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * Normalises any CSS colour (hex, rgb, hsl, named) into an rgba object.
 *
 * The browser is asked to do the conversion so that modern colour syntaxes
 * (`hsl(280 100% 70%)`) are supported.
 */
export function parseColor(color: string): Rgba {
  const fallback: Rgba = { r: 168, g: 85, b: 247, a: 1 };
  if (!color) return fallback;

  const ctx = getScratchContext();
  if (!ctx) return fallback;

  // Assigning an invalid colour leaves the previous value in place.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color.trim();
  const normalized = ctx.fillStyle;

  if (typeof normalized === 'string' && HEX_PATTERN.test(normalized)) {
    const hex = normalized.slice(1);
    const expand = (value: string) => parseInt(value.length === 1 ? value + value : value, 16);

    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }

    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = normalized.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => part.trim());
    return {
      r: Number(parts[0]) || 0,
      g: Number(parts[1]) || 0,
      b: Number(parts[2]) || 0,
      a: parts[3] === undefined ? 1 : Number(parts[3]),
    };
  }

  return fallback;
}

/** Reads a CSS custom property and returns its computed value. */
export function getResolvedCSSColor(cssVariable: string): string {
  if (typeof window === 'undefined') return '#a855f7';

  const variableName = cssVariable.includes('var(')
    ? cssVariable.replace(/var\(([^)]+)\)/, '$1')
    : cssVariable;

  const computedStyle = getComputedStyle(document.documentElement);
  const value = computedStyle.getPropertyValue(variableName).trim();

  if (value) return value;

  const fallbacks: Record<string, string> = {
    '--primary': '#a855f7',
    '--primary-glow': '#c084fc',
    '--accent': '#e879f9',
    '--foreground': '#f3e8ff',
  };

  return fallbacks[variableName] || '#a855f7';
}

/** Builds an `rgba()` string from any CSS colour. */
export function createColorWithAlpha(baseColor: string, alpha: number): string {
  const { r, g, b } = parseColor(baseColor);
  const clamped = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}
