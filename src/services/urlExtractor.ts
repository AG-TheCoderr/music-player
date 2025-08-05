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
      // Extract video ID from URL
      const videoIdMatch = url.match(/(?:v=|\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      if (!videoIdMatch) throw new Error('Invalid YouTube URL');
      
      const videoId = videoIdMatch[1];
      
      // Use a simple approach - just return the URL for direct loading
      // Note: This is a simplified demo. Real implementation would need proper stream extraction
      return {
        title: `YouTube Video ${videoId}`,
        artist: 'YouTube Music',
        streamUrl: url, // Use original URL - browser will handle CORS
        artwork: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      };
    } catch (error) {
      throw new Error('Failed to extract YouTube Music track');
    }
  }

  static async extractSoundCloud(url: string): Promise<ExtractedTrack> {
    try {
      const html = await this.fetchWithCORS(url);
      
      // Extract title from meta tags
      const titleMatch = html.match(/<meta property="twitter:title" content="([^"]+)"/);
      const title = titleMatch ? titleMatch[1] : 'Unknown Track';
      
      // Extract artist from meta tags
      const artistMatch = html.match(/<meta property="soundcloud:user" content="https:\/\/soundcloud\.com\/([^"]+)"/);
      const artist = artistMatch ? artistMatch[1] : 'SoundCloud';
      
      // Extract artwork
      const artworkMatch = html.match(/<meta property="twitter:image" content="([^"]+)"/);
      const artwork = artworkMatch ? artworkMatch[1] : undefined;
      
      // Use original URL - let browser handle it
      return {
        title,
        artist,
        streamUrl: url,
        artwork
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