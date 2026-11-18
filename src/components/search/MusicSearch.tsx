import { publicUrl } from '@/utils/publicUrl';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Play, Plus, Music, Loader2, AlertTriangle, History, X } from 'lucide-react';
import { AudioProxyService, SearchResult } from '@/services/audioProxyService';
import { loadRecentSearches, rememberSearch, clearRecentSearches } from '@/services/recentSearches';
import { usePlayerActions } from '@/components/audio/playerContext';
import { useToast } from '@/hooks/use-toast';

const SEARCH_DEBOUNCE_MS = 450;

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const MusicSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => loadRecentSearches());

  const { loadTrack, addToPlaylist } = usePlayerActions();
  const { toast } = useToast();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) {
        setResults([]);
        setError(null);
        return;
      }

      // Only the newest request is allowed to write to the state.
      const requestId = ++requestIdRef.current;

      setIsSearching(true);
      setError(null);

      try {
        const found = await AudioProxyService.searchMusic(trimmed);
        if (requestId !== requestIdRef.current) return;

        setResults(found);
        setRecent(rememberSearch(trimmed));

        if (found.length === 0) {
          setError(`No results for "${trimmed}".`);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;

        const message = err instanceof Error ? err.message : 'Search failed.';
        setError(message);
        setResults([]);
      } finally {
        if (requestId === requestIdRef.current) setIsSearching(false);
      }
    },
    []
  );

  // Debounced search while typing.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const toTrack = (result: SearchResult) => ({
    id: `${result.platform}-${result.id}`,
    title: result.title,
    artist: result.artist,
    duration: result.duration,
    src: AudioProxyService.buildProxiedUrl(result.streamUrl),
    artwork: result.thumbnail,
  });

  const handlePlayTrack = async (result: SearchResult) => {
    const track = toTrack(result);
    try {
      await loadTrack(track);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Playback failed.';
      toast({ title: 'Playback failed', description: message, variant: 'destructive' });
    }
  };

  const handleAddToPlaylist = (result: SearchResult) => {
    addToPlaylist(toTrack(result));
    toast({ title: 'Added to playlist', description: `${result.title} by ${result.artist}` });
  };

  const previewCount = results.length;

  return (
    <Card className="p-6 panel">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Search className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Search</h3>
        </div>

        <div className="flex space-x-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song, artist or album"
            aria-label="Search music"
            className="flex-1 bg-audio-control border-border focus:border-primary"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (debounceRef.current) clearTimeout(debounceRef.current);
              runSearch(query);
            }}
          />
          <Button
            onClick={() => {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              runSearch(query);
            }}
            disabled={isSearching || !query.trim()}
            aria-label="Search"
            className="bg-primary hover:bg-primary/90"
          >
            {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {recent.length > 0 && !query && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Recent
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearRecentSearches();
                  setRecent([]);
                }}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => setQuery(term)}
                  className="px-2 py-1 rounded-full bg-audio-control text-xs text-muted-foreground hover:text-foreground hover:bg-audio-active transition-smooth"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1.5" role="alert">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {isSearching && results.length === 0 && (
          <div className="space-y-2" aria-hidden>
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-audio-control/50 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-audio-track animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-audio-track animate-pulse" />
                  <div className="h-2.5 w-1/3 rounded bg-audio-track animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-muted-foreground">Results ({results.length})</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResults([]);
                  setQuery('');
                }}
                className="h-6 px-2 text-xs text-muted-foreground"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>

            {previewCount > 0 && (
              <p className="text-xs text-muted-foreground">Previews are about 30 seconds long.</p>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((result, idx) => (
                <div
                  key={`${result.platform}:${result.id}:${idx}`}
                  className="flex items-center space-x-3 p-3 bg-audio-control rounded-lg border border-border hover:bg-audio-active transition-smooth"
                >
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {result.thumbnail ? (
                      <img
                        src={AudioProxyService.buildProxiedUrl(result.thumbnail)}
                        alt=""
                        className="w-full h-full object-cover rounded-lg"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.src = publicUrl('placeholder.svg');
                        }}
                      />
                    ) : (
                      <Music className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                      <Badge variant="secondary" className="text-xs text-white bg-sky-500">
                        {result.platform}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {result.artist} • {formatDuration(result.duration)}
                    </p>
                  </div>

                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePlayTrack(result)}
                      aria-label={`Play ${result.title}`}
                      className="h-8 w-8 p-0"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAddToPlaylist(result)}
                      aria-label={`Add ${result.title} to playlist`}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
