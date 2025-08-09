// Streaming service for handling URLs that require CORS workarounds
interface StreamTrack {
  title: string;
  artist: string;
  streamUrl: string;
  artwork?: string;
  duration?: number;
}

export class StreamingService {
  // For YouTube Music, we'll create an embedded iframe approach
  static createYouTubeEmbed(url: string): StreamTrack {
    const videoIdMatch = url.match(/(?:v=|\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    const videoId = videoIdMatch ? videoIdMatch[1] : '';
    
    return {
      title: `YouTube Video ${videoId}`,
      artist: 'YouTube Music',
      streamUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&origin=${window.location.origin}`,
      artwork: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }

  // For SoundCloud, use their oEmbed API
  static async createSoundCloudEmbed(url: string): Promise<StreamTrack> {
    try {
      const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(oembedUrl)}`);
      const data = await response.json();
      const embedData = JSON.parse(data.contents);
      
      return {
        title: embedData.title || 'SoundCloud Track',
        artist: embedData.author_name || 'SoundCloud',
        streamUrl: embedData.html.match(/src="([^"]+)"/)?.[1] || url,
        artwork: embedData.thumbnail_url
      };
    } catch (error) {
      return {
        title: 'SoundCloud Track',
        artist: 'SoundCloud',
        streamUrl: url
      };
    }
  }

  // Detect if URL needs streaming workaround
  static needsWorkaround(url: string): boolean {
    return /(?:youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com)/.test(url);
  }

  // Create a playable audio element for streaming URLs
  static async createStreamableTrack(url: string): Promise<StreamTrack> {
    if (/(?:music\.youtube\.com|youtube\.com|youtu\.be)/.test(url)) {
      return this.createYouTubeEmbed(url);
    } else if (/soundcloud\.com/.test(url)) {
      return await this.createSoundCloudEmbed(url);
    }
    
    // Fallback for direct audio URLs
    return {
      title: 'Audio Stream',
      artist: 'Unknown',
      streamUrl: url
    };
  }

  // Create a demo track for testing
  static createDemoTrack(): StreamTrack {
    return {
      title: 'Demo Track - Ambient Soundscape',
      artist: 'Sonic Studio Pro',
      streamUrl: '/audio/demo.mp3',
      artwork: '/placeholder.svg'
    };
  }
}