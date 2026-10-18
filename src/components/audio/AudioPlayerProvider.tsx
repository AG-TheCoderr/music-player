import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AudioEngine, AudioEffects } from './AudioEngine';
import { MediaSessionService } from '@/services/mediaSession';
import { YouTubeController, YT_PLAYER_CONTAINER_ID } from '@/services/youtubeController';
import { loadPreferences, savePreferences } from '@/services/preferences';
import {
  AudioPlayerActions,
  AudioPlayerState,
  ExternalSource,
  PlayMode,
  PlayerStore,
  RepeatMode,
  Track,
} from './playerStore';
import { PlayerActionsContext, PlayerStoreContext } from './playerContext';

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

const equalizerPresets: Record<string, number[]> = {
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
  // Guards the YouTube auto advance so a finished video is only handled once.
  const ytEndedHandledRef = useRef(false);

  const storeRef = useRef<PlayerStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new PlayerStore(initialState);
  }
  const store = storeRef.current;

  // The provider only needs these two flags. Subscribing to the whole state would re-render
  // the provider ten times a second while a track plays.
  const isPlaying = useSyncExternalStore(
    store.subscribe,
    () => store.getState().isPlaying,
    () => store.getState().isPlaying
  );
  const externalSource = useSyncExternalStore(
    store.subscribe,
    () => store.getState().externalSource,
    () => store.getState().externalSource
  );

  // ---------------------------------------------------------------------
  // Engine lifecycle
  // ---------------------------------------------------------------------
  useEffect(() => {
    const engine = new AudioEngine();
    audioEngineRef.current = engine;

    engine.setErrorHandler((error) => {
      store.setState((prev) => ({ ...prev, isPlaying: false, error: error.message }));
    });

    return () => {
      engine.setEndedHandler(null);
      engine.setErrorHandler(null);
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, [store]);

  // ---------------------------------------------------------------------
  // Restore the saved preferences
  // ---------------------------------------------------------------------
  useEffect(() => {
    const preferences = loadPreferences();
    if (!preferences) return;

    store.setState((prev) => ({
      ...prev,
      ...(preferences.volume !== undefined ? { volume: preferences.volume } : {}),
      ...(preferences.equalizerBands ? { equalizerBands: preferences.equalizerBands } : {}),
      ...(preferences.equalizerPreset ? { equalizerPreset: preferences.equalizerPreset } : {}),
      ...(preferences.effects ? { effects: preferences.effects } : {}),
      ...(preferences.mode ? { mode: preferences.mode } : {}),
      ...(preferences.isShuffled !== undefined ? { isShuffled: preferences.isShuffled } : {}),
      ...(preferences.repeatMode ? { repeatMode: preferences.repeatMode } : {}),
      ...(preferences.playlist ? { playlist: preferences.playlist } : {}),
    }));

    const engine = audioEngineRef.current;
    if (!engine) return;

    if (preferences.volume !== undefined) engine.setVolume(preferences.volume);
    if (preferences.equalizerBands) engine.setAllEqualizerBands(preferences.equalizerBands);
    if (preferences.effects) {
      engine.setReverbSettings(preferences.effects.reverb);
      engine.setChorusSettings(preferences.effects.chorus);
      engine.setCompressorSettings(preferences.effects.compressor);
      engine.setDistortionAmount(preferences.effects.distortion.amount);
      engine.setDistortionOversample(preferences.effects.distortion.oversample);
    }
  }, [store]);

  // ---------------------------------------------------------------------
  // Persist the preferences (debounced)
  // ---------------------------------------------------------------------
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = store.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const current = store.getState();
        savePreferences({
          volume: current.volume,
          equalizerBands: current.equalizerBands,
          equalizerPreset: current.equalizerPreset,
          effects: current.effects,
          mode: current.mode,
          isShuffled: current.isShuffled,
          repeatMode: current.repeatMode,
          // Local files cannot be serialized - only keep remote sources.
          playlist: current.playlist.filter((track) => typeof track.src === 'string'),
        });
      }, 800);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);

  // ---------------------------------------------------------------------
  // Playback helpers
  // ---------------------------------------------------------------------
  const applyEngineState = useCallback(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    const current = store.getState();
    engine.setVolume(current.volume);
    engine.setAllEqualizerBands(current.equalizerBands);
    engine.setReverbSettings(current.effects.reverb);
    engine.setChorusSettings(current.effects.chorus);
    engine.setCompressorSettings(current.effects.compressor);
    engine.setDistortionAmount(current.effects.distortion.amount);
    engine.setDistortionOversample(current.effects.distortion.oversample);
  }, [store]);

  const play = useCallback(() => {
    const current = store.getState();

    if (current.externalSource === 'youtube') {
      YouTubeController.play();
      store.setState((prev) => ({ ...prev, isPlaying: true, error: null }));
      MediaSessionService.updatePlaybackState('playing');
      return;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.play();
      store.setState((prev) => ({ ...prev, isPlaying: true, error: null }));
      MediaSessionService.updatePlaybackState('playing');
    }
  }, [store]);

  const pause = useCallback(() => {
    const current = store.getState();

    if (current.externalSource === 'youtube') {
      YouTubeController.pause();
      store.setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
      return;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.pause();
      store.setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
    }
  }, [store]);

  const stop = useCallback(() => {
    if (store.getState().externalSource === 'youtube') {
      YouTubeController.stop();
      store.setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      return;
    }

    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      store.setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, [store]);

  const setVolume = useCallback(
    (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));

      if (store.getState().externalSource === 'youtube') {
        YouTubeController.setVolume(clamped);
      } else {
        audioEngineRef.current?.setVolume(clamped);
      }

      store.setState((prev) => ({ ...prev, volume: clamped }));
    },
    [store]
  );

  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(0, time);

      if (store.getState().externalSource === 'youtube') {
        YouTubeController.seekTo(clamped);
      } else {
        audioEngineRef.current?.setCurrentTime(clamped);
      }

      store.setState((prev) => ({ ...prev, currentTime: clamped }));
    },
    [store]
  );

  // ---------------------------------------------------------------------
  // Track loading
  // ---------------------------------------------------------------------
  const loadTrack = useCallback(
    async (track: Track) => {
      const engine = audioEngineRef.current;
      if (!engine) return;

      store.setState((prev) => ({
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

        store.setState((prev) => {
          const playlistIndex = prev.playlist.findIndex((item) => item.id === track.id);

          // The real duration is only known once the file has been decoded - write it back so
          // the playlist does not keep showing "0:00".
          const playlist =
            duration && playlistIndex >= 0 && prev.playlist[playlistIndex].duration !== duration
              ? prev.playlist.map((item, index) => (index === playlistIndex ? { ...item, duration } : item))
              : prev.playlist;

          return {
            ...prev,
            isLoading: false,
            duration: duration || prev.duration,
            audioInfo: info,
            playlist,
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
        store.setState((prev) => ({ ...prev, isLoading: false, isPlaying: false, error: message }));
      }
    },
    [applyEngineState, play, store]
  );

  const loadYouTube = useCallback(
    async (url: string, meta?: Partial<Track>, containerId?: string) => {
      store.setState((prev) => ({ ...prev, isLoading: true, error: null }));

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

        store.setState((prev) => ({
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
        store.setState((prev) => ({ ...prev, isLoading: false, error: message }));
      }
    },
    [store]
  );

  /** Plays a track, routing YouTube entries to the IFrame player. */
  const playTrack = useCallback(
    async (track: Track) => {
      const isYouTube =
        track.source === 'youtube' ||
        (typeof track.src === 'string' && YouTubeController.isYouTubeUrl(track.src));

      if (isYouTube && typeof track.src === 'string') {
        await loadYouTube(track.src, {
          title: track.title,
          artist: track.artist,
          artwork: track.artwork,
        });
      } else {
        await loadTrack(track);
      }
    },
    [loadTrack, loadYouTube]
  );

  // ---------------------------------------------------------------------
  // Playlist navigation
  // ---------------------------------------------------------------------
  const nextTrack = useCallback(() => {
    const { playlist, currentTrackIndex, repeatMode, isShuffled } = store.getState();
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
      store.setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
      return;
    }

    store.setState((prev) => ({ ...prev, currentTrackIndex: nextIndex }));
    playTrack(playlist[nextIndex]);
  }, [playTrack, store]);

  const previousTrack = useCallback(() => {
    const { playlist, currentTrackIndex, repeatMode, isShuffled } = store.getState();
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
      store.setState((prev) => ({ ...prev, isPlaying: false }));
      return;
    }

    store.setState((prev) => ({ ...prev, currentTrackIndex: previousIndex }));
    playTrack(playlist[previousIndex]);
  }, [playTrack, store]);

  const playTrackAtIndex = useCallback(
    (index: number) => {
      const { playlist } = store.getState();
      if (index < 0 || index >= playlist.length) return;

      store.setState((prev) => ({ ...prev, currentTrackIndex: index }));
      playTrack(playlist[index]);
    },
    [playTrack, store]
  );

  // ---------------------------------------------------------------------
  // Media Session - handlers are installed once and read the latest state
  // ---------------------------------------------------------------------
  useEffect(() => {
    MediaSessionService.setupHandlers({
      onPlay: () => {
        if (!store.getState().isPlaying) play();
      },
      onPause: () => pause(),
      onNextTrack: () => nextTrack(),
      onPreviousTrack: () => previousTrack(),
      onSeekTo: (time) => seekTo(time),
      onSeekBy: (delta) => seekTo(store.getState().currentTime + delta),
    });

    return () => MediaSessionService.clearSession();
  }, [nextTrack, pause, play, previousTrack, seekTo, store]);

  // ---------------------------------------------------------------------
  // Auto advance when a track finishes
  // ---------------------------------------------------------------------
  useEffect(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    engine.setEndedHandler(() => {
      const current = store.getState();

      if (current.repeatMode === 'one' && current.currentTrack) {
        seekTo(0);
        play();
        return;
      }

      nextTrack();
    });

    return () => engine.setEndedHandler(null);
  }, [nextTrack, play, seekTo, store]);

  // ---------------------------------------------------------------------
  // Time synchronisation (throttled to ~10fps)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying && externalSource !== 'youtube') return;

    let frame = 0;
    let lastUpdate = 0;

    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= 100) {
        lastUpdate = timestamp;

        if (store.getState().externalSource === 'youtube') {
          const yt = YouTubeController.getState();
          store.setState((prev) => ({
            ...prev,
            currentTime: yt.currentTime,
            duration: yt.duration,
            isPlaying: yt.playing,
            error: yt.error ?? prev.error,
          }));
          MediaSessionService.updatePosition(yt.currentTime, yt.duration);

          // A YouTube video that reached its end advances the playlist, the same way a file
          // that runs out does.
          if (yt.ended) {
            if (!ytEndedHandledRef.current) {
              ytEndedHandledRef.current = true;
              const { repeatMode } = store.getState();
              if (repeatMode === 'one') {
                YouTubeController.seekTo(0);
                play();
              } else {
                nextTrack();
              }
            }
          } else {
            ytEndedHandledRef.current = false;
          }
        } else {
          const engine = audioEngineRef.current;
          if (engine) {
            const currentTime = engine.getCurrentTime();
            const duration = engine.getDuration();
            store.setState((prev) => ({
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
  }, [isPlaying, externalSource, nextTrack, play, store]);

  // ---------------------------------------------------------------------
  // Equalizer / effects
  // ---------------------------------------------------------------------
  const setEqualizerBand = useCallback(
    (index: number, gain: number) => {
      audioEngineRef.current?.setEqualizerBand(index, gain);
      store.setState((prev) => ({
        ...prev,
        equalizerPreset: 'custom',
        equalizerBands: prev.equalizerBands.map((band, i) => (i === index ? gain : band)),
      }));
    },
    [store]
  );

  const setEqualizerPreset = useCallback(
    (preset: string) => {
      const gains = equalizerPresets[preset];
      if (!gains) return;

      audioEngineRef.current?.setAllEqualizerBands(gains);
      store.setState((prev) => ({ ...prev, equalizerPreset: preset, equalizerBands: [...gains] }));
    },
    [store]
  );

  const setMode = useCallback(
    (mode: PlayMode) => {
      const preset = MODE_PRESET[mode] ?? 'flat';
      const gains = equalizerPresets[preset] ?? equalizerPresets.flat;

      audioEngineRef.current?.setAllEqualizerBands(gains);
      store.setState((prev) => ({
        ...prev,
        mode,
        equalizerPreset: preset,
        equalizerBands: [...gains],
      }));
    },
    [store]
  );

  const updateEffects = useCallback(
    (newEffects: Partial<AudioEffects>) => {
      const updated = { ...store.getState().effects, ...newEffects };
      store.setState((prev) => ({ ...prev, effects: updated }));

      const engine = audioEngineRef.current;
      if (!engine) return;

      if (newEffects.reverb) engine.setReverbSettings(updated.reverb);
      if (newEffects.chorus) engine.setChorusSettings(updated.chorus);
      if (newEffects.compressor) engine.setCompressorSettings(updated.compressor);
      if (newEffects.distortion) {
        engine.setDistortionAmount(updated.distortion.amount);
        engine.setDistortionOversample(updated.distortion.oversample);
      }
    },
    [store]
  );

  // ---------------------------------------------------------------------
  // Playlist management
  // ---------------------------------------------------------------------
  const addToPlaylist = useCallback(
    (track: Track) => {
      store.setState((prev) => {
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
    },
    [store]
  );

  const removeFromPlaylist = useCallback(
    (trackId: string) => {
      store.setState((prev) => {
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
    },
    [store]
  );

  const reorderPlaylist = useCallback(
    (fromIndex: number, toIndex: number) => {
      store.setState((prev) => {
        const playlist = [...prev.playlist];
        if (fromIndex < 0 || fromIndex >= playlist.length) return prev;
        if (toIndex < 0 || toIndex >= playlist.length) return prev;

        const [moved] = playlist.splice(fromIndex, 1);
        playlist.splice(toIndex, 0, moved);

        // Keep the shuffle order pointing at the same tracks after a manual reorder.
        if (prev.isShuffled) {
          shuffleOrderRef.current = shuffleOrderRef.current.map((index) => {
            if (index === fromIndex) return toIndex;
            if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return index - 1;
            if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return index + 1;
            return index;
          });
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
    },
    [store]
  );

  const clearPlaylist = useCallback(() => {
    stop();
    shuffleOrderRef.current = [];
    store.setState((prev) => ({
      ...prev,
      playlist: [],
      currentTrackIndex: -1,
      currentTrack: null,
      duration: 0,
      currentTime: 0,
    }));
  }, [stop, store]);

  // ---------------------------------------------------------------------
  // Shuffle / repeat
  // ---------------------------------------------------------------------
  const toggleShuffle = useCallback(() => {
    store.setState((prev) => {
      const isShuffled = !prev.isShuffled;
      shuffleOrderRef.current = isShuffled
        ? buildShuffleOrder(prev.playlist, prev.currentTrack?.id ?? null)
        : [];
      return { ...prev, isShuffled };
    });
  }, [store]);

  const toggleRepeat = useCallback(() => {
    store.setState((prev) => ({
      ...prev,
      repeatMode: prev.repeatMode === 'none' ? 'all' : prev.repeatMode === 'all' ? 'one' : 'none',
    }));
  }, [store]);

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
    store.setState((prev) => ({ ...prev, error: null }));
  }, [store]);

  const actions = useMemo<AudioPlayerActions>(
    () => ({
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
    }),
    [
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
    ]
  );

  return (
    <PlayerStoreContext.Provider value={store}>
      <PlayerActionsContext.Provider value={actions}>{children}</PlayerActionsContext.Provider>
    </PlayerStoreContext.Provider>
  );
};
