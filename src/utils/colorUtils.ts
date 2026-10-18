// Utilities for resolving CSS colours for canvas drawing.

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const FALLBACK: Rgba = { r: 168, g: 85, b: 247, a: 1 };

/** The named colours that actually show up in this application. */
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  lime: '#00ff00',
  navy: '#000080',
  teal: '#008080',
  olive: '#808000',
  maroon: '#800000',
  transparent: '#00000000',
};

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const clampChannel = (value: number): number => Math.round(clamp(value, 0, 255));

/** Parses the numeric part of a colour function: `1, 2, 3` or `1 2 3` or `1 2 3 / 50%`. */
function splitArguments(body: string): { parts: string[]; alpha: string | null } {
  const [values, alpha] = body.split('/');
  const parts = values
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  return { parts, alpha: alpha ? alpha.trim() : null };
}

function parseAlpha(value: string | null | undefined, fallback = 1): number {
  if (value === null || value === undefined || value === '') return fallback;

  if (value.endsWith('%')) {
    return clamp(Number.parseFloat(value) / 100, 0, 1);
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
}

function parseNumber(value: string, scale = 1): number {
  if (value.endsWith('%')) {
    return (Number.parseFloat(value) / 100) * scale;
  }
  return Number.parseFloat(value);
}

/** Converts an HSL colour to RGB. */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const lightness = clamp(l, 0, 1);

  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  };
}

/**
 * Normalises a CSS colour into an rgba object.
 *
 * The parser is implemented here instead of asking the browser, because a canvas is not
 * available in every environment the player runs in (and the visualiser is the only thing
 * that needs the value). Hex, rgb(), rgba(), hsl() and hsla() are supported, in both the
 * comma and the space separated syntax.
 */
export function parseColor(color: string): Rgba {
  if (!color || typeof color !== 'string') return { ...FALLBACK };

  let value = color.trim().toLowerCase();
  if (!value) return { ...FALLBACK };

  // A CSS variable cannot be parsed - the caller resolves it first.
  if (value.startsWith('var(')) return { ...FALLBACK };

  if (NAMED_COLORS[value]) {
    value = NAMED_COLORS[value];
  }

  // --- hex ---------------------------------------------------------------
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/.test(hex)) return { ...FALLBACK };

    const expand = (part: string) => Number.parseInt(part.length === 1 ? part + part : part, 16);

    if (hex.length === 3 || hex.length === 4) {
      return {
        r: expand(hex[0]),
        g: expand(hex[1]),
        b: expand(hex[2]),
        a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
      };
    }

    if (hex.length === 6 || hex.length === 8) {
      return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }

    return { ...FALLBACK };
  }

  // --- rgb / rgba --------------------------------------------------------
  const rgb = value.match(/^rgba?\((.*)\)$/);
  if (rgb) {
    const { parts, alpha } = splitArguments(rgb[1]);
    if (parts.length < 3) return { ...FALLBACK };

    return {
      r: clampChannel(parseNumber(parts[0], 255)),
      g: clampChannel(parseNumber(parts[1], 255)),
      b: clampChannel(parseNumber(parts[2], 255)),
      a: parseAlpha(alpha, parts[3] !== undefined ? parseAlpha(parts[3]) : 1),
    };
  }

  // --- bare hsl components ------------------------------------------------
  // The theme stores its colours the way tailwind expects them: "--primary: 280 100% 70%".
  // Those three components are an hsl colour without the wrapper.
  const bareHsl = value.match(/^(-?[\d.]+)\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/);
  if (bareHsl) {
    const { r, g, b } = hslToRgb(
      Number.parseFloat(bareHsl[1]),
      Number.parseFloat(bareHsl[2]) / 100,
      Number.parseFloat(bareHsl[3]) / 100
    );
    return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b), a: 1 };
  }

  // --- hsl / hsla --------------------------------------------------------
  const hsl = value.match(/^hsla?\((.*)\)$/);
  if (hsl) {
    const { parts, alpha } = splitArguments(hsl[1]);
    if (parts.length < 3) return { ...FALLBACK };

    const hue = Number.parseFloat(parts[0]);
    const saturation = parseNumber(parts[1], 1);
    const lightness = parseNumber(parts[2], 1);
    const { r, g, b } = hslToRgb(hue, saturation, lightness);

    return {
      r: clampChannel(r),
      g: clampChannel(g),
      b: clampChannel(b),
      a: parseAlpha(alpha, parts[3] !== undefined ? parseAlpha(parts[3]) : 1),
    };
  }

  return { ...FALLBACK };
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
