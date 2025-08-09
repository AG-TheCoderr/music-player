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

// iTunes Search API (public, no key) — returns 30–90s preview URLs that are CORS-friendly
async function searchITunes(query: string): Promise<SearchResult[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const data = await res.json();

  const results: SearchResult[] = (data.results || []).map((item: any) => {
    const durationSec = Math.round((item.trackTimeMillis || 0) / 1000);
    const artwork = typeof item.artworkUrl100 === 'string'
      ? item.artworkUrl100.replace('100x100bb.jpg', '512x512bb.jpg')
      : undefined;
    return {
      id: String(item.trackId ?? `${item.artistName}-${item.trackName}`),
      title: item.trackName || 'Unknown Title',
      artist: item.artistName || 'Unknown Artist',
      duration: durationSec,
      streamUrl: item.previewUrl || '',
      thumbnail: artwork,
      platform: 'itunes'
    } as SearchResult;
  }).filter((r: SearchResult) => !!r.streamUrl);

  return results;
}

function isLikelyDirectAudio(url: string): boolean {
  return /\.(mp3|m4a|aac|ogg|opus|wav|flac)(\?|#|$)/i.test(url);
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, url, platform = 'all' }: ProxyRequest = await req.json();

    if (action === 'search' && query) {
      // Use iTunes for reliable, legal previews
      let results: SearchResult[] = [];
      try {
        results = await searchITunes(query);
      } catch (err) {
        console.error('Search error:', err);
      }

      return new Response(
        JSON.stringify({ success: true, results, total: results.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (action === 'extract' && url) {
      // Explicitly do NOT attempt YouTube/SoundCloud extraction on Edge (no subprocess allowed)
      if (/youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com/i.test(url)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Extraction of this platform is not supported on Edge.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Allow returning direct audio URLs as-is
      if (isLikelyDirectAudio(url)) {
        return new Response(
          JSON.stringify({ success: true, streamUrl: url, title: 'Direct Audio', artist: 'Unknown' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Otherwise, reject to avoid trying to play HTML pages
      return new Response(
        JSON.stringify({ success: false, error: 'URL is not a direct audio stream.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request parameters' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error) {
    console.error('Audio proxy error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
