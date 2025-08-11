import React, { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Youtube, Play, Pause, Search } from 'lucide-react';
import { YouTubeController } from '@/services/youtubeController';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';
import { AudioProxyService } from '@/services/audioProxyService';

export const YouTubePane: React.FC = () => {
  const { setVolume, seekTo, loadYouTube } = useAudioPlayer();
  const [url, setUrl] = useState('');
  const [ytQuery, setYtQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [ytState, setYtState] = useState(YouTubeController.getState());
  const containerId = useRef(`yt-player-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const t = window.setInterval(() => setYtState(YouTubeController.getState()), 300);
    return () => window.clearInterval(t);
  }, []);

  const handleLoad = async () => {
    if (!url.trim()) return;
    // basic validation
    if (!/(youtube\.com|youtu\.be)/i.test(url)) {
      alert('Please paste a valid YouTube URL.');
      return;
    }
    setLoading(true);
    try {
  // Use global provider so PlayerControls work
  await loadYouTube(url.trim());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleYtSearch = async () => {
    if (!ytQuery.trim()) return;
    // Use existing search (iTunes previews) as a fallback experience
    // For YouTube-specific search, a backend is required; here we simply reuse existing search UI in the tab.
    const results = await AudioProxyService.searchMusic(ytQuery, 'all');
    if (results && results.length) {
      // Choose first result and try to play via direct preview if available
      // This keeps parity with your current search behavior
      const first = results[0];
      const proxied = AudioProxyService.shouldProxyUrl(first.streamUrl)
        ? AudioProxyService.buildProxiedUrl(first.streamUrl)
        : first.streamUrl;
      // Load into normal engine (not YouTube iframe)
      // We don't auto-play to avoid surprise audio
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { loadTrack, addToPlaylist } = useAudioPlayer();
      try {
        await (loadTrack as any)({ id: first.id, title: first.title, artist: first.artist, duration: first.duration, src: proxied, artwork: first.thumbnail });
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <Card className="p-4 bg-gradient-surface border-audio-control">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Youtube className="w-5 h-5 text-red-500" />
          <h3 className="text-lg font-semibold text-foreground">YouTube Music</h3>
        </div>

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
            <Button onClick={handleLoad} disabled={loading || !url.trim()} className="bg-primary">
              {loading ? 'Loading...' : 'Load'}
            </Button>
          </div>
        </div>

        <div className="aspect-video w-full bg-black rounded-md overflow-hidden">
          <div id={containerId.current} className="w-full h-full"></div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => YouTubeController.play()} disabled={!ytState.ready}>
            <Play className="w-4 h-4 mr-2" /> Play
          </Button>
          <Button variant="outline" onClick={() => YouTubeController.pause()} disabled={!ytState.ready}>
            <Pause className="w-4 h-4 mr-2" /> Pause
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          Note: YouTube streams play via the YouTube player and won't use in-app effects/equalizer.
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">Quick search (uses preview sources)</span>
          </div>
          <div className="flex gap-2">
            <Input
              value={ytQuery}
              onChange={(e) => setYtQuery(e.target.value)}
              placeholder="Search songs or artists"
              className="bg-audio-control border-border"
              onKeyDown={(e) => e.key === 'Enter' && handleYtSearch()}
            />
            <Button onClick={handleYtSearch} className="bg-primary">Search</Button>
          </div>
        </div>
      </div>
    </Card>
  );
};
