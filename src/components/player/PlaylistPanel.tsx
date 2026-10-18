import React, { useEffect, useState } from 'react';
import { usePlayerActions, usePlayerSelector, Track } from '../audio/AudioPlayerProvider';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, X, Play, ListMusic } from 'lucide-react';
import { cn } from '@/lib/utils';

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

const SortableTrackItem: React.FC<{ track: Track; index: number; isCurrent: boolean; isPlaying: boolean }> = ({
  track,
  index,
  isCurrent,
  isPlaying,
}) => {
  const { playTrackAtIndex, removeFromPlaylist } = usePlayerActions();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center p-2 rounded-md transition-colors group',
        isCurrent ? 'bg-audio-active' : 'hover:bg-audio-control',
        isDragging && 'opacity-70 z-10 shadow-lg bg-audio-control'
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Reorder ${track.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => playTrackAtIndex(index)}
        className="flex-1 ml-2 text-left min-w-0 group/play"
        aria-label={`Play ${track.title} by ${track.artist}`}
      >
        <p className={cn('font-semibold text-sm truncate', isCurrent ? 'text-primary-foreground' : 'text-foreground')}>
          {track.title}
        </p>
        <p className={cn('text-xs truncate', isCurrent ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
          {track.artist}
          {track.duration ? ` • ${formatDuration(track.duration)}` : ''}
        </p>
      </button>

      {isPlaying && (
        <span className="ml-2 flex items-end gap-0.5 h-4" aria-hidden>
          {[0, 1, 2].map((bar) => (
            <span
              key={bar}
              className="w-0.5 rounded-full bg-primary animate-equalizer"
              style={{ height: `${40 + bar * 25}%`, animationDelay: `${bar * 0.15}s` }}
            />
          ))}
        </span>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => removeFromPlaylist(track.id)}
        aria-label={`Remove ${track.title} from playlist`}
        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

export const PlaylistPanel = () => {
  const { playTrackAtIndex, removeFromPlaylist, reorderPlaylist, clearPlaylist } = usePlayerActions();
  const playlist = usePlayerSelector((state) => state.playlist);
  const currentTrack = usePlayerSelector((state) => state.currentTrack);
  const currentTrackIndex = usePlayerSelector((state) => state.currentTrackIndex);
  const isPlaying = usePlayerSelector((state) => state.isPlaying);

  // Clearing the playlist cannot be undone, so the button asks for a second click.
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const totalDuration = playlist.reduce((total, track) => total + (track.duration || 0), 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = playlist.findIndex((track) => track.id === active.id);
    const to = playlist.findIndex((track) => track.id === over.id);
    if (from < 0 || to < 0) return;

    reorderPlaylist(from, to);
  };

  return (
    <Card className="p-4 bg-gradient-surface border-audio-control h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <ListMusic className="h-4 w-4" />
          Up Next
          <span className="text-xs font-normal text-muted-foreground">({playlist.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          {totalDuration > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(totalDuration)}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirmClear) {
                clearPlaylist();
                setConfirmClear(false);
              } else {
                setConfirmClear(true);
              }
            }}
            disabled={playlist.length === 0}
            aria-label={confirmClear ? 'Confirm clearing the playlist' : 'Clear the playlist'}
            className={cn(
              'bg-audio-control border-border hover:bg-audio-active',
              confirmClear && 'border-destructive text-destructive hover:text-destructive'
            )}
          >
            {confirmClear ? 'Sure?' : 'Clear'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {playlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-center">
            <ListMusic className="h-8 w-8 text-muted-foreground/60 mb-2" />
            <p className="text-muted-foreground text-sm">Playlist is empty</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Search or drop a file to add tracks</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={playlist.map((track) => track.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {playlist.map((track, index) => (
                  <SortableTrackItem
                    key={track.id}
                    track={track}
                    index={index}
                    isCurrent={index === currentTrackIndex || track.id === currentTrack?.id}
                    isPlaying={isPlaying && (index === currentTrackIndex || track.id === currentTrack?.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>
    </Card>
  );
};
