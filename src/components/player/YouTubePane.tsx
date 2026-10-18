import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Youtube, Play, Pause, Search, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { YouTubeController, YT_PLAYER_CONTAINER_ID } from '@/services/youtubeController';
import { AudioProxyService } from '@/services/audioProxyService';
import { usePlayerActions, usePlayerSelector } from '../audio/AudioPlayerProvider';

interface YouTubeResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  thumbnail?: string;
  platform: string;
}

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

export const YouTubePane: React.FC = () => {
  const { loadYouTube, addToPlaylist, seekTo, setVolume } = usePlayerActions();
  const volume = usePlayerSelector((state) => state.volume);

  const [url, setUrl] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ytState, setYtState] = useState(YouTubeController.getState());

  useEffect(() => {
    const timer = window.setInterval(() => setYtState(YouTubeController.getState()), 300);
    return () => window.clearInterval(timer);
  }, []);

  const handleLoad = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!YouTubeController.isYouTubeUrl(trimmed)) {
      setSearchError('Please paste a valid YouTube URL.');
      return;
    }

    setIsLoading(true);
    setSearchError(null);
    try {
      await loadYouTube(trimmed, undefined, YT_PLAYER_CONTAINER_ID);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'The video could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [loadYouTube, url]);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setSearchError(null);
    try {
      const found = await AudioProxyService.searchMusic(trimmed, 'youtube');
      setResults(found as YouTubeResult[]);
      if (found.length === 0) {
        setSearchError('No YouTube results found.');
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'YouTube search failed.');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handlePlayResult = useCallback(
    async (result: YouTubeResult) => {
      try {
        await loadYouTube(
          result.streamUrl,
          { title: result.title, artist: result.artist, artwork: result.thumbnail },
          YT_PLAYER_CONTAINER_ID
        );
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : 'The video could not be played.');
      }
    },
    [loadYouTube]
  );

  const handleAddResult = useCallback(
    (result: YouTubeResult) => {
      addToPlaylist({
        id: `yt-${result.id}`,
        title: result.title,
        artist: result.artist,
        duration: result.duration,
        src: result.streamUrl,
        artwork: result.thumbnail,
        source: 'youtube',
      });
    },
    [addToPlaylist]
  );

  return (
    <Card className="p-4 bg-gradient-surface border-audio-control">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Youtube className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold text-foreground">YouTube Music</h3>
          {ytState.error && (
            <Badge variant="destructive" className="ml-auto flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Error
            </Badge>
          )}
        </div>

        {/* Player - the container id is shared with the search bar so both use one player */}
        <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
          <div id={YT_PLAYER_CONTAINER_ID} className="w-full h-full" />
        </div>

        {/* Transport */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => (ytState.playing ? YouTubeController.pause() : YouTubeController.play())}
              disabled={!ytState.ready}
              aria-label={ytState.playing ? 'Pause' : 'Play'}
            >
              {ytState.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>

            <Slider
              value={[ytState.currentTime]}
              max={ytState.duration || 100}
              step={1}
              disabled={!ytState.ready}
              onValueChange={([value]) => {
                YouTubeController.seekTo(value);
                seekTo(value);
              }}
              className="flex-1"
            />

            <span className="text-xs text-muted-foreground tabular-nums w-24 text-right">
              {formatDuration(ytState.currentTime)} / {formatDuration(ytState.duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-14">Volume</span>
            <Slider
              value={[volume * 100]}
              max={100}
              step={1}
              onValueChange={([value]) => setVolume(value / 100)}
              className="flex-1"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>
        </div>

        {/* Load by URL */}
        <div className="space-y-2">
          <Label className="text-sm text-foreground">Paste a YouTube video URL</Label>
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="bg-audio-control border-border"
              onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            />
            <Button onClick={handleLoad} disabled={isLoading || !url.trim()} className="bg-primary">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load'}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="space-y-2">
          <Label className="text-sm text-foreground">Search YouTube</Label>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs or artists"
              className="bg-audio-control border-border"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isSearching || !query.trim()} className="bg-primary">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {searchError && (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {searchError}
          </p>
        )}

        {results.length > 0 && (
          <ScrollArea className="max-h-72">
            <div className="space-y-2 pr-2">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center gap-3 p-2 bg-audio-control rounded-lg border border-border hover:bg-audio-active transition-smooth"
                >
                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center overflow-hidden shrink-0">
                    {result.thumbnail ? (
                      <img
                        src={result.thumbnail}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <Youtube className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {result.artist} • {formatDuration(result.duration)}
                    </p>
                  </div>

                  <Button size="sm" variant="ghost" onClick={() => handlePlayResult(result)} aria-label="Play">
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleAddResult(result)} aria-label="Add to playlist">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <p className="text-xs text-muted-foreground">
          YouTube streams play through the YouTube player and bypass the in-app equalizer, effects and visualiser.
        </p>
      </div>
    </Card>
  );
};
