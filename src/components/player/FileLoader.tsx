import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Link, Music, FileAudio } from 'lucide-react';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';
import { useToast } from '@/hooks/use-toast';

export const FileLoader: React.FC = () => {
  const { loadTrack, addToPlaylist } = useAudioPlayer();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const createTrackFromFile = (file: File) => {
    return {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: 'Unknown Artist',
      duration: 0,
      src: file,
      artwork: undefined
    };
  };

  const createTrackFromUrl = (url: string) => {
    const fileName = url.split('/').pop() || 'Unknown Track';
    return {
      id: `url-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: fileName.replace(/\.[^/.]+$/, ""),
      artist: 'Unknown Artist',
      duration: 0,
      src: url,
      artwork: undefined
    };
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const audioFiles = Array.from(files).filter(file => 
      file.type.startsWith('audio/') || 
      ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'].some(ext => 
        file.name.toLowerCase().endsWith(ext)
      )
    );

    if (audioFiles.length === 0) {
      toast({
        title: "Invalid file type",
        description: "Please select audio files only.",
        variant: "destructive"
      });
      return;
    }

    try {
      for (const file of audioFiles) {
        const track = createTrackFromFile(file);
        
        if (audioFiles.indexOf(file) === 0) {
          // Load first file immediately
          await loadTrack(track);
        }
        
        // Add all files to playlist
        addToPlaylist(track);
      }

      toast({
        title: "Files loaded",
        description: `Added ${audioFiles.length} track(s) to playlist.`,
      });
    } catch (error) {
      toast({
        title: "Error loading files",
        description: "Failed to load one or more audio files.",
        variant: "destructive"
      });
    }
  };

  const handleUrlLoad = async () => {
    if (!urlInput.trim()) return;

    try {
      const track = createTrackFromUrl(urlInput.trim());
      await loadTrack(track);
      addToPlaylist(track);
      setUrlInput('');
      
      toast({
        title: "URL loaded",
        description: "Audio track loaded from URL.",
      });
    } catch (error) {
      toast({
        title: "Error loading URL",
        description: "Failed to load audio from the provided URL.",
        variant: "destructive"
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  return (
    <Card className="p-6 bg-gradient-surface border-audio-control">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Music className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Load Music</h3>
        </div>

        {/* Drag & Drop Area */}
        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-smooth cursor-pointer
            ${isDragging 
              ? 'border-primary bg-primary/10' 
              : 'border-border hover:border-primary/50 hover:bg-primary/5'
            }
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center space-y-3">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
              {isDragging ? (
                <FileAudio className="w-8 h-8 text-primary animate-bounce" />
              ) : (
                <Upload className="w-8 h-8 text-primary" />
              )}
            </div>
            <div>
              <p className="text-foreground font-medium">
                {isDragging ? 'Drop your music files here' : 'Drag & drop music files'}
              </p>
              <p className="text-sm text-muted-foreground">
                or click to browse • MP3, WAV, OGG, FLAC, M4A
              </p>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
        />

        {/* URL Input */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-foreground flex items-center space-x-2">
            <Link className="w-4 h-4" />
            <span>Load from URL</span>
          </Label>
          <div className="flex space-x-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/audio.mp3"
              className="flex-1 bg-audio-control border-border focus:border-primary"
              onKeyPress={(e) => e.key === 'Enter' && handleUrlLoad()}
            />
            <Button
              onClick={handleUrlLoad}
              disabled={!urlInput.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              Load
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="bg-audio-control border-border hover:bg-audio-active"
          >
            <Upload className="w-4 h-4 mr-2" />
            Browse Files
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="bg-audio-control border-border hover:bg-audio-active"
          >
            <Music className="w-4 h-4 mr-2" />
            Demo Tracks
          </Button>
        </div>
      </div>
    </Card>
  );
};