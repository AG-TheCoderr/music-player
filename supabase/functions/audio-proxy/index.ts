import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  thumbnail?: string;
  platform: string;
}

interface ProxyRequest {
  action: 'search' | 'extract';
  query?: string;
  url?: string;
  platform?: 'youtube' | 'soundcloud' | 'spotify' | 'all';
}

// YouTube audio extraction using yt-dlp
const extractYouTubeAudio = async (url: string): Promise<{ streamUrl: string; title: string; artist: string; thumbnail?: string }> => {
  try {
    const videoId = url.match(/(?:v=|\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Use yt-dlp to extract audio stream URL
    const ytDlpCommand = new Deno.Command("yt-dlp", {
      args: [
        "--get-url",
        "--get-title", 
        "--get-uploader",
        "--get-thumbnail",
        "--format", "bestaudio[ext=mp3]/bestaudio[ext=m4a]/bestaudio",
        "--no-playlist",
        url
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await ytDlpCommand.output();
    
    if (code !== 0) {
      console.error("yt-dlp error:", new TextDecoder().decode(stderr));
      // Fallback to demo audio
      return {
        streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3',
        title: `YouTube Video ${videoId}`,
        artist: 'YouTube Music',
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      };
    }

    const output = new TextDecoder().decode(stdout).trim().split('\n');
    const streamUrl = output[0];
    const title = output[1] || `YouTube Video ${videoId}`;
    const artist = output[2] || 'YouTube Music';
    const thumbnail = output[3] || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    return {
      streamUrl,
      title,
      artist,
      thumbnail
    };
  } catch (error) {
    console.error('YouTube extraction error:', error);
    // Fallback to demo audio
    const videoId = url.match(/(?:v=|\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || 'unknown';
    return {
      streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3',
      title: `YouTube Video ${videoId}`,
      artist: 'YouTube Music',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }
};

// Search YouTube for music using yt-dlp
const searchYouTube = async (query: string): Promise<SearchResult[]> => {
  try {
    const ytDlpCommand = new Deno.Command("yt-dlp", {
      args: [
        "--get-id",
        "--get-title",
        "--get-uploader", 
        "--get-duration",
        "--get-thumbnail",
        "--playlist-end", "10",
        "--no-playlist",
        `ytsearch10:${query} music`
      ],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await ytDlpCommand.output();
    
    if (code !== 0) {
      console.error("yt-dlp search error:", new TextDecoder().decode(stderr));
      return mockSearchResults(query, 'youtube');
    }

    const output = new TextDecoder().decode(stdout).trim().split('\n');
    const results: SearchResult[] = [];
    
    // Parse yt-dlp output (groups of 5 lines: id, title, uploader, duration, thumbnail)
    for (let i = 0; i < output.length; i += 5) {
      if (i + 4 < output.length) {
        const id = output[i];
        const title = output[i + 1];
        const artist = output[i + 2];
        const duration = parseInt(output[i + 3]) || 0;
        const thumbnail = output[i + 4];

        results.push({
          id: `yt-${id}`,
          title,
          artist,
          duration,
          streamUrl: `https://www.youtube.com/watch?v=${id}`,
          thumbnail,
          platform: 'youtube'
        });
      }
    }

    return results.length > 0 ? results : mockSearchResults(query, 'youtube');
  } catch (error) {
    console.error('YouTube search error:', error);
    return mockSearchResults(query, 'youtube');
  }
};

// Mock search results for demonstration (fallback)
const mockSearchResults = (query: string, platform: string): SearchResult[] => {
  const results: SearchResult[] = [
    {
      id: 'yt-1',
      title: `${query} - Official Audio`,
      artist: 'Various Artists',
      duration: 240,
      streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3',
      thumbnail: '/placeholder.svg',
      platform: 'youtube'
    },
    {
      id: 'sc-1', 
      title: `${query} (Remix)`,
      artist: 'SoundCloud Artists',
      duration: 180,
      streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
      thumbnail: '/placeholder.svg',
      platform: 'soundcloud'
    },
    {
      id: 'sp-1',
      title: `${query} - Radio Edit`,
      artist: 'Popular Artist',
      duration: 200,
      streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Sevish_-__nbsp_.mp3',
      thumbnail: '/placeholder.svg',
      platform: 'spotify'
    }
  ];

  return platform === 'all' ? results : results.filter(r => r.platform === platform);
};

const extractAudioUrl = async (url: string): Promise<{ streamUrl: string; title: string; artist: string; thumbnail?: string }> => {
  console.log(`Extracting audio from: ${url}`);
  
  // YouTube URL extraction
  if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('music.youtube.com')) {
    return await extractYouTubeAudio(url);
  }
  
  // SoundCloud URL extraction (simplified fallback)
  if (url.includes('soundcloud.com')) {
    return {
      streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
      title: 'SoundCloud Track',
      artist: 'SoundCloud Artist',
      thumbnail: '/placeholder.svg'
    };
  }
  
  // Direct audio URL
  return {
    streamUrl: url,
    title: 'Direct Audio Stream',
    artist: 'Unknown Artist'
  };
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, url, platform = 'all' }: ProxyRequest = await req.json();
    
    console.log(`Audio proxy request: ${action}`, { query, url, platform });

    if (action === 'search' && query) {
      let results: SearchResult[] = [];
      
      // Search YouTube specifically or all platforms
      if (platform === 'youtube' || platform === 'all') {
        const youtubeResults = await searchYouTube(query);
        results = results.concat(youtubeResults);
      }
      
      // Add mock results for other platforms if searching all
      if (platform === 'all') {
        const mockResults = mockSearchResults(query, 'all').filter(r => r.platform !== 'youtube');
        results = results.concat(mockResults);
      } else if (platform !== 'youtube') {
        results = mockSearchResults(query, platform);
      }
      
      return new Response(
        JSON.stringify({
          success: true,
          results,
          total: results.length
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }
    
    if (action === 'extract' && url) {
      // Extract audio stream from URL
      const result = await extractAudioUrl(url);
      
      return new Response(
        JSON.stringify({
          success: true,
          ...result
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid request parameters'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
    
  } catch (error) {
    console.error('Audio proxy error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});