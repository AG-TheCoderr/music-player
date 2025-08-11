import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AudioEngine, AudioEffects } from './AudioEngine';
import { MediaSessionService } from '@/services/mediaSession';
import { YouTubeController } from '@/services/youtubeController';

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
  currentTrackIndex: number;
  mode: 'normal' | 'vocal-enhance' | 'instrument-focus' | 'bass-boost';
  equalizerBands: number[];
  effects: AudioEffects;
  isShuffled: boolean;
  repeatMode: 'none' | 'one' | 'all';
  externalSource: 'none' | 'youtube';
}

interface AudioPlayerActions {
  loadTrack: (track: Track) => Promise<void>;
  loadYouTube: (url: string, meta?: Partial<Track>) => Promise<void>;
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

  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
    currentTime: 0,
    duration: 0,
    isLoading: false,
    playlist: [],
    currentTrackIndex: -1,
    mode: 'normal',
    equalizerBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    effects: initialEffects,
    isShuffled: false,
  repeatMode: 'none',
  externalSource: 'none'
  });

  // Initialize audio engine
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

  // Update time
  const updateTime = useCallback(() => {
    if (state.externalSource === 'youtube') {
      const yt = YouTubeController.getState();
      setState(prev => ({ ...prev, currentTime: yt.currentTime, duration: yt.duration, isPlaying: yt.playing }));
      MediaSessionService.updatePosition(yt.currentTime, yt.duration || 0);
    } else if (audioEngineRef.current && state.isPlaying) {
      const currentTime = audioEngineRef.current.getCurrentTime();
      const duration = audioEngineRef.current.getDuration();
      setState(prev => ({ ...prev, currentTime, duration: duration || prev.duration }));
      MediaSessionService.updatePosition(currentTime, duration || 0);
      if (duration > 0 && currentTime >= duration - 0.1) {
        if (state.repeatMode === 'one') {
          audioEngineRef.current.setCurrentTime(0);
          audioEngineRef.current.play();
        } else if (state.repeatMode === 'all' || state.currentTrackIndex < state.playlist.length - 1) {
          const nextIndex = state.currentTrackIndex + 1;
          if (nextIndex < state.playlist.length) {
            loadTrack(state.playlist[nextIndex]);
          } else if (state.repeatMode === 'all' && state.playlist.length > 0) {
            loadTrack(state.playlist[0]);
          }
        } else {
          setState(prev => ({ ...prev, isPlaying: false }));
        }
      }
    }

    if (state.isPlaying || state.externalSource === 'youtube') {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }
  }, [state.isPlaying, state.repeatMode, state.currentTrackIndex, state.playlist.length, state.externalSource]);

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

  const loadTrack = useCallback(async (track: Track) => {
    if (!audioEngineRef.current) return;

    setState(prev => ({ ...prev, isLoading: true, currentTrack: track }));

    try {
      // Disable external source when loading a normal track
      setState(prev => ({ ...prev, externalSource: 'none' }));
      await audioEngineRef.current.loadAudio(track.src);
      audioEngineRef.current.setVolume(state.volume);
      
      // Apply current EQ settings
      state.equalizerBands.forEach((gain, index) => {
        audioEngineRef.current!.setEqualizerBand(index, gain);
      });

      // Apply effects
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

      // Setup Media Session
      MediaSessionService.setupMediaSession(track, {
        onPlay: play,
        onPause: pause,
        onNextTrack: nextTrack,
        onPreviousTrack: previousTrack,
        onSeek: (time) => {
          if (time < 0) {
            // Relative seek backward
            seekTo(Math.max(0, state.currentTime + time));
          } else if (time > state.duration) {
            // Absolute seek
            seekTo(time);
          } else {
            // Relative seek forward or absolute
            seekTo(time > state.currentTime + 30 ? time : state.currentTime + time);
          }
        }
      });

      setState(prev => ({ ...prev, isLoading: false }));
    } catch (error) {
      console.error('Error loading track:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.volume, state.equalizerBands, state.effects, state.currentTime, state.duration]);

  // Load a YouTube URL into a hidden global iframe and set as active external source
  const loadYouTube = useCallback(async (url: string, meta?: Partial<Track>) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const containerId = 'yt-global-player';
      if (!document.getElementById(containerId)) {
        const el = document.createElement('div');
        el.id = containerId;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        el.style.width = '320px';
        el.style.height = '180px';
        document.body.appendChild(el);
      }
      await YouTubeController.load(containerId, url);
      const title = meta?.title || 'YouTube Video';
      const artist = meta?.artist || 'YouTube';
      const artwork = meta?.artwork;
      const track: Track = { id: `yt-${Date.now()}`, title, artist, duration: 0, src: url, artwork };
      setState(prev => ({ ...prev, currentTrack: track, externalSource: 'youtube', isLoading: false }));
      // Media session handlers will use current context methods via window callbacks
      MediaSessionService.setupMediaSession(track, {
        onPlay: () => YouTubeController.play(),
        onPause: () => YouTubeController.pause(),
        onNextTrack: () => {},
        onPreviousTrack: () => {},
        onSeek: (time) => YouTubeController.seekTo(time)
      });
    } catch (e) {
      console.error('YouTube load error', e);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const play = useCallback(() => {
    if (state.externalSource === 'youtube') {
      YouTubeController.play();
      setState(prev => ({ ...prev, isPlaying: true }));
      MediaSessionService.updatePlaybackState('playing');
      return;
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.play();
      setState(prev => ({ ...prev, isPlaying: true }));
      MediaSessionService.updatePlaybackState('playing');
    }
  }, [state.externalSource]);

  const pause = useCallback(() => {
    if (state.externalSource === 'youtube') {
      YouTubeController.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
      return;
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
      MediaSessionService.updatePlaybackState('paused');
    }
  }, [state.externalSource]);

  const stop = useCallback(() => {
    if (state.externalSource === 'youtube') {
      YouTubeController.pause();
      YouTubeController.seekTo(0);
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      return;
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      setState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  }, [state.externalSource]);

  const setVolume = useCallback((volume: number) => {
    if (state.externalSource === 'youtube') {
      YouTubeController.setVolume(volume);
      setState(prev => ({ ...prev, volume }));
      return;
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.setVolume(volume);
      setState(prev => ({ ...prev, volume }));
    }
  }, [state.externalSource]);

  const seekTo = useCallback((time: number) => {
    if (state.externalSource === 'youtube') {
      YouTubeController.seekTo(time);
      setState(prev => ({ ...prev, currentTime: time }));
      return;
    }
    if (audioEngineRef.current) {
      audioEngineRef.current.setCurrentTime(time);
      setState(prev => ({ ...prev, currentTime: time }));
    }
  }, [state.externalSource]);

  const setMode = useCallback((mode: AudioPlayerState['mode']) => {
    setState(prev => ({ ...prev, mode }));
    
    // Apply mode-specific EQ settings
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
  }, [state.equalizerBands]);

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
    setState(prev => {
      const existingIds = new Set(prev.playlist.map(t => t.id));
      let id = track.id || `track-${Date.now()}`;
      if (existingIds.has(id)) {
        const base = id;
        let counter = 2;
        while (existingIds.has(`${base}-${counter}`)) counter++;
        id = `${base}-${counter}`;
      }
      const item: Track = { ...track, id };
      return {
        ...prev,
        playlist: [...prev.playlist, item]
      };
    });
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

  const clearPlaylist = useCallback(() => {
    stop();
    setState(prev => ({
      ...prev,
      playlist: [],
      currentTrackIndex: -1,
      currentTrack: null,
      duration: 0,
      currentTime: 0,
    }));
  }, [stop]);

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