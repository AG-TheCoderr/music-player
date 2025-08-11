// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const urlObj = new URL(req.url);
    const targetParam = urlObj.searchParams.get("url");

    if (!targetParam) {
      return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUrl = decodeURIComponent(targetParam);
    if (!/^https?:\/\//i.test(targetUrl)) {
      return new Response(JSON.stringify({ error: "Only http(s) URLs are allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const forwardHeaders: HeadersInit = {};
    const range = req.headers.get("range");
    if (range) forwardHeaders["Range"] = range;

    // Pass through useful headers
    const ua = req.headers.get("user-agent") || "Mozilla/5.0";
    forwardHeaders["User-Agent"] = ua;
    const referer = req.headers.get("referer");
    if (referer) forwardHeaders["Referer"] = referer;

    const upstream = await fetch(targetUrl, {
      method: req.method === "HEAD" ? "HEAD" : "GET",
      headers: forwardHeaders,
      redirect: "follow",
    });

    const respHeaders = new Headers(corsHeaders);
    const contentType = upstream.headers.get("content-type");
    if (contentType) respHeaders.set("Content-Type", contentType);

    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) respHeaders.set("Accept-Ranges", acceptRanges);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) respHeaders.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) respHeaders.set("Content-Range", contentRange);

    // Avoid caching to reduce stale range issues
    respHeaders.set("Cache-Control", "no-store");

    return new Response(req.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (error) {
    console.error("audio-stream-proxy error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message || "Proxy error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});