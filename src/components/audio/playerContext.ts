/**
 * The public API of the player store.
 *
 * The contexts and the hooks live here instead of in the provider component so that the
 * provider file only exports a component - which keeps the fast refresh working while a
 * component is edited.
 */
import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import { AudioPlayerActions, AudioPlayerState, PlayerStore, shallowEqual } from './playerStore';

export const PlayerStoreContext = createContext<PlayerStore | null>(null);
export const PlayerActionsContext = createContext<AudioPlayerActions | null>(null);

/** Returns the underlying store. */
export const usePlayerStore = (): PlayerStore => {
  const store = useContext(PlayerStoreContext);
  if (!store) throw new Error('usePlayerStore must be used within an AudioPlayerProvider');
  return store;
};

/**
 * Subscribes to a slice of the player state.
 *
 * The returned value keeps its identity while the selected slice is unchanged, so components
 * only re-render when the data they actually use changes - not on every playback tick.
 */
export function usePlayerSelector<T>(
  selector: (state: AudioPlayerState) => T,
  isEqual: (a: T, b: T) => boolean = shallowEqual
): T {
  const store = usePlayerStore();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const cache = useRef<{ value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const next = selectorRef.current(store.getState());
    const previous = cache.current;
    if (previous && isEqualRef.current(previous.value, next)) {
      return previous.value;
    }
    cache.current = { value: next };
    return next;
  }, [store]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Returns the stable action object. Actions never change identity, so this never re-renders. */
export const usePlayerActions = (): AudioPlayerActions => {
  const actions = useContext(PlayerActionsContext);
  if (!actions) throw new Error('usePlayerActions must be used within an AudioPlayerProvider');
  return actions;
};
