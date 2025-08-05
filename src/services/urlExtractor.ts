// URL extraction service for YouTube Music and SoundCloud
// Uses CORS proxies to bypass browser restrictions

interface ExtractedTrack {
  title: string;
  artist: string;
  streamUrl: string;
  artwork?: string;
  duration?: number;
}

// CORS proxy services (fallback options)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://cors-anywhere.herokuapp.com/'
];

export class URLExtractor {
  private static async fetchWithCORS(url: string, proxyIndex = 0): Promise<string> {
    if (proxyIndex >= CORS_PROXIES.length) {
      throw new Error('All CORS proxies failed');
    }

    try {
      const proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(url);
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      console.warn(`CORS proxy ${proxyIndex} failed:`, error);
      return this.fetchWithCORS(url, proxyIndex + 1);
    }
  }

  static isYouTubeMusic(url: string): boolean {
    return /(?:music\.youtube\.com|youtu\.be|youtube\.com)/.test(url) && 
           (/watch\?v=|playlist\?list=|music\.youtube\.com/.test(url));
  }

  static isSoundCloud(url: string): boolean {
    return /soundcloud\.com/.test(url);
  }

  static async extractYouTubeMusic(url: string): Promise<ExtractedTrack> {
    try {
      // Simple extraction - in production, you'd want more robust parsing
      const html = await this.fetchWithCORS(url);
      
      // Extract basic info from HTML meta tags
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(' - YouTube Music', '').replace(' - YouTube', '') : 'Unknown Track';
      
      // For demo purposes, we'll use the original URL with a CORS proxy
      // In production, you'd extract the actual stream URL
      const streamUrl = CORS_PROXIES[0] + encodeURIComponent(url);
      
      return {
        title,
        artist: 'YouTube Music',
        streamUrl,
        artwork: undefined
      };
    } catch (error) {
      throw new Error('Failed to extract YouTube Music track');
    }
  }

  static async extractSoundCloud(url: string): Promise<ExtractedTrack> {
    try {
      const html = await this.fetchWithCORS(url);
      
      // Extract title from SoundCloud page
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(' | Free Listening on SoundCloud', '') : 'Unknown Track';
      
      // Extract artist from meta tags
      const artistMatch = html.match(/<meta property="twitter:audio:artist_name" content="([^"]+)"/);
      const artist = artistMatch ? artistMatch[1] : 'SoundCloud';
      
      // For demo purposes, use CORS proxy with original URL
      // In production, you'd extract the actual stream URL from the page
      const streamUrl = CORS_PROXIES[0] + encodeURIComponent(url);
      
      return {
        title,
        artist,
        streamUrl,
        artwork: undefined
      };
    } catch (error) {
      throw new Error('Failed to extract SoundCloud track');
    }
  }

  static async extractFromUrl(url: string): Promise<ExtractedTrack | null> {
    if (this.isYouTubeMusic(url)) {
      return await this.extractYouTubeMusic(url);
    } else if (this.isSoundCloud(url)) {
      return await this.extractSoundCloud(url);
    }
    
    return null; // Not a supported URL type
  }
}