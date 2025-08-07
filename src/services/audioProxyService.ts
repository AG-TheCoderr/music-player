import { supabase } from '@/integrations/supabase/client';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  thumbnail?: string;
  platform: string;
}

interface ExtractResult {
  streamUrl: string;
  title: string;
  artist: string;
  thumbnail?: string;
}

export class AudioProxyService {
  // Search for music across platforms
  static async searchMusic(query: string, platform: 'youtube' | 'soundcloud' | 'spotify' | 'all' = 'all'): Promise<SearchResult[]> {
    try {
      const { data, error } = await supabase.functions.invoke('audio-proxy', {
        body: {
          action: 'search',
          query,
          platform
        }
      });

      if (error) {
        console.error('Search error:', error);
        return [];
      }

      return data.results || [];
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  // Extract audio stream URL from various platforms
  static async extractAudioUrl(url: string): Promise<ExtractResult | null> {
    try {
      const { data, error } = await supabase.functions.invoke('audio-proxy', {
        body: {
          action: 'extract',
          url
        }
      });

      if (error) {
        console.error('Extract error:', error);
        return null;
      }

      if (data.success) {
        return {
          streamUrl: data.streamUrl,
          title: data.title,
          artist: data.artist,
          thumbnail: data.thumbnail
        };
      }

      return null;
    } catch (error) {
      console.error('Extract failed:', error);
      return null;
    }
  }

  // Check if URL needs proxy extraction
  static needsProxy(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com|spotify\.com)/.test(url);
  }
}