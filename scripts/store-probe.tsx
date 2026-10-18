import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  AudioPlayerProvider,
  usePlayerActions,
  usePlayerSelector,
  usePlayerStore,
} from '../src/components/audio/AudioPlayerProvider';

export const renders = {
  time: 0,
  volume: 0,
  actions: 0,
  provider: 0,
};

const TimeProbe = () => {
  renders.time++;
  const time = usePlayerSelector((state) => state.currentTime);
  return <span data-testid="time">{time}</span>;
};

const VolumeProbe = () => {
  renders.volume++;
  const volume = usePlayerSelector((state) => state.volume);
  return <span data-testid="volume">{volume}</span>;
};

const ActionsProbe = () => {
  renders.actions++;
  const actions = usePlayerActions();
  return <span data-testid="actions">{typeof actions.play}</span>;
};

const StoreProbe = () => {
  const store = usePlayerStore();
  (window as unknown as { __store: typeof store }).__store = store;
  return null;
};

export const App = () => {
  renders.provider++;
  return (
    <AudioPlayerProvider>
      <StoreProbe />
      <TimeProbe />
      <VolumeProbe />
      <ActionsProbe />
    </AudioPlayerProvider>
  );
};

/** Mounts the probes. React and react-dom are bundled together on purpose. */
export function mount(container: HTMLElement): void {
  createRoot(container).render(<App />);
}
