import React from 'react';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';
// DnD temporarily disabled to resolve import issues. We'll fall back to a simple list.
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, X } from 'lucide-react';

interface Track { id: string; title: string; artist: string }
const SortableTrackItem: React.FC<{ track: Track; index: number }> = ({ track, index }) => {
  const { playTrackAtIndex, removeFromPlaylist, currentTrack } = useAudioPlayer();
  const isPlaying = currentTrack?.id === track.id;
  return (
    <div className={`flex items-center p-2 rounded-md transition-colors ${isPlaying ? 'bg-audio-active' : 'hover:bg-audio-control'}`}>
      <Button variant="ghost" size="sm" className="cursor-default" disabled>
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </Button>
      <div className="flex-1 ml-2" onClick={() => playTrackAtIndex(index)}>
        <p className="font-semibold text-sm text-foreground truncate">{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => removeFromPlaylist(track.id)} className="ml-2">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const PlaylistPanel = () => {
  const { playlist, clearPlaylist } = useAudioPlayer();

  return (
    <Card className="p-4 bg-gradient-surface border-audio-control h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Up Next</h3>
        <Button variant="outline" size="sm" onClick={clearPlaylist} className="bg-audio-control border-border hover:bg-audio-active">
          Clear
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {playlist.map((track, index) => (
            <SortableTrackItem key={`${track.id}-${index}`} track={track as any} index={index} />
          ))}
        </div>
        {playlist.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Playlist is empty</p>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
