import React from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Repeat,
  Shuffle,
  Heart
} from 'lucide-react';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';
import { cn } from '@/lib/utils';

export const PlayerControls: React.FC = () => {
  const {
    isPlaying,
    currentTrack,
    volume,
    currentTime,
    duration,
    repeatMode,
    isShuffled,
    play,
    pause,
    nextTrack,
    previousTrack,
    setVolume,
    seekTo,
    toggleRepeat,
    toggleShuffle
  } = useAudioPlayer();

  const formatTime = (time: number): string => {
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
          <div className="w-16 h-16 bg-gradient-primary rounded-lg flex items-center justify-center animate-spin-slow">
            <div className="w-4 h-4 bg-background rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{currentTrack.title}</h3>
            <p className="text-sm text-muted-foreground truncate">{currentTrack.artist}</p>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent">
            <Heart className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Progress Bar */}
      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={handleSeek}
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
          className={cn(
            "text-muted-foreground hover:text-foreground transition-smooth",
            isShuffled && "text-primary"
          )}
        >
          <Shuffle className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={previousTrack}
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          <SkipBack className="w-5 h-5" />
        </Button>

        <Button
          variant="default"
          size="icon"
          onClick={togglePlayPause}
          className={cn(
            "w-14 h-14 rounded-full bg-gradient-primary hover:shadow-glow",
            "transition-bounce hover:scale-105",
            isPlaying && "animate-pulse-glow"
          )}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-1" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={nextTrack}
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          <SkipForward className="w-5 h-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleRepeat}
          className={cn(
            "text-muted-foreground hover:text-foreground transition-smooth",
            repeatMode !== 'none' && "text-primary"
          )}
        >
          <Repeat className="w-4 h-4" />
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
          className="text-muted-foreground hover:text-foreground transition-smooth"
        >
          {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </Button>
        <Slider
          value={[volume * 100]}
          max={100}
          step={1}
          onValueChange={handleVolumeChange}
          className="flex-1"
        />
        <span className="text-xs text-muted-foreground w-8 text-right">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
};