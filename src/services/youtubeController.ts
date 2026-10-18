// Lightweight YouTube IFrame API wrapper for controlling playback from our UI.
// Note: WebAudio-based effects/visualizer won't work with YouTube due to CORS and platform restrictions.

interface YTPlayerInstance {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YTPlayerOptions {
  host?: string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
}

interface YTNamespace {
  Player: new (element: HTMLElement | string, options: YTPlayerOptions) => YTPlayerInstance;
}

declare global {
  interface Window {
    YT: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type YTState = {
  ready: boolean;
  playing: boolean;
  duration: number;
  currentTime: number;
  ended: boolean;
  error: string | null;
};

/**
 * The YouTube IFrame is rendered by the <YouTubePane/> component. The id is shared so that
 * tracks started from the search bar land in the same player instance.
 */
export const YT_PLAYER_CONTAINER_ID = 'yt-player-root';

const state: YTState = {
  ready: false,
  playing: false,
  duration: 0,
  currentTime: 0,
  ended: false,
  error: null,
};

let player: YTPlayerInstance | null = null;
let apiPromise: Promise<void> | null = null;
let polling: number | null = null;
let currentVideoId: string | null = null;
let autoplayPending = false;

function loadAPI(): Promise<void> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve, reject) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load the YouTube IFrame API.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeIframeApi = 'true';
    script.addEventListener('error', () => reject(new Error('Failed to load the YouTube IFrame API.')));

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    document.head.appendChild(script);
  });

  return apiPromise;
}

/** Extracts a YouTube video id from any of the common URL shapes (or a bare id). */
export function parseVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([\w-]{6,})/i,
    /youtu\.be\/([\w-]{6,})/i,
    /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([\w-]{6,})/i,
    /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([\w-]{6,})/i,
    /(?:youtube\.com|youtube-nocookie\.com)\/live\/([\w-]{6,})/i,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1];
  }

  // A bare video id
  if (/^[\w-]{11}$/.test(value)) return value;

  return null;
}

function ensureContainer(containerId: string): HTMLElement {
  let element = document.getElementById(containerId);
  if (!element) {
    element = document.createElement('div');
    element.id = containerId;
    element.style.position = 'fixed';
    element.style.left = '-9999px';
    element.style.top = '0';
    element.style.width = '320px';
    element.style.height = '180px';
    document.body.appendChild(element);
  }
  return element;
}

function startPolling(): void {
  if (polling) window.clearInterval(polling);
  polling = window.setInterval(() => {
    if (!player || !state.ready) return;
    try {
      state.currentTime = player.getCurrentTime?.() || 0;
      const duration = player.getDuration?.();
      if (Number.isFinite(duration) && duration > 0) {
        state.duration = duration;
      }
    } catch {
      /* the player may be mid-navigation */
    }
  }, 250);
}

function createPlayer(containerId: string, videoId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const container = ensureContainer(containerId);

    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      state.error = 'The YouTube player took too long to start.';
      reject(new Error(state.error));
    }, 15000);

    try {
      player = new window.YT.Player(container, {
        host: 'https://www.youtube-nocookie.com',
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          // Ensure origin matches our page to avoid postMessage target origin warnings
          origin: window.location.origin,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            state.ready = true;
            state.error = null;
            state.ended = false;
            state.duration = player?.getDuration?.() || 0;
            startPolling();
            resolve();
          },
          onStateChange: (event) => {
            // 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
            state.playing = event?.data === 1;
            if (event?.data === 0) {
              state.ended = true;
              state.playing = false;
              state.currentTime = state.duration;
            }
            if (event?.data === 1) {
              state.ended = false;
              state.error = null;
              autoplayPending = false;
            }
            // 5 = cued -> the video is ready, start it if the caller asked for autoplay.
            if (event?.data === 5 && autoplayPending) {
              autoplayPending = false;
              try {
                player?.playVideo?.();
              } catch {
                /* ignore */
              }
            }
          },
          onError: (event) => {
            const messages: Record<number, string> = {
              '2': 'The video id is invalid.',
              '5': 'This video cannot be played in an embedded player.',
              '100': 'The video was removed or is private.',
              '101': 'The owner does not allow this video to be played embedded.',
              '150': 'The owner does not allow this video to be played embedded.',
            };
            state.error = messages[event?.data] ?? 'This YouTube video could not be played.';
            if (!settled) {
              settled = true;
              window.clearTimeout(timeout);
              reject(new Error(state.error));
            }
          },
        },
      });
    } catch (error) {
      window.clearTimeout(timeout);
      settled = true;
      state.error = 'The YouTube player could not be created.';
      reject(error instanceof Error ? error : new Error(state.error));
    }
  });
}

export const YouTubeController = {
  isYouTubeUrl(url?: string | null): boolean {
    if (!url) return false;
    return /(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/i.test(url);
  },

  parseVideoId,

  async load(containerId: string, urlOrId: string, autoplay = true): Promise<void> {
    state.error = null;
    state.ended = false;
    autoplayPending = autoplay;

    const id = parseVideoId(urlOrId);
    if (!id) {
      state.error = 'That does not look like a valid YouTube URL.';
      throw new Error(state.error);
    }

    await loadAPI();

    if (player && state.ready) {
      currentVideoId = id;
      state.currentTime = 0;
      state.duration = 0;
      state.ended = false;
      try {
        player.loadVideoById(id);
      } catch (error) {
        state.error = 'The YouTube player could not load this video.';
        throw error instanceof Error ? error : new Error(state.error);
      }
      return;
    }

    currentVideoId = id;
    await createPlayer(containerId, id);
  },

  play() {
    try {
      player?.playVideo?.();
    } catch {
      /* ignore */
    }
  },

  pause() {
    try {
      player?.pauseVideo?.();
    } catch {
      /* ignore */
    }
  },

  stop() {
    try {
      player?.stopVideo?.();
    } catch {
      /* ignore */
    }
    state.currentTime = 0;
    state.playing = false;
    state.ended = false;
  },

  seekTo(time: number) {
    try {
      player?.seekTo?.(Math.max(0, time), true);
    } catch {
      /* ignore */
    }
    state.currentTime = Math.max(0, time);
  },

  setVolume(volume0to1: number) {
    try {
      player?.setVolume?.(Math.round(Math.max(0, Math.min(1, volume0to1)) * 100));
    } catch {
      /* ignore */
    }
  },

  getCurrentVideoId(): string | null {
    return currentVideoId;
  },

  getState(): YTState {
    return { ...state };
  },

  dispose() {
    if (polling) {
      window.clearInterval(polling);
      polling = null;
    }
    try {
      player?.destroy?.();
    } catch {
      /* ignore */
    }
    player = null;
    state.ready = false;
    state.playing = false;
    state.duration = 0;
    state.currentTime = 0;
    state.ended = false;
  },
};
