/**
 * Equalizer layout, presets and gain helpers.
 *
 * The bands are ISO third-octave centres (31 bands, 20 Hz to 20 kHz). Presets are written as
 * curves through ten anchor points and interpolated across the bands in log-frequency space,
 * so a preset keeps its shape at any band count.
 */

/** ISO third-octave centre frequencies in Hz. */
export const EQ_BAND_FREQUENCIES: readonly number[] = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250,
  1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
];

export const EQ_BAND_COUNT = EQ_BAND_FREQUENCIES.length;

/** Q of a third-octave band. Lower is wider. */
export const EQ_DEFAULT_Q = 4.32;
export const EQ_MIN_Q = 0.5;
export const EQ_MAX_Q = 8;

/** Selectable gain ranges, in dB, for the sliders and the filter gains. */
export const EQ_RANGE_OPTIONS = [6, 12, 24] as const;
export const EQ_DEFAULT_RANGE = 12;

/** Frequencies the preset anchor points sit on. */
const ANCHOR_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Preset curves, one gain per anchor frequency. */
const PRESET_ANCHORS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [3, 2, -1, -2, -1, 1, 3, 4, 4, 3],
  pop: [1, 2, 3, 2, 0, -1, -1, 1, 2, 3],
  jazz: [2, 1, 0, 1, 2, 2, 1, 0, 1, 2],
  classical: [3, 2, 0, 0, 0, 0, -1, -1, -1, -2],
  electronic: [4, 3, 1, 0, -1, 1, 2, 3, 4, 4],
  'hip-hop': [5, 4, 2, 2, -1, -1, 1, 0, 2, 3],
  acoustic: [3, 3, 2, 1, 1, 1, 2, 3, 2, 1],
  'treble-boost': [0, 0, 0, 0, 0, 0, 1, 2, 4, 5],
  'bass-boost': [6, 4, 2, 1, 0, 0, 0, 0, 0, 0],
  'vocal-enhance': [0, 0, 0, 2, 4, 4, 2, 1, 0, 0],
  'instrument-focus': [0, 0, -2, -1, 0, 1, 2, 3, 2, 1],
  voice: [-3, -2, -1, 0, 2, 4, 4, 2, 0, -2],
};

export const EQ_PRESET_LABELS: Record<string, string> = {
  flat: 'Flat',
  rock: 'Rock',
  pop: 'Pop',
  jazz: 'Jazz',
  classical: 'Classical',
  electronic: 'Electronic',
  'hip-hop': 'Hip-hop',
  acoustic: 'Acoustic',
  'treble-boost': 'Treble boost',
  'bass-boost': 'Bass boost',
  'vocal-enhance': 'Vocal enhance',
  'instrument-focus': 'Instrument focus',
  voice: 'Voice',
};

/** Linear interpolation in log-frequency between the anchor points. */
function interpolateAnchors(anchors: number[], frequency: number): number {
  const first = ANCHOR_FREQUENCIES[0];
  const last = ANCHOR_FREQUENCIES[ANCHOR_FREQUENCIES.length - 1];
  if (frequency <= first) return anchors[0];
  if (frequency >= last) return anchors[anchors.length - 1];

  for (let i = 0; i < ANCHOR_FREQUENCIES.length - 1; i++) {
    const low = ANCHOR_FREQUENCIES[i];
    const high = ANCHOR_FREQUENCIES[i + 1];
    if (frequency >= low && frequency <= high) {
      const t = (Math.log2(frequency) - Math.log2(low)) / (Math.log2(high) - Math.log2(low));
      return anchors[i] + (anchors[i + 1] - anchors[i]) * t;
    }
  }

  return anchors[anchors.length - 1];
}

/** Expands an anchor curve to one gain per band, rounded to half a dB. */
function expandPreset(anchors: number[]): number[] {
  return EQ_BAND_FREQUENCIES.map((frequency) => {
    const gain = interpolateAnchors(anchors, frequency);
    return Math.round(gain * 2) / 2;
  });
}

export const EQ_PRESETS: Record<string, number[]> = Object.fromEntries(
  Object.entries(PRESET_ANCHORS).map(([name, anchors]) => [name, expandPreset(anchors)])
);

/** The preset a play mode switches to. */
export const MODE_PRESET: Record<string, string> = {
  normal: 'flat',
  'vocal-enhance': 'vocal-enhance',
  'instrument-focus': 'instrument-focus',
  'bass-boost': 'bass-boost',
};

/** Keeps a gain inside the selected range. */
export function clampBandGain(gain: number, range: number): number {
  if (!Number.isFinite(gain)) return 0;
  return Math.max(-range, Math.min(range, gain));
}

/** Keeps a Q inside the supported bandwidth limits. */
export function clampQ(q: number): number {
  if (!Number.isFinite(q)) return EQ_DEFAULT_Q;
  return Math.max(EQ_MIN_Q, Math.min(EQ_MAX_Q, q));
}

/** Short band label, for example "32 Hz", "1.25 kHz", "16 kHz". */
export function formatBandFrequency(frequency: number): string {
  if (frequency >= 1000) {
    const khz = frequency / 1000;
    return `${Number.isInteger(khz) ? khz : khz.toFixed(2).replace(/0$/, '')} kHz`;
  }
  return `${Number.isInteger(frequency) ? frequency : frequency.toFixed(1)} Hz`;
}
