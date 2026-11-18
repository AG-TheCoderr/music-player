import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Keyboard, X } from 'lucide-react';
import { usePlayerActions, usePlayerSelector } from '../audio/playerContext';

interface KeyboardShortcutsProps {
  /** Currently active tab, so the number keys can switch tabs. */
  tab: string;
  onTabChange: (tab: string) => void;
}

const TABS = ['player', 'equalizer', 'effects', 'youtube', 'settings'];

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: 'Space / K', description: 'Play or pause' },
  { keys: '← / →', description: 'Seek 5 seconds' },
  { keys: 'J / L', description: 'Seek 10 seconds' },
  { keys: '↑ / ↓', description: 'Volume up / down' },
  { keys: 'M', description: 'Mute' },
  { keys: 'S', description: 'Toggle shuffle' },
  { keys: 'R', description: 'Cycle repeat mode' },
  { keys: 'N / P', description: 'Next / previous track' },
  { keys: '1 – 5', description: 'Switch tab' },
  { keys: '?', description: 'Show or hide this help' },
];

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable ||
    target.getAttribute('role') === 'textbox'
  );
};

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ tab, onTabChange }) => {
  const { play, pause, seekTo, setVolume, toggleShuffle, toggleRepeat, nextTrack, previousTrack } =
    usePlayerActions();

  const isPlaying = usePlayerSelector((state) => state.isPlaying);
  const volume = usePlayerSelector((state) => state.volume);
  const currentTime = usePlayerSelector((state) => state.currentTime);
  const duration = usePlayerSelector((state) => state.duration);

  const [showHelp, setShowHelp] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // The key handler is registered once. The values it needs are read from a ref so the listener
  // does not have to be torn down and re-added ten times a second while the track plays.
  const latest = useRef({ currentTime, volume, isPlaying, showHelp });
  const lastAudibleVolume = useRef<number | null>(null);

  useEffect(() => {
    latest.current = { currentTime, volume, isPlaying, showHelp };
  }, [currentTime, volume, isPlaying, showHelp]);

  const toggleHelp = useCallback(() => {
    setShowHelp((previous) => !previous);
  }, []);

  useEffect(() => {
    if (showHelp) {
      closeButtonRef.current?.focus();
    }
  }, [showHelp]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key;
      const { currentTime: time, volume: level, isPlaying: playing, showHelp: helpOpen } = latest.current;

      if (key === 'Escape' && helpOpen) {
        event.preventDefault();
        setShowHelp(false);
        return;
      }

      switch (key) {
        case ' ':
        case 'k':
        case 'K': {
          event.preventDefault();
          if (playing) pause();
          else play();
          return;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          seekTo(time - 5);
          return;
        }
        case 'ArrowRight': {
          event.preventDefault();
          seekTo(time + 5);
          return;
        }
        case 'j':
        case 'J': {
          event.preventDefault();
          seekTo(time - 10);
          return;
        }
        case 'l':
        case 'L': {
          event.preventDefault();
          seekTo(time + 10);
          return;
        }
        case 'ArrowUp': {
          event.preventDefault();
          setVolume(Math.min(1, level + 0.05));
          return;
        }
        case 'ArrowDown': {
          event.preventDefault();
          setVolume(Math.max(0, level - 0.05));
          return;
        }
        case 'm':
        case 'M': {
          event.preventDefault();
          if (level > 0) {
            // Remember the audible level so unmute restores it.
            lastAudibleVolume.current = level;
            setVolume(0);
          } else {
            setVolume(lastAudibleVolume.current ?? 0.7);
          }
          return;
        }
        case 's':
        case 'S': {
          event.preventDefault();
          toggleShuffle();
          return;
        }
        case 'r':
        case 'R': {
          event.preventDefault();
          toggleRepeat();
          return;
        }
        case 'n':
        case 'N': {
          event.preventDefault();
          nextTrack();
          return;
        }
        case 'p':
        case 'P': {
          event.preventDefault();
          previousTrack();
          return;
        }
        case '?': {
          event.preventDefault();
          toggleHelp();
          return;
        }
        default:
          break;
      }

      // Number keys switch tabs.
      const index = Number(key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < TABS.length) {
        event.preventDefault();
        onTabChange(TABS[index]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextTrack, onTabChange, pause, play, previousTrack, seekTo, setVolume, toggleHelp, toggleRepeat, toggleShuffle]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleHelp}
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts (?)"
        className="text-muted-foreground hover:text-foreground"
      >
        <Keyboard className="w-4 h-4" />
        <span className="hidden sm:inline">Shortcuts</span>
      </Button>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowHelp(false)}
        >
          <Card
            className="w-full max-w-md p-6 bg-gradient-surface border-audio-control space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-primary" />
                Keyboard shortcuts
              </h2>
              <Button
                ref={closeButtonRef}
                variant="ghost"
                size="icon"
                onClick={() => setShowHelp(false)}
                aria-label="Close shortcuts"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <dl className="space-y-2">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-muted-foreground">{shortcut.description}</dt>
                  <dd>
                    <kbd className="rounded border border-border bg-audio-control px-2 py-0.5 font-mono text-xs text-foreground">
                      {shortcut.keys}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="text-xs text-muted-foreground">
              Shortcuts are ignored while you are typing in a field.
            </p>
          </Card>
        </div>
      )}
    </>
  );
};
