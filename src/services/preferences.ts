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

    if (isRecord(parsed.effects)) {
      const effects = parsed.effects as Partial<AudioEffects>;
      if (isRecord(effects.reverb)) {
        result.effects = {
          ...(result.effects as AudioEffects),
          reverb: {
            roomSize: clamp(Number(effects.reverb.roomSize), 0, 1),
            damping: clamp(Number(effects.reverb.damping), 0, 1),
            wetLevel: clamp(Number(effects.reverb.wetLevel), 0, 1),
            dryLevel: clamp(Number(effects.reverb.dryLevel), 0, 1),
          },
        } as AudioEffects;
      }
    }

    if (typeof parsed.mode === 'string') result.mode = parsed.mode as PlayMode;
    if (typeof parsed.isShuffled === 'boolean') result.isShuffled = parsed.isShuffled;
    if (typeof parsed.repeatMode === 'string') result.repeatMode = parsed.repeatMode as RepeatMode;

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
