import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AudioEngine, AudioEffects, AudioEngineInfo } from './AudioEngine';
import { MediaSessionService } from '@/services/mediaSession';
import { YouTubeController, YT_PLAYER_CONTAINER_ID } from '@/services/youtubeController';

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

export type AudioPlayerContextType = AudioPlayerState & AudioPlayerActions;

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

const initialEffects: AudioEffects = {
  reverb: {
    roomSize: 0.3,
    damping: 0.5,
    wetLevel: 0.1,
    dryLevel: 0.9,
  },
  chorus: {
    rate: 1.5,
    depth: 0.3,
    feedback: 0.2,
    wetLevel: 0.3,
  },
  distortion: {
    amount: 0,
    oversample: '4x',
  },
  compressor: {
    threshold: -24,
    knee: 30,
    ratio: 12,
    attack: 0.003,
    release: 0.25,
  },
};

export const equalizerPresets: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [3, 2, -1, -2, -1, 1, 3, 4, 4, 3],
  pop: [1, 2, 3, 2, 0, -1, -1, 1, 2, 3],
  jazz: [2, 1, 0, 1, 2, 2, 1, 0, 1, 2],
  classical: [3, 2, 0, 0, 0, 0, -1, -1, -1, -2],
  electronic: [4, 3, 1, 0, -1, 1, 2, 3, 4, 4],
  'bass-boost': [6, 4, 2, 1, 0, 0, 0, 0, 0, 0],
  'vocal-enhance': [0, 0, 0, 2, 4, 4, 2, 1, 0, 0],
  'instrument-focus': [0, 0, -2, -1, 0, 1, 2, 3, 2, 1],
};

const MODE_PRESET: Record<PlayMode, string> = {
  normal: 'flat',
  'vocal-enhance': 'vocal-enhance',
  'instrument-focus': 'instrument-focus',
  'bass-boost': 'bass-boost',
};

const initialState: AudioPlayerState = {
  currentTrack: null,
  isPlaying: false,
  volume: 0.7,
  currentTime: 0,
  duration: 0,
  isLoading: false,
  error: null,
  playlist: [],
  currentTrackIndex: -1,
  mode: 'normal',
  equalizerBands: [...equalizerPresets.flat],
  equalizerPreset: 'flat',
  effects: initialEffects,
  isShuffled: false,
  repeatMode: 'none',
  externalSource: 'none',
  audioInfo: null,
};

/** Builds a random playback order, keeping the active track first. */
function buildShuffleOrder(playlist: Track[], keepId: string | null): number[] {
  const keepIndex = keepId ? playlist.findIndex((track) => track.id === keepId) : -1;
  const rest = playlist.map((_, index) => index).filter((index) => index !== keepIndex);

  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }

  return keepIndex >= 0 ? [keepIndex, ...rest] : rest;
}

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const shuffleOrderRef = useRef<number[]>([]);
  const [state, setState] = useState<AudioPlayerState>(initialState);

  // Keeps the latest state reachable from stable callbacks (no stale closures).
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------------------------------------------------------------------
  // Engine lifecycle
  // ---------------------------------------------------------------------
  useEffect(() => {
    const engine = new AudioEngine();
    audioEngineRef.current = engine;

    engine.setErrorHandler((error) => {
      setState((prev) => ({ ...prev, isPlaying: false, error: error.message }));
    });

    return () => {
      engine.setEndedHandler(null);
      engine.setErrorHandler(null);
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------
  // Playback helpers
  // ---------------------------------------------------------------------
  const applyEngineState = useCallback(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    const current = stateRef.current;
    engine.setVolume(current.volume);
    engine.setAllEqualizerBands(current.equalizerBands);
    engine.setReverbSettings(current.effects.reverb);
    engine.setChorusSettings(current.effects.chorus);
    engine.setCompressorSettings(current.effects.compressor);
    engine.setDistortionAmount(current.effects.distortion.amount);
    engine.setDistortionOversample(current.effects.distortion.oversample);
  }, []);

  const play = useCallback(() => {
    const current = stateRef.current;

    if (current.externalSource === 'youtube') {
      YouTubeController.play();
      setState((prev) => ({ ...prev, isPlaying: true, error: null }));
      MediaSessionService.updatePlaybackState('playing');
      return;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.play();
      setState((prev) => ({ ...prev, isPlaying: true, error: null }));
      MediaSessionService.updatePlaybackState('playing');
    }
  }, []);

  const pause = useCallback(() => {
    const current = stateRef.current;

    if (current.externalSource === 'youtube') {
      YouTubeController.pause();
      setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
      return;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.pause();
      setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
    }
  }, []);

  const stop = useCallback(() => {
    if (stateRef.current.externalSource === 'youtube') {
      YouTubeController.stop();
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      return;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));

    if (stateRef.current.externalSource === 'youtube') {
      YouTubeController.setVolume(clamped);
    } else {
      audioEngineRef.current?.setVolume(clamped);
    }

    setState((prev) => ({ ...prev, volume: clamped }));
  }, []);

  const seekTo = useCallback((time: number) => {
    const clamped = Math.max(0, time);

    if (stateRef.current.externalSource === 'youtube') {
      YouTubeController.seekTo(clamped);
    } else {
      audioEngineRef.current?.setCurrentTime(clamped);
    }

    setState((prev) => ({ ...prev, currentTime: clamped }));
  }, []);

  // ---------------------------------------------------------------------
  // Track loading
  // ---------------------------------------------------------------------
  const loadTrack = useCallback(async (track: Track) => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      currentTrack: track,
      externalSource: 'none',
      currentTime: 0,
      duration: track.duration || 0,
    }));

    try {
      await engine.loadAudio(track.src);
      applyEngineState();

      const info = engine.getInfo();
      const duration = engine.getDuration();

      setState((prev) => {
        const playlistIndex = prev.playlist.findIndex((item) => item.id === track.id);
        return {
          ...prev,
          isLoading: false,
          duration: duration || prev.duration,
          audioInfo: info,
          currentTrackIndex: playlistIndex >= 0 ? playlistIndex : prev.currentTrackIndex,
        };
      });

      MediaSessionService.updateMetadata({
        id: track.id,
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        duration: duration || track.duration || 0,
      });

      // Start playing as soon as the track is ready.
      play();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The track could not be loaded.';
      setState((prev) => ({ ...prev, isLoading: false, isPlaying: false, error: message }));
    }
  }, [applyEngineState, play]);

  const loadYouTube = useCallback(async (url: string, meta?: Partial<Track>, containerId?: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      await YouTubeController.load(containerId ?? YT_PLAYER_CONTAINER_ID, url);

      const track: Track = {
        id: `yt-${YouTubeController.parseVideoId(url) ?? Date.now()}`,
        title: meta?.title || 'YouTube Video',
        artist: meta?.artist || 'YouTube',
        duration: 0,
        src: url,
        artwork: meta?.artwork,
        source: 'youtube',
      };

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        externalSource: 'youtube',
        isLoading: false,
        isPlaying: true,
        currentTime: 0,
        duration: 0,
      }));

      MediaSessionService.updateMetadata({
        id: track.id,
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        duration: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The YouTube video could not be loaded.';
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
    }
  }, []);

  /** Plays a track, routing YouTube entries to the IFrame player. */
  const playTrack = useCallback(async (track: Track) => {
    const isYouTube = track.source === 'youtube' || (typeof track.src === 'string' && YouTubeController.isYouTubeUrl(track.src));

    if (isYouTube && typeof track.src === 'string') {
      await loadYouTube(track.src, {
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
      });
    } else {
      await loadTrack(track);
    }
  }, [loadTrack, loadYouTube]);

  // ---------------------------------------------------------------------
  // Playlist navigation
  // ---------------------------------------------------------------------
  const nextTrack = useCallback(() => {
    const current = stateRef.current;
    const { playlist, currentTrackIndex, repeatMode, isShuffled } = current;
    if (playlist.length === 0) return;

    let nextIndex = -1;

    if (isShuffled && shuffleOrderRef.current.length > 0) {
      const order = shuffleOrderRef.current;
      const position = order.indexOf(currentTrackIndex);
      if (position >= 0 && position + 1 < order.length) {
        nextIndex = order[position + 1];
      } else if (repeatMode === 'all') {
        nextIndex = order[0];
      }
    } else {
      nextIndex = currentTrackIndex + 1;
      if (nextIndex >= playlist.length) {
        nextIndex = repeatMode === 'all' ? 0 : -1;
      }
    }

    if (nextIndex < 0 || !playlist[nextIndex]) {
      setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
      return;
    }

    setState((prev) => ({ ...prev, currentTrackIndex: nextIndex }));
    playTrack(playlist[nextIndex]);
  }, [playTrack]);

  const previousTrack = useCallback(() => {
    const current = stateRef.current;
    const { playlist, currentTrackIndex, repeatMode, isShuffled } = current;
    if (playlist.length === 0) return;

    let previousIndex = -1;

    if (isShuffled && shuffleOrderRef.current.length > 0) {
      const order = shuffleOrderRef.current;
      const position = order.indexOf(currentTrackIndex);
      if (position > 0) {
        previousIndex = order[position - 1];
      } else if (repeatMode === 'all') {
        previousIndex = order[order.length - 1];
      } else {
        previousIndex = order[0] ?? -1;
      }
    } else {
      previousIndex = currentTrackIndex - 1;
      if (previousIndex < 0) {
        previousIndex = repeatMode === 'all' ? playlist.length - 1 : 0;
      }
    }

    if (previousIndex < 0 || !playlist[previousIndex]) {
      setState((prev) => ({ ...prev, isPlaying: false }));
      return;
    }

    setState((prev) => ({ ...prev, currentTrackIndex: previousIndex }));
    playTrack(playlist[previousIndex]);
  }, [playTrack]);

  const playTrackAtIndex = useCallback((index: number) => {
    const { playlist } = stateRef.current;
    if (index < 0 || index >= playlist.length) return;

    setState((prev) => ({ ...prev, currentTrackIndex: index }));
    playTrack(playlist[index]);
  }, [playTrack]);

  // ---------------------------------------------------------------------
  // Media Session - handlers are installed once and read the latest state
  // ---------------------------------------------------------------------
  useEffect(() => {
    MediaSessionService.setupHandlers({
      onPlay: () => {
        if (!stateRef.current.isPlaying) play();
      },
      onPause: () => pause(),
      onNextTrack: () => nextTrack(),
      onPreviousTrack: () => previousTrack(),
      onSeekTo: (time) => seekTo(time),
      onSeekBy: (delta) => seekTo(stateRef.current.currentTime + delta),
    });

    return () => MediaSessionService.clearSession();
  }, [nextTrack, pause, play, previousTrack, seekTo]);

  // ---------------------------------------------------------------------
  // Auto advance when a track finishes
  // ---------------------------------------------------------------------
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    engine.setEndedHandler(() => {
      const current = stateRef.current;

      if (current.repeatMode === 'one' && current.currentTrack) {
        seekTo(0);
        play();
        return;
      }

      nextTrack();
    });

    return () => engine.setEndedHandler(null);
  }, [nextTrack, play, seekTo]);

  // ---------------------------------------------------------------------
  // Time synchronisation (throttled to ~10fps to avoid re-rendering at 60fps)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!state.isPlaying && state.externalSource !== 'youtube') return;

    let frame = 0;
    let lastUpdate = 0;

    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= 100) {
        lastUpdate = timestamp;

        if (stateRef.current.externalSource === 'youtube') {
          const yt = YouTubeController.getState();
          setState((prev) => ({
            ...prev,
            currentTime: yt.currentTime,
            duration: yt.duration,
            isPlaying: yt.playing,
            error: yt.error ?? prev.error,
          }));
          MediaSessionService.updatePosition(yt.currentTime, yt.duration);
        } else {
          const engine = audioEngineRef.current;
          if (engine) {
            const currentTime = engine.getCurrentTime();
            const duration = engine.getDuration();
            setState((prev) => ({
              ...prev,
              currentTime,
              duration: duration || prev.duration,
            }));
            MediaSessionService.updatePosition(currentTime, duration);
          }
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.isPlaying, state.externalSource]);

  // ---------------------------------------------------------------------
  // Equalizer / effects
  // ---------------------------------------------------------------------
  const setEqualizerBand = useCallback((index: number, gain: number) => {
    audioEngineRef.current?.setEqualizerBand(index, gain);
    setState((prev) => ({
      ...prev,
      equalizerPreset: 'custom',
      equalizerBands: prev.equalizerBands.map((band, i) => (i === index ? gain : band)),
    }));
  }, []);

  const setEqualizerPreset = useCallback((preset: string) => {
    const gains = equalizerPresets[preset];
    if (!gains) return;

    audioEngineRef.current?.setAllEqualizerBands(gains);
    setState((prev) => ({ ...prev, equalizerPreset: preset, equalizerBands: [...gains] }));
  }, []);

  const setMode = useCallback((mode: PlayMode) => {
    const preset = MODE_PRESET[mode] ?? 'flat';
    const gains = equalizerPresets[preset] ?? equalizerPresets.flat;

    audioEngineRef.current?.setAllEqualizerBands(gains);
    setState((prev) => ({
      ...prev,
      mode,
      equalizerPreset: preset,
      equalizerBands: [...gains],
    }));
  }, []);

  const updateEffects = useCallback((newEffects: Partial<AudioEffects>) => {
    const updated = { ...stateRef.current.effects, ...newEffects };
    setState((prev) => ({ ...prev, effects: updated }));

    const engine = audioEngineRef.current;
    if (!engine) return;

    if (newEffects.reverb) engine.setReverbSettings(updated.reverb);
    if (newEffects.chorus) engine.setChorusSettings(updated.chorus);
    if (newEffects.compressor) engine.setCompressorSettings(updated.compressor);
    if (newEffects.distortion) {
      engine.setDistortionAmount(updated.distortion.amount);
      engine.setDistortionOversample(updated.distortion.oversample);
    }
  }, []);

  // ---------------------------------------------------------------------
  // Playlist management
  // ---------------------------------------------------------------------
  const addToPlaylist = useCallback((track: Track) => {
    setState((prev) => {
      const existingIds = new Set(prev.playlist.map((t) => t.id));
      let id = track.id || `track-${Date.now()}`;
      if (existingIds.has(id)) {
        const base = id;
        let counter = 2;
        while (existingIds.has(`${base}-${counter}`)) counter++;
        id = `${base}-${counter}`;
      }

      const item: Track = { ...track, id };
      const playlist = [...prev.playlist, item];

      if (prev.isShuffled) {
        shuffleOrderRef.current = [...shuffleOrderRef.current, playlist.length - 1];
      }

      return { ...prev, playlist };
    });
  }, []);

  const removeFromPlaylist = useCallback((trackId: string) => {
    setState((prev) => {
      const removedIndex = prev.playlist.findIndex((track) => track.id === trackId);
      const playlist = prev.playlist.filter((track) => track.id !== trackId);

      if (prev.isShuffled) {
        shuffleOrderRef.current = shuffleOrderRef.current
          .filter((index) => index !== removedIndex)
          .map((index) => (index > removedIndex ? index - 1 : index));
      }

      let currentTrackIndex = prev.currentTrackIndex;
      if (removedIndex >= 0) {
        if (removedIndex < currentTrackIndex) {
          currentTrackIndex -= 1;
        } else if (removedIndex === currentTrackIndex) {
          currentTrackIndex = -1;
        }
      }

      return { ...prev, playlist, currentTrackIndex };
    });
  }, []);

  const reorderPlaylist = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const playlist = [...prev.playlist];
      if (fromIndex < 0 || fromIndex >= playlist.length) return prev;
      if (toIndex < 0 || toIndex >= playlist.length) return prev;

      const [moved] = playlist.splice(fromIndex, 1);
      playlist.splice(toIndex, 0, moved);

      // Keep the shuffle order pointing at the same tracks after a manual reorder.
      if (prev.isShuffled) {
        const order = shuffleOrderRef.current.map((index) => {
          if (index === fromIndex) return toIndex;
          if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
          if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
          return index;
        });
        shuffleOrderRef.current = order;
      }

      let currentTrackIndex = prev.currentTrackIndex;
      if (currentTrackIndex === fromIndex) {
        currentTrackIndex = toIndex;
      } else if (fromIndex < toIndex && currentTrackIndex > fromIndex && currentTrackIndex <= toIndex) {
        currentTrackIndex -= 1;
      } else if (fromIndex > toIndex && currentTrackIndex >= toIndex && currentTrackIndex < fromIndex) {
        currentTrackIndex += 1;
      }

      return { ...prev, playlist, currentTrackIndex };
    });
  }, []);

  const clearPlaylist = useCallback(() => {
    stop();
    shuffleOrderRef.current = [];
    setState((prev) => ({
      ...prev,
      playlist: [],
      currentTrackIndex: -1,
      currentTrack: null,
      duration: 0,
      currentTime: 0,
    }));
  }, [stop]);

  // ---------------------------------------------------------------------
  // Shuffle / repeat
  // ---------------------------------------------------------------------
  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const isShuffled = !prev.isShuffled;
      shuffleOrderRef.current = isShuffled
        ? buildShuffleOrder(prev.playlist, prev.currentTrack?.id ?? null)
        : [];
      return { ...prev, isShuffled };
    });
  }, []);

  const toggleRepeat = useCallback(() => {
    setState((prev) => ({
      ...prev,
      repeatMode: prev.repeatMode === 'none' ? 'all' : prev.repeatMode === 'all' ? 'one' : 'none',
    }));
  }, []);

  // ---------------------------------------------------------------------
  // Data access
  // ---------------------------------------------------------------------
  const getFrequencyData = useCallback((): Uint8Array => {
    return audioEngineRef.current?.getFrequencyData() ?? new Uint8Array(0);
  }, []);

  const getTimeDomainData = useCallback((): Uint8Array => {
    return audioEngineRef.current?.getTimeDomainData() ?? new Uint8Array(0);
  }, []);

  const dismissError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const contextValue: AudioPlayerContextType = {
    ...state,
    loadTrack,
    loadYouTube,
    play,
    pause,
    stop,
    setVolume,
    seekTo,
    nextTrack,
    previousTrack,
    setMode,
    setEqualizerBand,
    setEqualizerPreset,
    updateEffects,
    toggleShuffle,
    toggleRepeat,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    playTrackAtIndex,
    clearPlaylist,
    dismissError,
    getFrequencyData,
    getTimeDomainData,
  };

  return <AudioPlayerContext.Provider value={contextValue}>{children}</AudioPlayerContext.Provider>;
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};
