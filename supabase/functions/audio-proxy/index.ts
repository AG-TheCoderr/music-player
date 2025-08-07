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

// Mock search results for demonstration
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
  
  // YouTube URL extraction (simplified mock)
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const videoId = url.match(/(?:v=|\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
    return {
      streamUrl: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Kangaroo_MusiQue_-_The_Neverwritten_Role_Playing_Game.mp3',
      title: `YouTube Video ${videoId}`,
      artist: 'YouTube Music',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    };
  }
  
  // SoundCloud URL extraction (simplified mock)
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
      // Search for music across platforms
      const results = mockSearchResults(query, platform);
      
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