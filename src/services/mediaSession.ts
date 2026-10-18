// Media Session API service for mobile notifications and lock screen controls
export interface MediaSessionTrack {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  duration: number;
}

export interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  /** Absolute position in seconds. */
  onSeekTo: (time: number) => void;
  /** Relative offset in seconds (negative seeks backwards). */
  onSeekBy: (delta: number) => void;
}

export class MediaSessionService {
  private static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  }

  /** Installs the OS-level transport controls. Safe to call repeatedly. */
  static setupHandlers(callbacks: MediaSessionCallbacks): void {
    if (!this.isSupported()) return;

    const safely = (handler: MediaSessionActionHandler | null) => {
      try {
        navigator.mediaSession.setActionHandler('play', handler);
        navigator.mediaSession.setActionHandler('pause', handler);
        navigator.mediaSession.setActionHandler('nexttrack', handler);
        navigator.mediaSession.setActionHandler('previoustrack', handler);
        navigator.mediaSession.setActionHandler('seekto', handler);
        navigator.mediaSession.setActionHandler('seekforward', handler);
        navigator.mediaSession.setActionHandler('seekbackward', handler);
      } catch {
        /* Some browsers do not support every action. */
      }
    };

    try {
      navigator.mediaSession.setActionHandler('play', callbacks.onPlay);
      navigator.mediaSession.setActionHandler('pause', callbacks.onPause);
      navigator.mediaSession.setActionHandler('nexttrack', callbacks.onNextTrack);
      navigator.mediaSession.setActionHandler('previoustrack', callbacks.onPreviousTrack);

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          callbacks.onSeekTo(details.seekTime);
        }
      });

      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        callbacks.onSeekBy(details.seekOffset || 10);
      });

      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        callbacks.onSeekBy(-(details.seekOffset || 10));
      });
    } catch (error) {
      console.warn('Failed to set media session handlers:', error);
      safely(null);
    }
  }

  /** Publishes the currently loaded track to the OS. */
  static updateMetadata(track: MediaSessionTrack): void {
    if (!this.isSupported()) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: 'Sonic Studio Pro',
        artwork: track.artwork
          ? [
              { src: track.artwork, sizes: '512x512', type: 'image/jpeg' },
              { src: track.artwork, sizes: '256x256', type: 'image/jpeg' },
            ]
          : [{ src: '/placeholder.svg', sizes: '512x512', type: 'image/svg+xml' }],
      });
    } catch (error) {
      console.warn('Failed to update media session metadata:', error);
    }
  }

  static updatePlaybackState(state: 'playing' | 'paused' | 'none'): void {
    if (!this.isSupported()) return;
    navigator.mediaSession.playbackState = state;
  }

  static updatePosition(currentTime: number, duration: number, playbackRate = 1): void {
    if (!this.isSupported()) return;
    if (!Number.isFinite(duration) || duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate,
        position: Math.max(0, currentTime),
      });
    } catch {
      // setPositionState throws while the media is not seekable - ignore silently.
    }
  }

  static clearSession(): void {
    if (!this.isSupported()) return;

    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';

    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'nexttrack',
      'previoustrack',
      'seekto',
      'seekforward',
      'seekbackward',
    ];

    actions.forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        /* ignore unsupported actions */
      }
    });
  }
}
