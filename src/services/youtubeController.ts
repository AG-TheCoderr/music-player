// Lightweight YouTube IFrame API wrapper for controlling playback from our UI
// Note: WebAudio-based effects/visualizer won't work with YouTube due to CORS and platform restrictions.

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTState = {
  ready: boolean;
  playing: boolean;
  duration: number;
  currentTime: number;
};

const state: YTState = { ready: false, playing: false, duration: 0, currentTime: 0 };
let player: any | null = null;
let apiLoaded = false;
let polling: number | null = null;

function loadAPI(): Promise<void> {
  if (apiLoaded) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const script = document.createElement('script');
  // Load official IFrame API
  script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });
}

function parseVideoId(input: string): string | null {
  const match = input.match(/(?:v=|\/?watch\?v=|youtu\.be\/|embed\/)([^&\n?#]+)/);
  return match ? match[1] : null;
}

function ensurePlayer(containerId: string, videoId: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (player) {
      try {
        player.loadVideoById(videoId);
      } catch {}
      return resolve();
    }

    player = new window.YT.Player(containerId, {
      host: 'https://www.youtube-nocookie.com',
      videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        rel: 0,
        modestbranding: 1,
    // Ensure origin matches our page to avoid postMessage target origin warnings
    origin: window.location.origin,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          state.ready = true;
          state.duration = player.getDuration?.() || 0;
          resolve();
        },
        onStateChange: (e: any) => {
          // 1 = playing, 2 = paused, 0 = ended
          state.playing = e.data === 1;
        }
      }
    });

    if (polling) window.clearInterval(polling);
    polling = window.setInterval(() => {
      if (player && state.ready) {
        try {
          state.currentTime = player.getCurrentTime?.() || 0;
          state.duration = player.getDuration?.() || state.duration;
        } catch {}
      }
    }, 250);
  });
}

export const YouTubeController = {
  isYouTubeUrl(url?: string | null): boolean {
    if (!url) return false;
    return /(?:youtube\.com|youtu\.be)/i.test(url);
  },

  async load(containerId: string, urlOrId: string): Promise<void> {
    await loadAPI();
    const id = parseVideoId(urlOrId) || urlOrId;
    if (!id) throw new Error('Invalid YouTube URL');
    await ensurePlayer(containerId, id);
  },

  play() { try { player?.playVideo?.(); } catch {} },
  pause() { try { player?.pauseVideo?.(); } catch {} },
  seekTo(time: number) { try { player?.seekTo?.(time, true); } catch {} },
  setVolume(volume0to1: number) { try { player?.setVolume?.(Math.round(volume0to1 * 100)); } catch {} },

  getState(): YTState { return { ...state }; },
};
