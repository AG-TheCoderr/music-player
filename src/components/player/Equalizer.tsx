import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePlayerActions, usePlayerSelector } from '../audio/playerContext';
import {
  EQ_BAND_FREQUENCIES,
  EQ_MAX_Q,
  EQ_MIN_Q,
  EQ_PRESET_LABELS,
  EQ_RANGE_OPTIONS,
  formatBandFrequency,
} from '../audio/equalizer';

const formatGain = (gain: number): string => `${gain > 0 ? '+' : ''}${gain.toFixed(1)} dB`;

export const Equalizer: React.FC = () => {
  const { setEqualizerBand, setEqualizerPreset, setEqualizerRange, setEqualizerWidth } = usePlayerActions();
  const bands = usePlayerSelector((state) => state.equalizerBands);
  const preset = usePlayerSelector((state) => state.equalizerPreset);
  const range = usePlayerSelector((state) => state.equalizerRange);
  const width = usePlayerSelector((state) => state.equalizerWidth);

  return (
    <Card className="p-6 bg-gradient-surface border-audio-control">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="text-lg font-semibold text-foreground">Equalizer</h3>
          <div className="flex items-center gap-2">
            <Select value={preset} onValueChange={setEqualizerPreset}>
              <SelectTrigger className="w-44 bg-audio-control border-border" aria-label="Preset">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EQ_PRESET_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
                {preset === 'custom' && <SelectItem value="custom">Custom</SelectItem>}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEqualizerPreset('flat')}
              className="bg-audio-control border-border hover:bg-audio-active"
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="text-sm text-muted-foreground" id="eq-range-label">
              Gain range
            </span>
            <div className="flex gap-2" role="radiogroup" aria-labelledby="eq-range-label">
              {EQ_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option}
                  role="radio"
                  aria-checked={range === option}
                  variant={range === option ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEqualizerRange(option)}
                  className={range === option ? '' : 'bg-audio-control border-border hover:bg-audio-active'}
                >
                  ±{option} dB
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground" id="eq-width-label">
                Bandwidth (Q)
              </span>
              <span className="text-foreground tabular-nums">{width.toFixed(2)}</span>
            </div>
            <Slider
              min={EQ_MIN_Q}
              max={EQ_MAX_Q}
              step={0.05}
              value={[width]}
              onValueChange={(value) => setEqualizerWidth(value[0])}
              aria-labelledby="eq-width-label"
              thumbAriaLabel="Bandwidth"
              thumbAriaValueText={`Q ${width.toFixed(2)}`}
            />
            <p className="text-xs text-muted-foreground">Lower Q makes each band wider and smoother.</p>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-1.5">
            {EQ_BAND_FREQUENCIES.map((frequency, index) => {
              const gain = bands[index] ?? 0;
              const label = formatBandFrequency(frequency);
              return (
                <div key={frequency} className="flex w-7 flex-col items-center gap-2" title={`${label}: ${formatGain(gain)}`}>
                  <div className="flex h-44 items-center">
                    <Slider
                      orientation="vertical"
                      value={[gain]}
                      min={-range}
                      max={range}
                      step={0.5}
                      onValueChange={(value) => setEqualizerBand(index, value[0])}
                      thumbAriaLabel={`${label} gain`}
                      thumbAriaValueText={formatGain(gain)}
                      className="h-full"
                    />
                  </div>
                  <span className="text-[10px] leading-none text-muted-foreground whitespace-nowrap rotate-[-45deg] origin-top-left translate-y-3">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gain per band, drawn from the real values. */}
        <div className="flex h-16 items-end gap-0.5 rounded-lg bg-audio-track p-2" aria-hidden="true">
          {bands.map((gain, index) => {
            const height = Math.max(2, ((gain + range) / (2 * range)) * 100);
            return (
              <div
                key={EQ_BAND_FREQUENCIES[index]}
                className="flex-1 rounded-sm bg-gradient-primary"
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>
      </div>
    </Card>
  );
};
