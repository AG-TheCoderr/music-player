// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-query',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

interface YTSearchRequest { query?: string; maxResults?: number }

type SearchResult = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  streamUrl: string;
  thumbnail?: string;
  platform: string;
};

function parseISODurationToSeconds(iso: string): number {
  // Minimal ISO8601 duration parser for PT#M#S
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || '0');
  const mm = parseInt(m[2] || '0');
  const s = parseInt(m[3] || '0');
  return h * 3600 + mm * 60 + s;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const key = Deno.env.get('YT_API_KEY');
    if (!key) {
      return new Response(JSON.stringify({ success: false, error: 'YT_API_KEY not set' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    // Robust body parsing with fallbacks (headers and URL params)
    let parsed: YTSearchRequest = {};
    if (req.method === 'POST') {
      try {
        const text = await req.text();
        if (text) parsed = JSON.parse(text);
      } catch (_) {
        // ignore
      }
    }
    const url = new URL(req.url);
    const headerQuery = req.headers.get('x-query') || undefined;
    const paramQuery = url.searchParams.get('query') || url.searchParams.get('q') || undefined;
    const query = (parsed.query || headerQuery || paramQuery || '').toString();
    const maxResults = Number(parsed.maxResults || url.searchParams.get('maxResults') || 20);
    if (!query || !query.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing query', hint: 'Provide {"query":"..."} in JSON body, ?query= in URL, or x-query header.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 1) Search for videos
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', String(maxResults));
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('key', key);

    const sRes = await fetch(searchUrl.toString());
    if (!sRes.ok) {
      let errBody = '';
      try { errBody = await sRes.text(); } catch (_) {}
      return new Response(
        JSON.stringify({ success: false, error: 'YouTube search failed', status: sRes.status, details: errBody }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      );
    }
    const sData = await sRes.json();
    const items = (sData.items || []) as Array<any>;
    const ids = items.map(i => i.id?.videoId).filter(Boolean);

    // 2) Fetch content details for durations
    let durations: Record<string, number> = {};
    if (ids.length) {
      const vidsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
      vidsUrl.searchParams.set('part', 'contentDetails');
      vidsUrl.searchParams.set('id', ids.join(','));
      vidsUrl.searchParams.set('key', key);
      const vRes = await fetch(vidsUrl.toString());
      if (vRes.ok) {
        const vData = await vRes.json();
        for (const v of vData.items || []) {
          const id = v.id;
          const dur = parseISODurationToSeconds(v.contentDetails?.duration || '');
          durations[id] = dur;
        }
      } else {
        // Non-fatal; continue without durations
        console.warn('YouTube video details failed:', vRes.status);
      }
    }

    const results: SearchResult[] = items.map((i) => {
      const id = i.id?.videoId;
      const snippet = i.snippet || {};
      const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;
      return {
        id,
        title: snippet.title || 'YouTube Video',
        artist: snippet.channelTitle || 'YouTube',
        duration: durations[id] || 0,
        streamUrl: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: thumb,
        platform: 'youtube'
      } as SearchResult;
    });

    return new Response(JSON.stringify({ success: true, results, total: results.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (err) {
    let message = 'Internal error';
    try { message = (err as Error).message || message; } catch (_) {}
    console.error('youtube-search error:', err);
    return new Response(JSON.stringify({ success: false, error: message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});
