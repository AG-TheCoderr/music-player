import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mic, Music2, Volume2, Zap } from 'lucide-react';
import { useAudioPlayer } from '../audio/AudioPlayerProvider';
import { cn } from '@/lib/utils';

const modes = [
  {
    id: 'normal' as const,
    name: 'Normal',
    description: 'Balanced audio for all content',
    icon: Volume2,
    color: 'text-blue-400'
  },
  {
    id: 'vocal-enhance' as const,
    name: 'Vocal Enhance',
    description: 'Optimize for clear vocals',
    icon: Mic,
    color: 'text-green-400'
  },
  {
    id: 'instrument-focus' as const,
    name: 'Instrument Focus',
    description: 'Highlight instruments and separation',
    icon: Music2,
    color: 'text-purple-400'
  },
  {
    id: 'bass-boost' as const,
    name: 'Bass Boost',
    description: 'Enhanced low-end frequencies',
    icon: Zap,
    color: 'text-red-400'
  }
];

export const ModeSelector: React.FC = () => {
  const { mode, setMode } = useAudioPlayer();

  return (
    <Card className="p-6 bg-gradient-surface border-audio-control">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Audio Mode</h3>
          <Badge variant="outline" className="bg-audio-control">
            {modes.find(m => m.id === mode)?.name}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modes.map((modeOption) => {
            const Icon = modeOption.icon;
            const isActive = mode === modeOption.id;

            return (
              <Button
                key={modeOption.id}
                variant={isActive ? "default" : "outline"}
                onClick={() => setMode(modeOption.id)}
                className={cn(
                  "h-auto p-4 justify-start transition-bounce",
                  isActive
                    ? "bg-gradient-primary border-primary shadow-glow"
                    : "bg-audio-control border-border hover:bg-audio-active hover:border-primary/50"
                )}
              >
                <div className="flex items-start space-x-3 w-full">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isActive 
                      ? "bg-white/20" 
                      : "bg-primary/20"
                  )}>
                    <Icon className={cn(
                      "w-5 h-5",
                      isActive ? "text-white" : modeOption.color
                    )} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className={cn(
                      "font-medium",
                      isActive ? "text-white" : "text-foreground"
                    )}>
                      {modeOption.name}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isActive ? "text-white/80" : "text-muted-foreground"
                    )}>
                      {modeOption.description}
                    </div>
                  </div>
                </div>
              </Button>
            );
          })}
        </div>

        {/* Mode-specific info */}
        {mode !== 'normal' && (
          <div className="mt-4 p-3 bg-audio-track rounded-lg border border-primary/20">
            <div className="text-sm text-muted-foreground">
              <strong className="text-primary">Active:</strong>{' '}
              {modes.find(m => m.id === mode)?.description}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};