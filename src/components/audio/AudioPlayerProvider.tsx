import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AudioEngine, AudioEffects } from './AudioEngine';
import { MediaSessionService } from '@/services/mediaSession';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  src: string | File;
  artwork?: string;
}

interface AudioPlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  playlist: Track[];
  playlistId: string | null;
  currentTrackIndex: number;
  mode: 'normal' | 'vocal-enhance' | 'instrument-focus' | 'bass-boost';
  equalizerBands: number[];
  effects: AudioEffects;
  isShuffled: boolean;
  repeatMode: 'none' | 'one' | 'all';
}

interface AudioPlayerActions {
  loadTrack: (track: Track) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seekTo: (time: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  setMode: (mode: AudioPlayerState['mode']) => void;
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
  getFrequencyData: () => Uint8Array;
  getTimeDomainData: () => Uint8Array;
}

type AudioPlayerContextType = AudioPlayerState & AudioPlayerActions;

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

const initialEffects: AudioEffects = {
  reverb: {
    roomSize: 0.3,
    damping: 0.5,
    wetLevel: 0.1,
    dryLevel: 0.9
  },
  chorus: {
    rate: 1.5,
    depth: 0.3,
    feedback: 0.2,
    wetLevel: 0.3
  },
  distortion: {
    amount: 0,
    oversample: '4x'
  },
  compressor: {
    threshold: -24,
    knee: 30,
    ratio: 12,
    attack: 0.003,
    release: 0.25
  }
};

const equalizerPresets = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rock: [3, 2, -1, -2, -1, 1, 3, 4, 4, 3],
  pop: [1, 2, 3, 2, 0, -1, -1, 1, 2, 3],
  jazz: [2, 1, 0, 1, 2, 2, 1, 0, 1, 2],
  classical: [3, 2, 0, 0, 0, 0, -1, -1, -1, -2],
  electronic: [4, 3, 1, 0, -1, 1, 2, 3, 4, 4],
  'bass-boost': [6, 4, 2, 1, 0, 0, 0, 0, 0, 0],
  'vocal-enhance': [0, 0, 0, 2, 4, 4, 2, 1, 0, 0]
};

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const animationFrameRef = useRef<number>();
  const { user } = useAuth();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    playlist: [],
    playlistId: null,
    currentTrackIndex: -1,
    mode: 'normal',
    equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    effects: initialEffects,
    isShuffled: false,
    repeatMode: 'none'
  });

  const loadTrackRef = useRef<(track: Track) => Promise<void>>();
  const nextTrackRef = useRef<() => void>();
  const previousTrackRef = useRef<() => void>();

  const play = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
      MediaSessionService.updatePlaybackState('playing');
    }
  }, []);

  const pause = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.setCurrentTime(time);
      setState(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  const loadTrack = useCallback(async (track: Track) => {
    if (!audioEngineRef.current) return;

    setState(prev => ({ ...prev, isLoading: true, currentTrack: track }));

    try {
      await audioEngineRef.current.loadAudio(track.src);
      audioEngineRef.current.setVolume(state.volume);
      
      state.equalizerBands.forEach((gain, index) => {
        audioEngineRef.current!.setEqualizerBand(index, gain);
      });

      audioEngineRef.current.setReverbSettings(state.effects.reverb);
      audioEngineRef.current.setCompressorSettings(state.effects.compressor);
      audioEngineRef.current.setDistortionAmount(state.effects.distortion.amount);

      const audioElement = audioEngineRef.current.getAudioElement();
      if (audioElement) {
        audioElement.addEventListener('loadedmetadata', () => {
          setState(prev => ({
            ...prev,
            duration: audioElement.duration,
            isLoading: false
          }));
        });
      }

      MediaSessionService.setupMediaSession(track, {
        onPlay: play,
        onPause: pause,
        onNextTrack: () => nextTrackRef.current?.(),
        onPreviousTrack: () => previousTrackRef.current?.(),
        onSeek: (time) => {
          if (time < 0) {
            seekTo(Math.max(0, state.currentTime + time));
          } else if (time > state.duration) {
            seekTo(time);
          } else {
            seekTo(time > state.currentTime + 30 ? time : state.currentTime + time);
          }
        }
      });

      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Error loading track:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.volume, state.equalizerBands, state.effects, play, pause, seekTo, state.currentTime, state.duration]);

  const nextTrack = useCallback(() => {
    if (state.playlist.length === 0) return;

    let nextIndex = state.currentTrackIndex + 1;
    if (nextIndex >= state.playlist.length) {
      nextIndex = state.repeatMode === 'all' ? 0 : state.playlist.length - 1;
    }

    setState(prev => ({ ...prev, currentTrackIndex: nextIndex }));
    loadTrack(state.playlist[nextIndex]);
  }, [state.playlist, state.currentTrackIndex, state.repeatMode, loadTrack]);

  const previousTrack = useCallback(() => {
    if (state.playlist.length === 0) return;

    let prevIndex = state.currentTrackIndex - 1;
    if (prevIndex < 0) {
      prevIndex = state.repeatMode === 'all' ? state.playlist.length - 1 : 0;
    }

    setState(prev => ({ ...prev, currentTrackIndex: prevIndex }));
    loadTrack(state.playlist[prevIndex]);
  }, [state.playlist, state.currentTrackIndex, state.repeatMode, loadTrack]);

  useEffect(() => {
    loadTrackRef.current = loadTrack;
    nextTrackRef.current = nextTrack;
    previousTrackRef.current = previousTrack;
  });

  const updateTime = useCallback(() => {
    if (audioEngineRef.current && state.isPlaying) {
      const currentTime = audioEngineRef.current.getCurrentTime();
      const duration = audioEngineRef.current.getDuration();

      setState(prev => ({
        ...prev,
        currentTime,
        duration: duration || prev.duration
      }));

      MediaSessionService.updatePosition(currentTime, duration || 0);

      if (duration > 0 && currentTime >= duration - 0.1) {
        if (state.repeatMode === 'one') {
          audioEngineRef.current.setCurrentTime(0);
          audioEngineRef.current.play();
        } else {
          nextTrack();
        }
      }
    }

    if (state.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [state.isPlaying, state.repeatMode, nextTrack]);

  const stop = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, []);

  const clearPlaylist = useCallback(() => {
    stop();
    setState(prev => ({
      ...prev,
      playlist: [],
      playlistId: null,
      currentTrackIndex: -1,
      currentTrack: null,
      duration: 0,
      currentTime: 0,
    }));
  }, [stop]);

  useEffect(() => {
    audioEngineRef.current = new AudioEngine();
    return () => {
      if (audioEngineRef.current) {
        audioEngineRef.current.dispose();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (state.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.isPlaying, updateTime]);

  useEffect(() => {
    if (user) {
      const fetchPlaylist = async () => {
        const { data, error } = await supabase
          .from('playlists')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (data) {
          console.log('Fetched playlist:', data);
          setState(prev => ({ ...prev, playlist: data.tracks || [], playlistId: data.id }));
        } else if (error && error.code !== 'PGRST116') {
          console.error('Error fetching playlist:', error);
        }
      };
      fetchPlaylist();
    } else {
      clearPlaylist();
    }
  }, [user, clearPlaylist]);

  useEffect(() => {
    if (user && !state.isLoading) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(async () => {
        const serializablePlaylist = state.playlist.filter(track => typeof track.src === 'string');
        const playlistData = {
          id: state.playlistId,
          user_id: user.id,
          name: 'Default Playlist',
          tracks: serializablePlaylist,
        };

        const { data, error } = await supabase
          .from('playlists')
          .upsert(playlistData)
          .select()
          .single();

        if (error) {
          console.error('Error saving playlist:', error);
        } else if (data) {
          console.log('Saved playlist:', data);
          setState(prev => ({ ...prev, playlistId: data.id }));
        }
      }, 2000);
    }
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [state.playlist, user, state.isLoading, state.playlistId]);

  const setVolume = useCallback((volume: number) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.setVolume(volume);
      setState(prev => ({ ...prev, volume }));
    }
  }, []);

  const setEqualizerBand = useCallback((index: number, gain: number) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.setEqualizerBand(index, gain);
      setState(prev => ({
        ...prev,
        equalizerBands: prev.equalizerBands.map((band, i) => i === index ? gain : band)
      }));
    }
  }, []);

  const setEqualizerPreset = useCallback((preset: string) => {
    if (preset in equalizerPresets && audioEngineRef.current) {
      const gains = equalizerPresets[preset as keyof typeof equalizerPresets];
      audioEngineRef.current.setAllEqualizerBands(gains);
      setState(prev => ({ ...prev, equalizerBands: [...gains] }));
    }
  }, []);

  const setMode = useCallback((mode: AudioPlayerState['mode']) => {
    setState(prev => ({ ...prev, mode }));
    
    let newEQ = [...state.equalizerBands];
    
    switch (mode) {
      case 'vocal-enhance':
        newEQ = equalizerPresets['vocal-enhance'];
        break;
      case 'instrument-focus':
        newEQ = [0, 0, -2, -1, 0, 1, 2, 3, 2, 1];
        break;
      case 'bass-boost':
        newEQ = equalizerPresets['bass-boost'];
        break;
      default:
        newEQ = equalizerPresets.flat;
        break;
    }
    
    setEqualizerPreset('custom');
    newEQ.forEach((gain, index) => {
      setEqualizerBand(index, gain);
    });
  }, [state.equalizerBands, setEqualizerBand, setEqualizerPreset]);

  const updateEffects = useCallback((newEffects: Partial<AudioEffects>) => {
    const updatedEffects = { ...state.effects, ...newEffects };
    setState(prev => ({ ...prev, effects: updatedEffects }));

    if (audioEngineRef.current) {
      if (newEffects.reverb) {
        audioEngineRef.current.setReverbSettings(updatedEffects.reverb);
      }
      if (newEffects.compressor) {
        audioEngineRef.current.setCompressorSettings(updatedEffects.compressor);
      }
      if (newEffects.distortion) {
        audioEngineRef.current.setDistortionAmount(updatedEffects.distortion.amount);
      }
    }
  }, [state.effects]);

  const getFrequencyData = useCallback((): Uint8Array => {
    return audioEngineRef.current?.getFrequencyData() || new Uint8Array(0);
  }, []);

  const getTimeDomainData = useCallback((): Uint8Array => {
    return audioEngineRef.current?.getTimeDomainData() || new Uint8Array(0);
  }, []);

  const toggleShuffle = useCallback(() => {
    setState(prev => ({ ...prev, isShuffled: !prev.isShuffled }));
  }, []);

  const toggleRepeat = useCallback(() => {
    setState(prev => ({
      ...prev,
      repeatMode: prev.repeatMode === 'none' ? 'all' : prev.repeatMode === 'all' ? 'one' : 'none'
    }));
  }, []);

  const addToPlaylist = useCallback((track: Track) => {
    setState(prev => ({
      ...prev,
      playlist: [...prev.playlist, track]
    }));
  }, []);

  const removeFromPlaylist = useCallback((trackId: string) => {
    setState(prev => ({
      ...prev,
      playlist: prev.playlist.filter(track => track.id !== trackId)
    }));
  }, []);

  const reorderPlaylist = useCallback((fromIndex: number, toIndex: number) => {
    setState(prev => {
      const newPlaylist = [...prev.playlist];
      const [movedTrack] = newPlaylist.splice(fromIndex, 1);
      newPlaylist.splice(toIndex, 0, movedTrack);
      return { ...prev, playlist: newPlaylist };
    });
  }, []);

  const playTrackAtIndex = useCallback((index: number) => {
    if (index >= 0 && index < state.playlist.length) {
      setState(prev => ({ ...prev, currentTrackIndex: index }));
      loadTrack(state.playlist[index]);
    }
  }, [state.playlist, loadTrack]);

  const contextValue: AudioPlayerContextType = {
    ...state,
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
    updateEffects,
    toggleShuffle,
    toggleRepeat,
    addToPlaylist,
    removeFromPlaylist,
    reorderPlaylist,
    playTrackAtIndex,
    clearPlaylist,
    getFrequencyData,
    getTimeDomainData
  };

  return (
    <AudioPlayerContext.Provider value={contextValue}>
      {children}
    </AudioPlayerContext.Provider>
  );
};

export const useAudioPlayer = () => {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
};