import React from 'react';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, X } from 'lucide-react';

const SortableTrackItem = ({ track, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: track.id });
  const { playTrackAtIndex, removeFromPlaylist, currentTrack } = useAudioPlayer();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isPlaying = currentTrack?.id === track.id;

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={`flex items-center p-2 rounded-md transition-colors ${isPlaying ? 'bg-audio-active' : 'hover:bg-audio-control'}`}>
      <Button variant="ghost" size="sm" {...listeners} className="cursor-grab">
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
  const { playlist, reorderPlaylist, clearPlaylist } = useAudioPlayer();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = playlist.findIndex(t => t.id === active.id);
      const newIndex = playlist.findIndex(t => t.id === over.id);
      reorderPlaylist(oldIndex, newIndex);
    }
  };

  return (
    <Card className="p-4 bg-gradient-surface border-audio-control h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Up Next</h3>
        <Button variant="outline" size="sm" onClick={clearPlaylist} className="bg-audio-control border-border hover:bg-audio-active">
          Clear
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={playlist.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {playlist.map((track, index) => (
                <SortableTrackItem key={track.id} track={track} index={index} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {playlist.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Playlist is empty</p>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
