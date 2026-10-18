import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';

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

    try {
      // Use the dedicated YouTube function when explicitly searching YouTube
      if (platform === 'youtube') {
        const { data, error } = await supabase.functions.invoke('youtube-search', {
          body: { query, maxResults: 20 },
        });
        if (error) {
          throw new Error(this.describeFunctionError(error, 'YouTube search'));
        }
        return (data?.results as SearchResult[]) ?? [];
      }

      // For 'all', merge the preview results with YouTube results.
      const [baseRes, ytRes] = await Promise.all([
        supabase.functions.invoke('audio-proxy', { body: { action: 'search', query, platform: 'all' } }),
        supabase.functions.invoke('youtube-search', { body: { query, maxResults: 15 } }),
      ]);

      const baseResults = (baseRes.data?.results as SearchResult[]) ?? [];
      const ytResults = ytRes.error ? [] : ((ytRes.data?.results as SearchResult[]) ?? []);

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
      return merged;
    } catch (error) {
      if (error instanceof Error) throw error;
      console.error('Search failed:', error);
      throw new Error('The search backend is unavailable. Please try again later.');
    }
  }

  /** Extract a playable audio stream URL from a direct audio URL. */
  static async extractAudioUrl(url: string): Promise<ExtractResult | null> {
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('Only http(s) URLs can be extracted.');
    }

    try {
      const { data, error } = await supabase.functions.invoke('audio-proxy', {
        body: { action: 'extract', url },
      });

      if (error) {
        throw new Error(this.describeFunctionError(error, 'Extraction'));
      }

      if (data?.success && data.streamUrl) {
        return {
          streamUrl: data.streamUrl,
          title: data.title,
          artist: data.artist,
          thumbnail: data.thumbnail,
        };
      }

      return null;
    } catch (error) {
      if (error instanceof Error) throw error;
      console.error('Extract failed:', error);
      throw new Error('The audio could not be extracted.');
    }
  }

  /** Check if a URL points at a platform that needs proxy extraction. */
  static needsProxy(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com|spotify\.com)/.test(url);
  }

  /** Turns a Supabase function error into something a user can act on. */
  private static describeFunctionError(error: unknown, action: string): string {
    const raw = typeof error === 'object' && error !== null ? JSON.stringify(error) : String(error);

    if (/YT_API_KEY/i.test(raw)) {
      return `${action} is unavailable: the backend is missing the YT_API_KEY secret.`;
    }
    if (/not supported|unsupported/i.test(raw)) {
      return `${action} is not supported for this source.`;
    }
    if (/Failed to fetch|NetworkError|fetch failed/i.test(raw)) {
      return `${action} failed: the backend could not be reached.`;
    }

    return `${action} failed. Please try again.`;
  }
}
