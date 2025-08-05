import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AudioPlayerProvider, useAudioPlayer } from './audio/AudioPlayerProvider';
import { PlayerControls } from './player/PlayerControls';
import { Equalizer } from './player/Equalizer';
import { EffectsPanel } from './player/EffectsPanel';
import { FileLoader } from './player/FileLoader';
import { ModeSelector } from './player/ModeSelector';
import { Visualizer } from './audio/Visualizer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Headphones, Settings, Upload, BarChart3 } from 'lucide-react';

const MusicPlayerContent: React.FC = () => {
  const { equalizerBands } = useAudioPlayer();
  
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
          <p className="text-muted-foreground">
            Professional music player with advanced audio processing
          </p>
          <div className="flex items-center justify-center space-x-2">
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

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="player" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6 bg-audio-surface border border-audio-control">
              <TabsTrigger value="player" className="data-[state=active]:bg-gradient-primary">
                Player
              </TabsTrigger>
              <TabsTrigger value="equalizer" className="data-[state=active]:bg-gradient-primary">
                Equalizer
              </TabsTrigger>
              <TabsTrigger value="effects" className="data-[state=active]:bg-gradient-primary">
                Effects
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-gradient-primary">
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="player" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  <FileLoader />
                  <ModeSelector />
                </div>

                {/* Center Column */}
                <div className="space-y-6">
                  <PlayerControls />
                  
                  {/* Visualizer */}
                  <Card className="p-6 bg-gradient-surface border-audio-control">
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-foreground">Audio Visualizer</h3>
                      <div className="h-32 bg-audio-track rounded-lg overflow-hidden">
                        <Visualizer
                          type="bars"
                          responsive
                          className="w-full h-full"
                          barCount={32}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4 h-20">
                        <div className="bg-audio-track rounded-lg overflow-hidden">
                          <Visualizer
                            type="wave"
                            responsive
                            className="w-full h-full"
                          />
                        </div>
                        <div className="bg-audio-track rounded-lg overflow-hidden">
                          <Visualizer
                            type="circular"
                            responsive
                            className="w-full h-full"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                  {/* Quick EQ */}
                  <Card className="p-4 bg-gradient-surface border-audio-control">
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

                  {/* Track Info */}
                  <Card className="p-4 bg-gradient-surface border-audio-control">
                    <h4 className="text-sm font-semibold text-foreground mb-3">Track Info</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Format:</span>
                        <span className="text-foreground">MP3 320kbps</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Sample Rate:</span>
                        <span className="text-foreground">44.1 kHz</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bit Depth:</span>
                        <span className="text-foreground">16-bit</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Channels:</span>
                        <span className="text-foreground">Stereo</span>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="equalizer">
              <Equalizer />
            </TabsContent>

            <TabsContent value="effects">
              <EffectsPanel />
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ModeSelector />
                <Card className="p-6 bg-gradient-surface border-audio-control">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Advanced Settings</h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Buffer Size:</span>
                      <span className="text-foreground">2048 samples</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Latency:</span>
                      <span className="text-foreground">46ms</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Audio Engine:</span>
                      <span className="text-foreground">Web Audio API</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Processing:</span>
                      <span className="text-primary">Real-time</span>
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