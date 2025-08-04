import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';

const frequencies = ['32Hz', '64Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'];

const presets = {
  flat: 'Flat',
  rock: 'Rock',
  pop: 'Pop',
  jazz: 'Jazz',
  classical: 'Classical',
  electronic: 'Electronic',
  'bass-boost': 'Bass Boost',
  'vocal-enhance': 'Vocal Enhance'
};

export const Equalizer: React.FC = () => {
  const { equalizerBands, setEqualizerBand, setEqualizerPreset } = useAudioPlayer();

  const handleBandChange = (index: number, value: number[]) => {
    setEqualizerBand(index, value[0]);
  };

  const handlePresetChange = (preset: string) => {
    setEqualizerPreset(preset);
  };

  const resetEqualizer = () => {
    setEqualizerPreset('flat');
  };

  return (
    <Card className="p-6 bg-gradient-surface border-audio-control">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Equalizer</h3>
          <div className="flex items-center space-x-2">
            <Select onValueChange={handlePresetChange}>
              <SelectTrigger className="w-32 bg-audio-control border-border">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(presets).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={resetEqualizer}
              className="bg-audio-control border-border hover:bg-audio-active"
            >
              Reset
            </Button>
          </div>
        </div>

        {/* EQ Bands */}
        <div className="grid grid-cols-5 lg:grid-cols-10 gap-4">
          {frequencies.map((freq, index) => (
            <div key={freq} className="flex flex-col items-center space-y-3">
              <div className="h-32 flex items-end">
                <Slider
                  orientation="vertical"
                  value={[equalizerBands[index]]}
                  min={-12}
                  max={12}
                  step={0.5}
                  onValueChange={(value) => handleBandChange(index, value)}
                  className="h-full"
                />
              </div>
              <div className="text-center">
                <div className="text-xs font-medium text-foreground">{freq}</div>
                <div className="text-[10px] text-muted-foreground">
                  {equalizerBands[index] > 0 ? '+' : ''}{equalizerBands[index].toFixed(1)}dB
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Visual EQ Display */}
        <div className="flex items-end justify-between h-16 bg-audio-track rounded-lg p-2">
          {equalizerBands.map((gain, index) => {
            const height = Math.max(2, ((gain + 12) / 24) * 100);
            return (
              <div
                key={index}
                className="bg-gradient-primary rounded-sm transition-all duration-300 animate-equalizer"
                style={{
                  width: `${100 / equalizerBands.length - 1}%`,
                  height: `${height}%`,
                  animationDelay: `${index * 100}ms`
                }}
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
};