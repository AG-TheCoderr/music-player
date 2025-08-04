import React from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';

export const EffectsPanel: React.FC = () => {
  const { effects, updateEffects } = useAudioPlayer();

  const updateReverb = (key: keyof typeof effects.reverb, value: number) => {
    updateEffects({
      reverb: {
        ...effects.reverb,
        [key]: value
      }
    });
  };

  const updateChorus = (key: keyof typeof effects.chorus, value: number) => {
    updateEffects({
      chorus: {
        ...effects.chorus,
        [key]: value
      }
    });
  };

  const updateDistortion = (key: keyof typeof effects.distortion, value: number) => {
    updateEffects({
      distortion: {
        ...effects.distortion,
        [key]: value
      }
    });
  };

  const updateCompressor = (key: keyof typeof effects.compressor, value: number) => {
    updateEffects({
      compressor: {
        ...effects.compressor,
        [key]: value
      }
    });
  };

  return (
    <Card className="p-6 bg-gradient-surface border-audio-control">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Audio Effects</h3>
          <Badge variant="outline" className="bg-audio-control">
            Professional
          </Badge>
        </div>

        <Tabs defaultValue="reverb" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-audio-control">
            <TabsTrigger value="reverb">Reverb</TabsTrigger>
            <TabsTrigger value="chorus">Chorus</TabsTrigger>
            <TabsTrigger value="distortion">Distortion</TabsTrigger>
            <TabsTrigger value="compressor">Compressor</TabsTrigger>
          </TabsList>

          <TabsContent value="reverb" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Room Size</Label>
                <Slider
                  value={[effects.reverb.roomSize]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateReverb('roomSize', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.reverb.roomSize * 100)}%
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Damping</Label>
                <Slider
                  value={[effects.reverb.damping]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateReverb('damping', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.reverb.damping * 100)}%
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Wet Level</Label>
                <Slider
                  value={[effects.reverb.wetLevel]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateReverb('wetLevel', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.reverb.wetLevel * 100)}%
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Dry Level</Label>
                <Slider
                  value={[effects.reverb.dryLevel]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateReverb('dryLevel', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.reverb.dryLevel * 100)}%
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="chorus" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Rate</Label>
                <Slider
                  value={[effects.chorus.rate]}
                  min={0.1}
                  max={10}
                  step={0.1}
                  onValueChange={([value]) => updateChorus('rate', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {effects.chorus.rate.toFixed(1)} Hz
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Depth</Label>
                <Slider
                  value={[effects.chorus.depth]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateChorus('depth', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.chorus.depth * 100)}%
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Feedback</Label>
                <Slider
                  value={[effects.chorus.feedback]}
                  min={0}
                  max={0.9}
                  step={0.01}
                  onValueChange={([value]) => updateChorus('feedback', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.chorus.feedback * 100)}%
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Wet Level</Label>
                <Slider
                  value={[effects.chorus.wetLevel]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateChorus('wetLevel', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(effects.chorus.wetLevel * 100)}%
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="distortion" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Drive Amount</Label>
                <Slider
                  value={[effects.distortion.amount]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([value]) => updateDistortion('amount', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {effects.distortion.amount}%
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Oversampling</Label>
                <div className="flex space-x-2">
                  {['none', '2x', '4x'].map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        updateEffects({
                          distortion: {
                            ...effects.distortion,
                            oversample: option as OverSampleType
                          }
                        });
                      }}
                      className={`px-3 py-1 rounded text-xs transition-smooth ${
                        effects.distortion.oversample === option
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-audio-control text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compressor" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm text-foreground">Threshold</Label>
                <Slider
                  value={[effects.compressor.threshold]}
                  min={-100}
                  max={0}
                  step={1}
                  onValueChange={([value]) => updateCompressor('threshold', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {effects.compressor.threshold} dB
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Ratio</Label>
                <Slider
                  value={[effects.compressor.ratio]}
                  min={1}
                  max={20}
                  step={0.1}
                  onValueChange={([value]) => updateCompressor('ratio', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {effects.compressor.ratio.toFixed(1)}:1
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Attack</Label>
                <Slider
                  value={[effects.compressor.attack]}
                  min={0}
                  max={1}
                  step={0.001}
                  onValueChange={([value]) => updateCompressor('attack', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {(effects.compressor.attack * 1000).toFixed(1)} ms
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Release</Label>
                <Slider
                  value={[effects.compressor.release]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={([value]) => updateCompressor('release', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {(effects.compressor.release * 1000).toFixed(0)} ms
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm text-foreground">Knee</Label>
                <Slider
                  value={[effects.compressor.knee]}
                  min={0}
                  max={40}
                  step={1}
                  onValueChange={([value]) => updateCompressor('knee', value)}
                  className="w-full"
                />
                <div className="text-xs text-muted-foreground text-center">
                  {effects.compressor.knee} dB
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  );
};