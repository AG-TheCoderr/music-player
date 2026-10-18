import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Link, Music, FileAudio } from 'lucide-react';
import { usePlayerActions, usePlayerSelector } from '../audio/AudioPlayerProvider';
import { useToast } from '@/hooks/use-toast';
import { AudioProxyService } from '@/services/audioProxyService';
import { YouTubeController } from '@/services/youtubeController';

export const FileLoader: React.FC = () => {
  const { loadTrack, addToPlaylist, loadYouTube } = usePlayerActions();
  const currentTrack = usePlayerSelector((state) => state.currentTrack);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const createTrackFromFile = (file: File) => ({
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    title: file.name.replace(/\.[^/.]+$/, ''),
    artist: 'Unknown Artist',
    duration: 0,
    src: file,
    artwork: undefined,
    source: 'audio' as const,
  });

  const createTrackFromUrl = (url: string) => {
    let fileName = url;
    try {
      fileName = new URL(url, window.location.origin).pathname.split('/').pop() || 'Unknown Track';
    } catch {
      /* keep the raw url */
    }

    const src = AudioProxyService.shouldProxyUrl(url) ? AudioProxyService.buildProxiedUrl(url) : url;

    return {
      id: `url-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      title: fileName.replace(/\.[^/.]+$/, '') || 'Unknown Track',
      artist: 'Unknown Artist',
      duration: 0,
      src,
      artwork: undefined,
      source: 'audio' as const,
    };
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const audioFiles = Array.from(files).filter(
      (file) =>
        file.type.startsWith('audio/') ||
        ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'].some((ext) => file.name.toLowerCase().endsWith(ext))
    );

    if (audioFiles.length === 0) {
      toast({
        title: 'Invalid file type',
        description: 'Please select audio files only.',
        variant: 'destructive',
      });
      return;
    }

    const tracks = audioFiles.map(createTrackFromFile);
    tracks.forEach((track) => addToPlaylist(track));

    toast({
      title: 'Files loaded',
      description: `Added ${tracks.length} track(s) to playlist.`,
    });

    // Start playing when nothing else is loaded yet.
    if (!currentTrack && tracks.length > 0) {
      await loadTrack(tracks[0]);
    }
  };

  const handleUrlLoad = async () => {
    if (!urlInput.trim()) return;

    setIsLoading(true);
    try {
      // Extract the first valid http(s) URL from any pasted text.
      const input = urlInput.trim();
      const url = input.match(/https?:\/\/[^\s"']+/)?.[0] ?? input;

      if (!/^https?:\/\//i.test(url)) {
        throw new Error('Enter a full http(s) URL.');
      }

      // Guard against pasted image CDN links (not playable audio).
      if (/^https?:\/\/(?:[^/]*\.)?img\.youtube\.com\//i.test(url)) {
        throw new Error('That looks like an image link. Paste a direct audio URL or a YouTube video URL.');
      }

      // YouTube links are played through the YouTube player, not the audio engine.
      if (YouTubeController.isYouTubeUrl(url)) {
        await loadYouTube(url);
        toast({ title: 'YouTube video loaded', description: 'Open the YouTube tab to watch and control it.' });
        setUrlInput('');
        return;
      }

      let track;

      if (AudioProxyService.needsProxy(url)) {
        // Direct audio hosted on a streaming platform - ask the backend for a playable URL.
        const extracted = await AudioProxyService.extractAudioUrl(url);
        if (!extracted) {
          throw new Error('The backend could not extract a playable stream from that URL.');
        }

        const proxied = AudioProxyService.shouldProxyUrl(extracted.streamUrl)
          ? AudioProxyService.buildProxiedUrl(extracted.streamUrl)
          : extracted.streamUrl;

        track = {
          id: `extracted-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          title: extracted.title,
          artist: extracted.artist,
          duration: 0,
          src: proxied,
          artwork: extracted.thumbnail,
          source: 'audio' as const,
        };

        toast({ title: 'Audio extracted', description: `Successfully extracted audio from ${new URL(url).hostname}` });
      } else {
        track = createTrackFromUrl(url);
        toast({ title: 'URL loaded', description: 'Audio track added to the playlist.' });
      }

      addToPlaylist(track);
      setUrlInput('');
    } catch (error) {
      toast({
        title: 'Error loading URL',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to load audio from the provided URL. Try using the music search feature instead.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
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
    <Card className="p-6 bg-gradient-surface border-audio-control rainbow-border">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Music className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Load Music</h3>
        </div>

        {/* Drag & Drop Area */}
        <button
          type="button"
          className={`
            w-full border-2 border-dashed rounded-lg p-8 text-center transition-smooth cursor-pointer
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
            ${isDragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-primary/5'}
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
              <p className="text-sm text-muted-foreground">or click to browse • MP3, WAV, OGG, FLAC, M4A</p>
            </div>
          </div>
        </button>

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
              placeholder="Direct audio URL (MP3, WAV, etc.) or a YouTube link"
              className="flex-1 bg-audio-control border-border focus:border-primary"
              onKeyDown={(e) => e.key === 'Enter' && handleUrlLoad()}
            />
            <Button onClick={handleUrlLoad} disabled={isLoading || !urlInput.trim()} className="bg-primary hover:bg-primary/90">
              {isLoading ? 'Loading...' : 'Load'}
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
            onClick={() => {
              addToPlaylist({
                id: `demo-${Date.now()}`,
                title: 'Demo Track - Ambient Soundscape',
                artist: 'Sonic Studio Pro',
                duration: 0,
                src: '/audio/demo.mp3',
                artwork: '/placeholder.svg',
                source: 'audio',
              });
              toast({ title: 'Demo track added', description: 'The demo track is now in your playlist.' });
            }}
            className="bg-audio-control border-border hover:bg-audio-active"
          >
            <Music className="w-4 h-4 mr-2" />
            Demo Track
          </Button>
        </div>
      </div>
    </Card>
  );
};
