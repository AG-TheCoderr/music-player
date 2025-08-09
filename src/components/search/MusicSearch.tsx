import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Play, Plus, Music, Download } from 'lucide-react';
import { AudioProxyService } from '@/services/audioProxyService';
import { useAudioPlayer } from '@/components/audio/AudioPlayerProvider';
import { useToast } from '@/hooks/use-toast';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  thumbnail?: string;
  platform: string;
}

export const MusicSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'youtube' | 'soundcloud' | 'spotify'>('all');
  
  const { loadTrack, addToPlaylist } = useAudioPlayer();
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const searchResults = await AudioProxyService.searchMusic(query, selectedPlatform);
      setResults(searchResults);
      
      toast({
        title: "Search completed",
        description: `Found ${searchResults.length} results for "${query}"`,
      });
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Could not search for music. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlayTrack = async (result: SearchResult) => {
    try {
      let src = result.streamUrl;
      let title = result.title;
      let artist = result.artist;
      let artwork = result.thumbnail;

      if (AudioProxyService.needsProxy(result.streamUrl)) {
        const extracted = await AudioProxyService.extractAudioUrl(result.streamUrl);
        if (!extracted) throw new Error('Extraction failed');
        src = extracted.streamUrl;
        title = extracted.title;
        artist = extracted.artist;
        artwork = extracted.thumbnail;
      }

      if (AudioProxyService.shouldProxyUrl(src)) {
        src = AudioProxyService.buildProxiedUrl(src);
      }

      const track = {
        id: result.id,
        title,
        artist,
        duration: result.duration,
        src,
        artwork
      };

      await loadTrack(track);
      toast({
        title: "Playing track",
        description: `${title} by ${artist}`,
      });
    } catch (error) {
      toast({
        title: "Playback failed",
        description: "Could not play this track.",
        variant: "destructive"
      });
    }
  };

  const handleAddToPlaylist = async (result: SearchResult) => {
    try {
      let src = result.streamUrl;
      let title = result.title;
      let artist = result.artist;
      let artwork = result.thumbnail;

      if (AudioProxyService.needsProxy(result.streamUrl)) {
        const extracted = await AudioProxyService.extractAudioUrl(result.streamUrl);
        if (extracted) {
          src = extracted.streamUrl;
          title = extracted.title;
          artist = extracted.artist;
          artwork = extracted.thumbnail;
        }
      }

      if (AudioProxyService.shouldProxyUrl(src)) {
        src = AudioProxyService.buildProxiedUrl(src);
      }

      const track = { id: result.id, title, artist, duration: result.duration, src, artwork };
      addToPlaylist(track);
      toast({ title: "Added to playlist", description: `${title} by ${artist}` });
    } catch (error) {
      toast({ title: "Add failed", description: "Could not add this track.", variant: "destructive" });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'youtube': return 'bg-red-500';
      case 'soundcloud': return 'bg-orange-500';
      case 'spotify': return 'bg-green-500';
      default: return 'bg-primary';
    }
  };

  return (
    <Card className="p-6 bg-gradient-surface border-audio-control rainbow-border">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <Search className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Music Search</h3>
        </div>

        {/* Search Input */}
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for songs, artists, or albums..."
              className="flex-1 bg-audio-control border-border focus:border-primary"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !query.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Platform Filter */}
          <div className="flex space-x-2">
            {(['all', 'youtube', 'soundcloud', 'spotify'] as const).map((platform) => (
              <Button
                key={platform}
                variant={selectedPlatform === platform ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPlatform(platform)}
                className="capitalize"
              >
                {platform}
              </Button>
            ))}
          </div>
        </div>

        {/* Search Results */}
        {results.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Search Results ({results.length})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {results.map((result) => (
                <div
                  key={result.id}
                  className="flex items-center space-x-3 p-3 bg-audio-control rounded-lg border border-border hover:bg-audio-active transition-smooth"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
                    {result.thumbnail ? (
                      <img
                        src={AudioProxyService.buildProxiedUrl(result.thumbnail)}
                        alt={`${result.title} by ${result.artist} thumbnail`}
                        className="w-full h-full object-cover rounded-lg"
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.src = '/placeholder.svg'; }}
                      />
                    ) : (
                      <Music className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {result.title}
                      </p>
                      <Badge
                        variant="secondary"
                        className={`text-xs text-white ${getPlatformColor(result.platform)}`}
                      >
                        {result.platform}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {result.artist} • {formatDuration(result.duration)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex space-x-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePlayTrack(result)}
                      className="h-8 w-8 p-0"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAddToPlaylist(result)}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length === 0 && query && !isSearching && (
          <div className="text-center py-8">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No results found for "{query}"</p>
            <p className="text-sm text-muted-foreground">Try different keywords or check your spelling</p>
          </div>
        )}
      </div>
    </Card>
  );
};