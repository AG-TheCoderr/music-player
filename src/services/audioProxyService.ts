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

interface AudioProxyResponse {
  success: boolean;
  error?: string;
  results?: SearchResult[];
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

  /** Searches the catalogue (iTunes previews) through the audio-proxy function. */
  static async searchMusic(query: string): Promise<SearchResult[]> {
    if (!query || !query.trim()) {
      throw new Error('Enter something to search for.');
    }

    const data = await invokeEdgeFunction<AudioProxyResponse>('audio-proxy', {
      action: 'search',
      query: query.trim(),
      platform: 'all',
    });
    assertFunctionSucceeded(data);

    // De-duplicate by platform and id.
    const seen = new Set<string>();
    const results: SearchResult[] = [];
    for (const result of data?.results ?? []) {
      const key = `${result.platform}:${result.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(result);
      }
    }
    return results;
  }
}
