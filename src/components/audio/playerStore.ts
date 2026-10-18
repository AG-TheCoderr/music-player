import { AudioEffects, AudioEngineInfo } from './AudioEngine';

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  src: string | File;
  artwork?: string;
  /** `youtube` tracks are played through the YouTube IFrame player instead of the Web Audio graph. */
  source?: 'audio' | 'youtube';
}

export type PlayMode = 'normal' | 'vocal-enhance' | 'instrument-focus' | 'bass-boost';
export type RepeatMode = 'none' | 'one' | 'all';
export type ExternalSource = 'none' | 'youtube';

export interface AudioPlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  error: string | null;
  playlist: Track[];
  currentTrackIndex: number;
  mode: PlayMode;
  equalizerBands: number[];
  equalizerPreset: string;
  effects: AudioEffects;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  externalSource: ExternalSource;
  audioInfo: AudioEngineInfo | null;
}

export interface AudioPlayerActions {
  loadTrack: (track: Track) => Promise<void>;
  loadYouTube: (url: string, meta?: Partial<Track>, containerId?: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seekTo: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setMode: (mode: PlayMode) => void;
  setEqualizerBand: (index: number, gain: number) => void;
  setEqualizerPreset: (preset: string) => void;
  updateEffects: (effects: Partial<AudioEffects>) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  addToPlaylist: (track: Track) => void;
  removeFromPlaylist: (trackId: string) => void;
  reorderPlaylist: (fromIndex: number, toIndex: number) => void;
  playTrackAtIndex: (index: number) => void;
  clearPlaylist: () => void;
  dismissError: () => void;
  getFrequencyData: () => Uint8Array;
  getTimeDomainData: () => Uint8Array;
}

export type PlayerUpdater = AudioPlayerState | ((previous: AudioPlayerState) => AudioPlayerState);

/**
 * A tiny external store.
 *
 * The player updates the playback position ten times a second. Keeping the state in a plain
 * React context would re-render every consumer on every tick, so the state lives here and
 * components subscribe to the slice they actually use.
 */
export class PlayerStore {
  private state: AudioPlayerState;
  private listeners = new Set<() => void>();

  constructor(initialState: AudioPlayerState) {
    this.state = initialState;
  }

  getState = (): AudioPlayerState => this.state;

  setState = (updater: PlayerUpdater): void => {
    const next = typeof updater === 'function' ? updater(this.state) : updater;
    if (next === this.state) return;

    this.state = next;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** Shallow equality for the small object/array slices that components select. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) =>
    Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}
