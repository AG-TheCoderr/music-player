import React, { Suspense, lazy, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudioPlayerProvider, usePlayerActions, usePlayerSelector } from './audio/AudioPlayerProvider';
import { PlayerControls } from './player/PlayerControls';
import { FileLoader } from './player/FileLoader';
import { ModeSelector } from './player/ModeSelector';
import { Visualizer } from './audio/Visualizer';
import { MusicSearch } from './search/MusicSearch';
import { YouTubePane } from './player/YouTubePane';
import { KeyboardShortcuts } from './player/KeyboardShortcuts';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Headphones, Settings, Upload, BarChart3, AlertTriangle, X } from 'lucide-react';

// Heavy panels are split out of the initial bundle.
const Equalizer = lazy(() => import('./player/Equalizer').then((m) => ({ default: m.Equalizer })));
const EffectsPanel = lazy(() => import('./player/EffectsPanel').then((m) => ({ default: m.EffectsPanel })));
const PlaylistPanel = lazy(() =>
  import('./player/PlaylistPanel').then((m) => ({ default: m.PlaylistPanel }))
);

const PanelFallback = () => (
  <Card className="p-6 bg-gradient-surface border-audio-control">
    <div className="h-32 animate-pulse rounded bg-audio-track" />
  </Card>
);

const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: 'MP3',
  m4a: 'AAC / M4A',
  aac: 'AAC',
  wav: 'WAV',
  ogg: 'OGG (Vorbis)',
  oga: 'OGG (Vorbis)',
  opus: 'Opus',
  flac: 'FLAC',
  webm: 'WebM',
  mp4: 'MP4 / AAC',
  m3u8: 'HLS stream',
};

/** Best-effort format detection from a file name or URL path. */
const detectFormat = (src: string | File | undefined): string => {
  if (!src) return 'Unknown';
  if (src instanceof File) {
    const extension = src.name.split('.').pop()?.toLowerCase() ?? '';
    return AUDIO_EXTENSIONS[extension] ?? extension.toUpperCase() ?? 'Unknown';
  }

  try {
    const { pathname } = new URL(src, window.location.origin);
    const extension = pathname.split('.').pop()?.toLowerCase() ?? '';
    if (AUDIO_EXTENSIONS[extension]) return AUDIO_EXTENSIONS[extension];
  } catch {
    /* fall through */
  }
  return 'Stream / Unknown';
};

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
};

const MusicPlayerContent: React.FC = () => {
  const [tab, setTab] = useState('player');
  const { dismissError } = usePlayerActions();
  const equalizerBands = usePlayerSelector((state) => state.equalizerBands);
  const currentTrack = usePlayerSelector((state) => state.currentTrack);
  const duration = usePlayerSelector((state) => state.duration);
  const audioInfo = usePlayerSelector((state) => state.audioInfo);
  const externalSource = usePlayerSelector((state) => state.externalSource);
  const error = usePlayerSelector((state) => state.error);
  const isLoading = usePlayerSelector((state) => state.isLoading);

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center space-x-3">
          <div className="w-12 h-12 bg-gradient-primary rounded-full flex items-center justify-center animate-pulse-glow">
            <Headphones className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Pro Audio Player
          </h1>
        </div>
        <div className="flex items-center justify-center gap-3">
          <p className="text-muted-foreground">Professional music player with advanced audio processing</p>
          <KeyboardShortcuts tab={tab} onTabChange={setTab} />
        </div>
        <div className="flex items-center justify-center space-x-2 flex-wrap">
          <Badge variant="outline" className="bg-primary/10 border-primary/20">
            <BarChart3 className="w-3 h-3 mr-1" />
            Equalizer
          </Badge>
          <Badge variant="outline" className="bg-accent/10 border-accent/20">
            <Settings className="w-3 h-3 mr-1" />
            Effects
          </Badge>
          <Badge variant="outline" className="bg-primary-glow/10 border-primary-glow/20">
            <Upload className="w-3 h-3 mr-1" />
            Any Source
          </Badge>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="flex-1 text-sm">{error}</p>
            <Button variant="ghost" size="icon" onClick={dismissError} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 mb-6 bg-audio-surface border border-audio-control">
            <TabsTrigger value="player" className="data-[state=active]:bg-gradient-primary">
              Player
            </TabsTrigger>
            <TabsTrigger value="equalizer" className="data-[state=active]:bg-gradient-primary">
              Equalizer
            </TabsTrigger>
            <TabsTrigger value="effects" className="data-[state=active]:bg-gradient-primary">
              Effects
            </TabsTrigger>
            <TabsTrigger value="youtube" className="data-[state=active]:bg-gradient-primary">
              YouTube
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-gradient-primary">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="player" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                <MusicSearch />
                <FileLoader />
                <ModeSelector />
              </div>

              {/* Center Column */}
              <div className="space-y-6">
                <PlayerControls />

                {/* Visualizer */}
                <Card className="p-6 bg-gradient-surface border-audio-control rainbow-border">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-foreground">Audio Visualizer</h3>
                    {externalSource === 'youtube' ? (
                      <div className="h-32 bg-audio-track rounded-lg overflow-hidden flex items-center justify-center">
                        <p className="text-sm text-muted-foreground px-4 text-center">
                          The visualiser reads the Web Audio graph, which YouTube playback bypasses.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="h-32 bg-audio-track rounded-lg overflow-hidden">
                          <Visualizer type="bars" responsive className="w-full h-full" barCount={32} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 h-20">
                          <div className="bg-audio-track rounded-lg overflow-hidden">
                            <Visualizer type="wave" responsive className="w-full h-full" />
                          </div>
                          <div className="bg-audio-track rounded-lg overflow-hidden">
                            <Visualizer type="circular" responsive className="w-full h-full" />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </Card>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Quick EQ */}
                <Card className="p-4 bg-gradient-surface border-audio-control rainbow-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Quick EQ</h4>
                  <div className="flex justify-between items-end h-16">
                    {[0, 2, 4, 6, 8].map((eqIndex, i) => {
                      const gain = equalizerBands[eqIndex] || 0;
                      const height = Math.max(5, ((gain + 12) / 24) * 100);
                      return (
                        <div key={i} className="flex-1 mx-1">
                          <div className="bg-audio-track rounded h-full relative overflow-hidden">
                            <div
                              className="bg-gradient-primary w-full absolute bottom-0 transition-all duration-300"
                              style={{ height: `${height}%` }}
                            />
                          </div>
                          <div className="text-xs text-center text-muted-foreground mt-1">
                            {['Bass', 'Low', 'Mid', 'High', 'Tre'][i]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Track Info - reflects the real loaded track */}
                <Card className="p-4 bg-gradient-surface border-audio-control rainbow-border">
                  <h4 className="text-sm font-semibold text-foreground mb-3">Track Info</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Title:</span>
                      <span className="text-foreground truncate">{currentTrack?.title ?? 'No track loaded'}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Format:</span>
                      <span className="text-foreground">{detectFormat(currentTrack?.src)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Sample Rate:</span>
                      <span className="text-foreground">
                        {audioInfo ? `${(audioInfo.sampleRate / 1000).toFixed(1)} kHz` : '--'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Bit Depth:</span>
                      <span className="text-foreground">32-bit float</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Channels:</span>
                      <span className="text-foreground">
                        {audioInfo ? (audioInfo.channelCount === 1 ? 'Mono' : 'Stereo') : '--'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="text-foreground">{formatDuration(duration)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Source:</span>
                      <span className="text-foreground">
                        {isLoading ? 'Loading...' : externalSource === 'youtube' ? 'YouTube' : 'Direct audio'}
                      </span>
                    </div>
                  </div>
                </Card>

                <Suspense fallback={<PanelFallback />}>
                  <PlaylistPanel />
                </Suspense>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="equalizer">
            <div className="rainbow-border p-6 bg-gradient-surface border-audio-control rounded-lg">
              <Suspense fallback={<PanelFallback />}>
                <Equalizer />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="effects">
            <div className="rainbow-border p-6 bg-gradient-surface border-audio-control rounded-lg">
              <Suspense fallback={<PanelFallback />}>
                <EffectsPanel />
              </Suspense>
            </div>
          </TabsContent>

          {/* forceMount keeps the YouTube iframe alive while switching tabs */}
          <TabsContent value="youtube" forceMount className="mt-2 data-[state=inactive]:hidden">
            <div className="max-w-4xl mx-auto">
              <YouTubePane />
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ModeSelector />
              <Card className="p-6 bg-gradient-surface border-audio-control rainbow-border">
                <h3 className="text-lg font-semibold text-foreground mb-4">Advanced Settings</h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Buffer Size:</span>
                    <span className="text-foreground">{audioInfo ? `${audioInfo.bufferSize} samples` : '--'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Sample Rate:</span>
                    <span className="text-foreground">
                      {audioInfo ? `${(audioInfo.sampleRate / 1000).toFixed(1)} kHz` : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Output Latency:</span>
                    <span className="text-foreground">
                      {audioInfo ? `${(audioInfo.outputLatency * 1000).toFixed(1)} ms` : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Audio Engine:</span>
                    <span className="text-foreground">Web Audio API</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Processing:</span>
                    <span className="text-primary">Real-time</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Context State:</span>
                    <span className="text-foreground">{audioInfo?.state ?? 'initialising'}</span>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export const MusicPlayer: React.FC = () => {
  return (
    <AudioPlayerProvider>
      <MusicPlayerContent />
    </AudioPlayerProvider>
  );
};
