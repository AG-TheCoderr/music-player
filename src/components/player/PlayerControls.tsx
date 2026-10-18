import React from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  Loader2,
} from 'lucide-react';
import { usePlayerActions, usePlayerSelector } from '../audio/AudioPlayerProvider';
import { cn } from '@/lib/utils';

export const PlayerControls: React.FC = () => {
  const {
    play,
    pause,
    nextTrack,
    previousTrack,
    setVolume,
    seekTo,
    toggleRepeat,
    toggleShuffle,
  } = usePlayerActions();

  // Narrow subscriptions: the playback position ticks ten times a second, so only the
  // components that actually show it re-render.
  const isPlaying = usePlayerSelector((state) => state.isPlaying);
  const isLoading = usePlayerSelector((state) => state.isLoading);
  const currentTrack = usePlayerSelector((state) => state.currentTrack);
  const externalSource = usePlayerSelector((state) => state.externalSource);
  const volume = usePlayerSelector((state) => state.volume);
  const currentTime = usePlayerSelector((state) => state.currentTime);
  const duration = usePlayerSelector((state) => state.duration);
  const repeatMode = usePlayerSelector((state) => state.repeatMode);
  const isShuffled = usePlayerSelector((state) => state.isShuffled);

  const formatTime = (time: number): string => {
    if (!Number.isFinite(time) || time < 0) time = 0;
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (value: number[]) => {
    seekTo(value[0]);
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0] / 100);
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  return (
    <div className="flex flex-col space-y-4 p-6 bg-gradient-surface rounded-lg border border-audio-control shadow-card">
      {/* Track Info */}
      {currentTrack && (
        <div className="flex items-center space-x-4">
          <div className="w-16 h-16 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 bg-gradient-primary">
            {currentTrack.artwork ? (
              <img
                src={currentTrack.artwork}
                alt={`${currentTrack.title} cover art`}
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-16 h-16 bg-gradient-primary rounded-lg flex items-center justify-center animate-spin-slow">
                <div className="w-4 h-4 bg-background rounded-full" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground truncate">{currentTrack.title}</h3>
              {externalSource === 'youtube' && (
                <Badge variant="secondary" className="bg-red-500 text-white text-[10px] px-1.5">
                  YouTube
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={handleSeek}
          disabled={!duration}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex items-center justify-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleShuffle}
          aria-label="Toggle shuffle"
          className={cn('text-muted-foreground hover:text-foreground transition-smooth', isShuffled && 'text-primary')}
        >
          <Shuffle className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={previousTrack}
          aria-label="Previous track"
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          <SkipBack className="w-5 h-5" />
        </Button>

        <Button
          variant="default"
          size="icon"
          onClick={togglePlayPause}
          disabled={isLoading}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className={cn(
            'w-14 h-14 rounded-full bg-gradient-primary hover:shadow-glow',
            'transition-bounce hover:scale-105',
            isPlaying && 'animate-pulse-glow'
          )}
        >
          {isLoading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-1" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={nextTrack}
          aria-label="Next track"
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          <SkipForward className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleRepeat}
          aria-label={`Repeat: ${repeatMode}`}
          className={cn(
            'text-muted-foreground hover:text-foreground transition-smooth',
            repeatMode !== 'none' && 'text-primary'
          )}
        >
          <Repeat className="h-4 w-4" />
          {repeatMode === 'one' && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full text-[8px] flex items-center justify-center text-primary-foreground font-bold">
              1
            </span>
          )}
        </Button>
      </div>

      {/* Volume Control */}
      <div className="flex items-center space-x-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setVolume(volume === 0 ? 0.7 : 0)}
          aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <Slider
          value={[volume * 100]}
          max={100}
          step={1}
          onValueChange={handleVolumeChange}
          thumbAriaLabel="Volume"
          thumbAriaValueText={`${Math.round(volume * 100)}%`}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-8 text-right">{Math.round(volume * 100)}%</span>
      </div>
    </div>
  );
};
