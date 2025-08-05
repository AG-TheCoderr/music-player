// Media Session API service for mobile notifications and lock screen controls
interface Track {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  duration: number;
}

interface MediaSessionCallbacks {
  onPlay: () => void;
  onPause: () => void;
  onNextTrack: () => void;
  onPreviousTrack: () => void;
  onSeek: (time: number) => void;
}

export class MediaSessionService {
  private static isSupported(): boolean {
    return 'mediaSession' in navigator;
  }

  static setupMediaSession(track: Track, callbacks: MediaSessionCallbacks): void {
    if (!this.isSupported()) {
      console.warn('Media Session API not supported');
      return;
    }

    // Set metadata
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: 'Sonic Studio Pro',
      artwork: track.artwork ? [
        {
          src: track.artwork,
          sizes: '512x512',
          type: 'image/jpeg'
        },
        {
          src: track.artwork,
          sizes: '256x256',
          type: 'image/jpeg'
        }
      ] : [
        {
          src: '/placeholder.svg',
          sizes: '512x512',
          type: 'image/svg+xml'
        }
      ]
    });

    // Set up action handlers
    navigator.mediaSession.setActionHandler('play', callbacks.onPlay);
    navigator.mediaSession.setActionHandler('pause', callbacks.onPause);
    navigator.mediaSession.setActionHandler('nexttrack', callbacks.onNextTrack);
    navigator.mediaSession.setActionHandler('previoustrack', callbacks.onPreviousTrack);
    
    // Seek actions
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        callbacks.onSeek(details.seekTime);
      }
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10;
      callbacks.onSeek(skipTime);
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10;
      callbacks.onSeek(-skipTime);
    });
  }

  static updatePlaybackState(state: 'playing' | 'paused' | 'none'): void {
    if (!this.isSupported()) return;
    
    navigator.mediaSession.playbackState = state;
  }

  static updatePosition(currentTime: number, duration: number, playbackRate = 1): void {
    if (!this.isSupported()) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: playbackRate,
        position: currentTime
      });
    } catch (error) {
      console.warn('Failed to set position state:', error);
    }
  }

  static clearSession(): void {
    if (!this.isSupported()) return;

    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    
    // Clear all action handlers
    const actions: MediaSessionAction[] = [
      'play', 'pause', 'nexttrack', 'previoustrack', 
      'seekto', 'seekforward', 'seekbackward'
    ];
    
    actions.forEach(action => {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch (error) {
        // Some browsers might not support all actions
      }
    });
  }
}