import { AudioEffects } from '@/components/audio/AudioEngine';
import { PlayMode, RepeatMode, Track } from '@/components/audio/playerStore';

const STORAGE_KEY = 'sonic-studio-pro:preferences';
const STORAGE_VERSION = 1;

export interface PersistedPreferences {
  version: number;
  volume: number;
  equalizerBands: number[];
  equalizerPreset: string;
  effects: AudioEffects;
  mode: PlayMode;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  /** Only tracks with a remote source can be restored - local File handles cannot be serialized. */
  playlist: Track[];
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readNumberArray(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  if (!value.every((item) => typeof item === 'number' && Number.isFinite(item))) return null;
  return value as number[];
}

const PLAY_MODES: PlayMode[] = ['normal', 'vocal-enhance', 'instrument-focus', 'bass-boost'];
const REPEAT_MODES: RepeatMode[] = ['none', 'one', 'all'];

const OVERSAMPLE_TYPES: OverSampleType[] = ['none', '2x', '4x'];

/**
 * Reads the four effect groups.
 *
 * Every group is restored - before, only the reverb survived a reload and the chorus,
 * the distortion and the compressor were silently reset.
 */
function readEffects(value: unknown): AudioEffects | null {
  if (!isRecord(value)) return null;

  const effects: AudioEffects = {
    reverb: { roomSize: 0, damping: 0, wetLevel: 0, dryLevel: 0 },
    chorus: { rate: 0, depth: 0, feedback: 0, wetLevel: 0 },
    distortion: { amount: 0, oversample: '4x' },
    compressor: { threshold: 0, knee: 0, ratio: 0, attack: 0, release: 0 },
  };

  const reverb = value.reverb;
  if (isRecord(reverb)) {
    effects.reverb = {
      roomSize: clamp(Number(reverb.roomSize), 0, 1),
      damping: clamp(Number(reverb.damping), 0, 1),
      wetLevel: clamp(Number(reverb.wetLevel), 0, 1),
      dryLevel: clamp(Number(reverb.dryLevel), 0, 1),
    };
  }

  const chorus = value.chorus;
  if (isRecord(chorus)) {
    effects.chorus = {
      rate: clamp(Number(chorus.rate), 0.05, 20),
      depth: clamp(Number(chorus.depth), 0, 1),
      feedback: clamp(Number(chorus.feedback), 0, 0.85),
      wetLevel: clamp(Number(chorus.wetLevel), 0, 1),
    };
  }

  const distortion = value.distortion;
  if (isRecord(distortion)) {
    effects.distortion = {
      amount: clamp(Number(distortion.amount), 0, 100),
      oversample: OVERSAMPLE_TYPES.includes(distortion.oversample as OverSampleType)
        ? (distortion.oversample as OverSampleType)
        : '4x',
    };
  }

  const compressor = value.compressor;
  if (isRecord(compressor)) {
    effects.compressor = {
      threshold: clamp(Number(compressor.threshold), -100, 0),
      knee: clamp(Number(compressor.knee), 0, 40),
      ratio: clamp(Number(compressor.ratio), 1, 20),
      attack: clamp(Number(compressor.attack), 0, 1),
      release: clamp(Number(compressor.release), 0, 1),
    };
  }

  return effects;
}

/** Reads the stored preferences, ignoring anything malformed. */
export function loadPreferences(): Partial<PersistedPreferences> | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) return null;

    const result: Partial<PersistedPreferences> = { version: STORAGE_VERSION };

    if (typeof parsed.volume === 'number') {
      result.volume = clamp(parsed.volume, 0, 1);
    }

    const bands = readNumberArray(parsed.equalizerBands, 10);
    if (bands) result.equalizerBands = bands;

    if (typeof parsed.equalizerPreset === 'string') {
      result.equalizerPreset = parsed.equalizerPreset;
    }

    const effects = readEffects(parsed.effects);
    if (effects) result.effects = effects;

    if (typeof parsed.mode === 'string' && PLAY_MODES.includes(parsed.mode as PlayMode)) {
      result.mode = parsed.mode as PlayMode;
    }
    if (typeof parsed.isShuffled === 'boolean') result.isShuffled = parsed.isShuffled;
    if (typeof parsed.repeatMode === 'string' && REPEAT_MODES.includes(parsed.repeatMode as RepeatMode)) {
      result.repeatMode = parsed.repeatMode as RepeatMode;
    }

    if (Array.isArray(parsed.playlist)) {
      const playlist = parsed.playlist.filter(
        (item): item is Track =>
          isRecord(item) && typeof item.id === 'string' && typeof item.src === 'string'
      );
      result.playlist = playlist.slice(0, 200);
    }

    return result;
  } catch {
    return null;
  }
}

/** Persists the preferences. Failures (private mode, quota) are ignored on purpose. */
export function savePreferences(preferences: Omit<PersistedPreferences, 'version'>): void {
  if (typeof localStorage === 'undefined') return;

  try {
    const payload: PersistedPreferences = {
      version: STORAGE_VERSION,
      volume: preferences.volume,
      equalizerBands: preferences.equalizerBands,
      equalizerPreset: preferences.equalizerPreset,
      effects: preferences.effects,
      mode: preferences.mode,
      isShuffled: preferences.isShuffled,
      repeatMode: preferences.repeatMode,
      playlist: preferences.playlist,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable - keep playing */
  }
}

export function clearPreferences(): void {
  try {
    localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
