import { SUPABASE_URL } from '@/integrations/supabase/config';
import { invokeEdgeFunction, assertFunctionSucceeded } from '@/services/edgeFunctions';

export interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  thumbnail?: string;
  platform: string;
}

export interface ExtractResult {
  streamUrl: string;
  title: string;
  artist: string;
  thumbnail?: string;
}

export type SearchPlatform = 'youtube' | 'soundcloud' | 'spotify' | 'all';

/** Platforms the backend can actually query. */
const SUPPORTED_PLATFORMS: SearchPlatform[] = ['all', 'youtube'];

interface YoutubeSearchResponse {
  success: boolean;
  error?: string;
  results?: SearchResult[];
}

interface AudioProxyResponse {
  success: boolean;
  error?: string;
  results?: SearchResult[];
  streamUrl?: string;
  title?: string;
  artist?: string;
  thumbnail?: string;
}

export class AudioProxyService {
  /** Builds a proxied URL for cross-origin audio to bypass CORS and support Range requests. */
  static buildProxiedUrl(url: string): string {
    try {
      if (!url) return url;
      // Never proxy an already proxied URL.
      if (url.startsWith(`${SUPABASE_URL}/functions/v1/`)) return url;
      if (!this.shouldProxyUrl(url)) return url;
      return `${SUPABASE_URL}/functions/v1/audio-stream-proxy?url=${encodeURIComponent(url)}`;
    } catch {
      return url;
    }
  }

  /** Determines if a URL is cross-origin and should be proxied. */
  static shouldProxyUrl(url: string): boolean {
    try {
      if (!url) return false;
      if (url.startsWith('/')) return false; // same-origin relative
      const u = new URL(url, window.location.origin);
      return u.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  /** Search for music across platforms. */
  static async searchMusic(query: string, platform: SearchPlatform = 'all'): Promise<SearchResult[]> {
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
      throw new Error(
        `Searching ${platform} is not available - no ${platform} API credentials are configured. Use "all" or "youtube".`
      );
    }

    if (!query || !query.trim()) {
      throw new Error('Enter something to search for.');
    }

    // YouTube search uses the dedicated function.
    if (platform === 'youtube') {
      const data = await invokeEdgeFunction<YoutubeSearchResponse>('youtube-search', {
        query,
        maxResults: 20,
      });
      assertFunctionSucceeded(data);
      return data?.results ?? [];
    }

    // For 'all', merge the preview results with the YouTube results.
    const [baseResult, ytResult] = await Promise.allSettled([
      invokeEdgeFunction<AudioProxyResponse>('audio-proxy', { action: 'search', query, platform: 'all' }).then(
        (data) => {
          assertFunctionSucceeded(data);
          return data;
        }
      ),
      invokeEdgeFunction<YoutubeSearchResponse>('youtube-search', { query, maxResults: 15 }).then((data) => {
        assertFunctionSucceeded(data);
        return data;
      }),
    ]);

    const baseResults = baseResult.status === 'fulfilled' ? baseResult.value?.results ?? [] : [];
    // A missing YT_API_KEY should not break the whole search.
    const ytResults = ytResult.status === 'fulfilled' ? ytResult.value?.results ?? [] : [];

    // De-duplicate by id + platform
    const seen = new Set<string>();
    const merged: SearchResult[] = [];
    for (const arr of [baseResults, ytResults]) {
      for (const r of arr) {
        const key = `${r.platform}:${r.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(r);
        }
      }
    }

    // An empty result set plus a failure must not look like "nothing matched".
    if (!merged.length) {
      const failure = baseResult.status === 'rejected' ? baseResult.reason : ytResult.status === 'rejected' ? ytResult.reason : null;
      if (failure) {
        throw failure instanceof Error ? failure : new Error('The search backend is unavailable. Please try again later.');
      }
    }

    return merged;
  }

  /** Extract a playable audio stream URL from a direct audio URL. */
  static async extractAudioUrl(url: string): Promise<ExtractResult | null> {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) URLs can be extracted.');
    }

    const data = await invokeEdgeFunction<AudioProxyResponse>('audio-proxy', {
      action: 'extract',
      url,
    });

    if (data?.success && data.streamUrl) {
      return {
        streamUrl: data.streamUrl,
        title: data.title ?? 'Unknown Track',
        artist: data.artist ?? 'Unknown Artist',
        thumbnail: data.thumbnail,
      };
    }

    return null;
  }

  /** Check if a URL points at a platform that needs proxy extraction. */
  static needsProxy(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com|spotify\.com)/.test(url);
  }
}
