// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * CORS + Range aware audio relay.
 *
 * The endpoint is reachable from a browser without custom headers, so it must not be able to
 * reach internal network resources. Every target is validated before the request is made.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

const UPSTREAM_TIMEOUT_MS = 20000;

/** Hostnames that must never be proxied. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

/** Optional allowlist. When set, only these hosts may be proxied. */
const allowedHosts = (Deno.env.get("ALLOWED_PROXY_HOSTS") || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** True for loopback / private / link-local / CGNAT / multicast IPv4 ranges. */
function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true; // unparseable -> refuse
  }

  const [a, b] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved

  return false;
}

/** True for loopback / unique-local / link-local IPv6 ranges. */
function isBlockedIPv6(ip: string): boolean {
  const address = ip.toLowerCase().split("%")[0];

  if (address === "::1" || address === "::") return true;
  if (address.startsWith("fe80")) return true; // link-local
  if (/^f[cd]/.test(address)) return true; // unique local fc00::/7
  if (address.startsWith("ff")) return true; // multicast

  // IPv4-mapped (::ffff:127.0.0.1) must be checked against the v4 rules.
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIPv4(mapped[1]);

  return false;
}

function isBlockedAddress(ip: string): boolean {
  return ip.includes(":") ? isBlockedIPv6(ip) : isBlockedIPv4(ip);
}

/** Resolves the hostname and rejects the target if any address points at an internal range. */
async function assertPublicTarget(url: URL): Promise<string | null> {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return "Requests to internal hostnames are not allowed.";
  }

  if (allowedHosts.length > 0) {
    const allowed = allowedHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`)
    );
    if (!allowed) {
      return "This host is not on the proxy allowlist.";
    }
  }

  // A literal IP can be checked without DNS.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":")) {
    if (isBlockedAddress(hostname)) {
      return "Requests to internal network addresses are not allowed.";
    }
    return null;
  }

  try {
    const records = await Deno.resolveDns(hostname, "A");
    for (const record of records) {
      if (isBlockedAddress(record)) {
        return "Requests to internal network addresses are not allowed.";
      }
    }
  } catch {
    // DNS resolution failed - let the upstream request surface the real error.
  }

  return null;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const urlObj = new URL(req.url);
    const targetParam = urlObj.searchParams.get("url");

    if (!targetParam) {
      return jsonResponse({ error: "Missing 'url' query parameter" }, 400);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(decodeURIComponent(targetParam));
    } catch {
      return jsonResponse({ error: "The 'url' parameter is not a valid URL" }, 400);
    }

    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return jsonResponse({ error: "Only http(s) URLs are allowed" }, 400);
    }

    const blockedReason = await assertPublicTarget(targetUrl);
    if (blockedReason) {
      return jsonResponse({ error: blockedReason }, 403);
    }

    const forwardHeaders: HeadersInit = {};
    const range = req.headers.get("range");
    if (range) forwardHeaders["Range"] = range;

    // Pass through useful headers
    const ua = req.headers.get("user-agent") || "Mozilla/5.0";
    forwardHeaders["User-Agent"] = ua;
    const referer = req.headers.get("referer");
    if (referer) forwardHeaders["Referer"] = referer;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method: req.method === "HEAD" ? "HEAD" : "GET",
        headers: forwardHeaders,
        redirect: "follow",
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const aborted = error instanceof Error && error.name === "AbortError";
      return jsonResponse(
        { error: aborted ? "The upstream request timed out." : "The upstream request failed." },
        aborted ? 504 : 502
      );
    }
    clearTimeout(timeout);

    const respHeaders = new Headers(corsHeaders);
    const contentType = upstream.headers.get("content-type");
    if (contentType) respHeaders.set("Content-Type", contentType);

    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) respHeaders.set("Accept-Ranges", acceptRanges);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) respHeaders.set("Content-Length", contentLength);

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) respHeaders.set("Content-Range", contentRange);

    const status = upstream.status === 200 || upstream.status === 206 ? upstream.status : 502;

    if (status === 502) {
      return jsonResponse({ error: "The upstream host could not be reached." }, 502);
    }

    return new Response(upstream.body, { status, headers: respHeaders });
  } catch (error) {
    console.error("Audio stream proxy error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
