import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { AudioEngine, AudioEffects } from './AudioEngine';
import { MediaSessionService } from '@/services/mediaSession';
import { loadPreferences, savePreferences } from '@/services/preferences';
import {
  EQ_BAND_COUNT,
  EQ_DEFAULT_Q,
  EQ_DEFAULT_RANGE,
  EQ_PRESETS,
  MODE_PRESET,
  clampBandGain,
  clampQ,
} from './equalizer';
import {
  AudioPlayerActions,
  AudioPlayerState,
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
  equalizerBands: [...EQ_PRESETS.flat],
  equalizerPreset: 'flat',
  equalizerRange: EQ_DEFAULT_RANGE,
  equalizerWidth: EQ_DEFAULT_Q,
  effects: initialEffects,
  isShuffled: false,
  repeatMode: 'none',
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

  const storeRef = useRef<PlayerStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new PlayerStore(initialState);
  }
  const store = storeRef.current;

  // The provider only needs this flag. Subscribing to the whole state would re-render the
  // provider on every playback update.
  const isPlaying = useSyncExternalStore(
    store.subscribe,
    () => store.getState().isPlaying,
    () => store.getState().isPlaying
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
  // Restore saved preferences
  // ---------------------------------------------------------------------
  useEffect(() => {
    const preferences = loadPreferences();
    if (!preferences) return;

    store.setState((prev) => ({
      ...prev,
      ...(preferences.volume !== undefined ? { volume: preferences.volume } : {}),
      ...(preferences.equalizerBands ? { equalizerBands: preferences.equalizerBands } : {}),
      ...(preferences.equalizerPreset ? { equalizerPreset: preferences.equalizerPreset } : {}),
      ...(preferences.equalizerRange !== undefined ? { equalizerRange: preferences.equalizerRange } : {}),
      ...(preferences.equalizerWidth !== undefined ? { equalizerWidth: preferences.equalizerWidth } : {}),
      ...(preferences.effects ? { effects: preferences.effects } : {}),
      ...(preferences.mode ? { mode: preferences.mode } : {}),
      ...(preferences.isShuffled !== undefined ? { isShuffled: preferences.isShuffled } : {}),
      ...(preferences.repeatMode ? { repeatMode: preferences.repeatMode } : {}),
      // Playlists saved before YouTube support was removed may still hold its entries.
      ...(preferences.playlist
        ? { playlist: preferences.playlist.filter((track) => !track.id.startsWith('yt-')) }
        : {}),
    }));

    const engine = audioEngineRef.current;
    if (!engine) return;

    if (preferences.volume !== undefined) engine.setVolume(preferences.volume);
    if (preferences.equalizerBands) engine.setAllEqualizerBands(preferences.equalizerBands);
    if (preferences.equalizerWidth !== undefined) engine.setEqualizerWidth(preferences.equalizerWidth);
    if (preferences.effects) {
      engine.setReverbSettings(preferences.effects.reverb);
      engine.setChorusSettings(preferences.effects.chorus);
      engine.setCompressorSettings(preferences.effects.compressor);
      engine.setDistortionAmount(preferences.effects.distortion.amount);
      engine.setDistortionOversample(preferences.effects.distortion.oversample);
    }
  }, [store]);

  // ---------------------------------------------------------------------
  // Persist preferences (debounced)
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
          equalizerRange: current.equalizerRange,
          equalizerWidth: current.equalizerWidth,
          effects: current.effects,
          mode: current.mode,
          isShuffled: current.isShuffled,
          repeatMode: current.repeatMode,
          // Local files cannot be serialized, so only remote sources are kept.
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
  // Playback
  // ---------------------------------------------------------------------
  const applyEngineState = useCallback(() => {
    const engine = audioEngineRef.current;
    if (!engine) return;

    const current = store.getState();
    engine.setVolume(current.volume);
    engine.setAllEqualizerBands(current.equalizerBands);
    engine.setEqualizerWidth(current.equalizerWidth);
    engine.setReverbSettings(current.effects.reverb);
    engine.setChorusSettings(current.effects.chorus);
    engine.setCompressorSettings(current.effects.compressor);
    engine.setDistortionAmount(current.effects.distortion.amount);
    engine.setDistortionOversample(current.effects.distortion.oversample);
  }, [store]);

  const play = useCallback(() => {
    // Without a loaded track there is nothing to play, so the playing state must not change.
    if (!store.getState().currentTrack) return;

    if (audioEngineRef.current) {
      audioEngineRef.current.play();
      store.setState((prev) => ({ ...prev, isPlaying: true, error: null }));
      MediaSessionService.updatePlaybackState('playing');
    }
  }, [store]);

  const pause = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.pause();
      store.setState((prev) => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
    }
  }, [store]);

  const stop = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      store.setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, [store]);

  const setVolume = useCallback(
    (volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      audioEngineRef.current?.setVolume(clamped);
      store.setState((prev) => ({ ...prev, volume: clamped }));
    },
    [store]
  );

  const seekTo = useCallback(
    (time: number) => {
      const clamped = Math.max(0, time);
      audioEngineRef.current?.setCurrentTime(clamped);
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

          // The real duration is only known after decoding. Write it back so the playlist does
          // not keep showing 0:00.
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

        play();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The track could not be loaded.';
        store.setState((prev) => ({ ...prev, isLoading: false, isPlaying: false, error: message }));
      }
    },
    [applyEngineState, play, store]
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
    loadTrack(playlist[nextIndex]);
  }, [loadTrack, store]);

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
    loadTrack(playlist[previousIndex]);
  }, [loadTrack, store]);

  const playTrackAtIndex = useCallback(
    (index: number) => {
      const { playlist } = store.getState();
      if (index < 0 || index >= playlist.length) return;

      store.setState((prev) => ({ ...prev, currentTrackIndex: index }));
      loadTrack(playlist[index]);
    },
    [loadTrack, store]
  );

  // ---------------------------------------------------------------------
  // Media Session. Handlers are installed once and read the latest state.
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
  // Auto advance when a track ends
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
  // Time sync (about 10 updates a second, only while playing)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!isPlaying) return;

    let frame = 0;
    let lastUpdate = 0;

    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= 100) {
        lastUpdate = timestamp;

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

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, store]);

  // ---------------------------------------------------------------------
  // Equalizer
  // ---------------------------------------------------------------------
  const setEqualizerBand = useCallback(
    (index: number, gain: number) => {
      if (index < 0 || index >= EQ_BAND_COUNT) return;

      const range = store.getState().equalizerRange;
      const clamped = clampBandGain(gain, range);
      audioEngineRef.current?.setEqualizerBand(index, clamped);

      store.setState((prev) => ({
        ...prev,
        equalizerPreset: 'custom',
        equalizerBands: prev.equalizerBands.map((band, i) => (i === index ? clamped : band)),
      }));
    },
    [store]
  );

  const applyBands = useCallback(
    (preset: string, gains: number[]) => {
      const range = store.getState().equalizerRange;
      const bounded = gains.map((gain) => clampBandGain(gain, range));
      audioEngineRef.current?.setAllEqualizerBands(bounded);
      store.setState((prev) => ({ ...prev, equalizerPreset: preset, equalizerBands: bounded }));
    },
    [store]
  );

  const setEqualizerPreset = useCallback(
    (preset: string) => {
      const gains = EQ_PRESETS[preset];
      if (!gains) return;
      applyBands(preset, gains);
    },
    [applyBands]
  );

  const setEqualizerRange = useCallback(
    (range: number) => {
      // Shrinking the range pulls any band that is outside it back inside.
      store.setState((prev) => {
        const bands = prev.equalizerBands.map((gain) => clampBandGain(gain, range));
        audioEngineRef.current?.setAllEqualizerBands(bands);
        return { ...prev, equalizerRange: range, equalizerBands: bands };
      });
    },
    [store]
  );

  const setEqualizerWidth = useCallback(
    (width: number) => {
      const q = clampQ(width);
      audioEngineRef.current?.setEqualizerWidth(q);
      store.setState((prev) => ({ ...prev, equalizerWidth: q }));
    },
    [store]
  );

  const setMode = useCallback(
    (mode: PlayMode) => {
      const preset = MODE_PRESET[mode] ?? 'flat';
      const gains = EQ_PRESETS[preset] ?? EQ_PRESETS.flat;
      applyBands(preset, gains);
      store.setState((prev) => ({ ...prev, mode }));
    },
    [applyBands, store]
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
  // Playlist
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
  // Shuffle and repeat
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
      repeatMode: nextRepeatMode(prev.repeatMode),
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
      setEqualizerRange,
      setEqualizerWidth,
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
      setEqualizerRange,
      setEqualizerWidth,
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

function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === 'none') return 'all';
  if (mode === 'all') return 'one';
  return 'none';
}
