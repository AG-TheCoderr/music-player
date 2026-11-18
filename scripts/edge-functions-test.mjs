/**
 * Verifies the hand written Supabase edge function client and the audio proxy service that is
 * built on top of it. The network is mocked, so this asserts exactly what the app sends and how
 * it reacts to what comes back.
 *
 *   node scripts/edge-functions-test.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { setupJsdom } from './jsdom-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules', '.smoke', 'edge-functions.mjs');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, 'scripts', 'edge-probe.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://test-project.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test-anon-key'),
  },
  logLevel: 'error',
});

const { window } = setupJsdom();

/** Records every request and replies with the queued responses. */
function mockFetch(responses) {
  const calls = [];
  const queue = [...responses];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error('no queued response');
    if (next.networkError) throw new TypeError('Failed to fetch');
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status ?? 200,
      text: async () => (typeof next.body === 'string' ? next.body : JSON.stringify(next.body)),
    };
  };

  return calls;
}

const { AudioProxyService, invokeEdgeFunction, EdgeFunctionError } = await import(pathToFileURL(outfile).href);

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

// 1. The request shape.
let calls = mockFetch([{ status: 200, body: { ok: true } }]);
await invokeEdgeFunction('demo', { hello: 'world' });
check('posts to the edge function url', calls[0].url === 'https://test-project.supabase.co/functions/v1/demo');
check('uses POST by default', calls[0].init.method === 'POST');
check('sends the apikey header', calls[0].init.headers.apikey === 'test-anon-key');
check('sends the authorization header', calls[0].init.headers.Authorization === 'Bearer test-anon-key');
check('sends json content type', calls[0].init.headers['Content-Type'] === 'application/json');
check('serialises the body', calls[0].init.body === JSON.stringify({ hello: 'world' }));

// 2. Successful responses are parsed.
calls = mockFetch([{ status: 200, body: { value: 42 } }]);
const parsed = await invokeEdgeFunction('demo', {});
check('returns the parsed body', parsed.value === 42);

// 3. Failures are mapped to a readable message.
const failureCases = [
  [404, { error: 'not found' }, /not found/i],
  [401, { error: 'unauthorized' }, /rejected the request/i],
  [500, { error: "boom" }, /backend error/i],
  [400, { error: 'this platform is not supported' }, /not supported/i],
];

for (const [status, body, matcher] of failureCases) {
  mockFetch([{ status, body }]);
  let message = '';
  try {
    await invokeEdgeFunction('demo', {});
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
    check(`a ${status} response throws an EdgeFunctionError`, error instanceof EdgeFunctionError);
    check(`a ${status} response keeps the status code`, error.status === status);
  }
  check(`a ${status} response gives a readable message (${message})`, matcher.test(message));
}

// 4. A network failure is reported, not swallowed.
mockFetch([{ networkError: true }]);
let networkMessage = '';
try {
  await invokeEdgeFunction('demo', {});
} catch (error) {
  networkMessage = error instanceof Error ? error.message : String(error);
}
check('a network failure is reported', /could not be reached/i.test(networkMessage));

// 4b. A 200 response that reports success:false is not silently treated as "no results".
calls = mockFetch([{ status: 200, body: { success: false, error: 'Search quota exceeded' } }]);
const rawPayload = await invokeEdgeFunction('demo', {});
check('a 200 response is returned untouched', rawPayload.success === false);

calls = mockFetch([{ status: 200, body: { success: false, error: 'Search quota exceeded' } }]);
let quotaError = '';
try {
  await AudioProxyService.searchMusic('x');
} catch (error) {
  quotaError = error instanceof Error ? error.message : String(error);
}
check('a backend failure is reported instead of looking empty', /quota/i.test(quotaError));

// 5. An empty query is rejected before the network.
calls = mockFetch([{ status: 200, body: { success: true, results: [] } }]);
let queryError = '';
try {
  await AudioProxyService.searchMusic('   ');
} catch (error) {
  queryError = error instanceof Error ? error.message : String(error);
}
check('an empty query is rejected', /enter something/i.test(queryError));
check('an empty query does not hit the network', calls.length === 0);

// 6. Search sends one request to the audio proxy for the catalogue.
calls = mockFetch([
  {
    status: 200,
    body: {
      success: true,
      results: [
        { id: 'one', title: 'One', artist: 'A', duration: 1, streamUrl: 'https://x/1.mp3', platform: 'itunes' },
        { id: 'dup', title: 'Dup', artist: 'A', duration: 1, streamUrl: 'https://x/2.mp3', platform: 'itunes' },
        { id: 'dup', title: 'Dup', artist: 'A', duration: 1, streamUrl: 'https://x/2.mp3', platform: 'itunes' },
      ],
    },
  },
]);
const results = await AudioProxyService.searchMusic('  daft punk ');
check('search calls the audio proxy once', calls.length === 1 && calls[0].url.endsWith('/functions/v1/audio-proxy'));
check('search sends the trimmed query', calls[0].init.body.includes('"query":"daft punk"'));
check('search sends the search action', calls[0].init.body.includes('"action":"search"'));
check('search de-duplicates results', results.length === 2);

// 7. A failed search surfaces the error.
calls = mockFetch([{ status: 500, body: { error: 'boom' } }]);
let failedSearch = '';
try {
  await AudioProxyService.searchMusic('x');
} catch (error) {
  failedSearch = error instanceof Error ? error.message : String(error);
}
check('a failed search throws', failedSearch.length > 0);

// 8. Proxy helpers.
check('a relative url is not proxied', AudioProxyService.buildProxiedUrl('/audio/demo.mp3') === '/audio/demo.mp3');
check(
  'a cross origin url is proxied',
  AudioProxyService.buildProxiedUrl('https://cdn.example/track.mp3').includes('/functions/v1/audio-stream-proxy?url=')
);
check(
  'an already proxied url is left alone',
  AudioProxyService.buildProxiedUrl('https://test-project.supabase.co/functions/v1/audio-stream-proxy?url=x') ===
    'https://test-project.supabase.co/functions/v1/audio-stream-proxy?url=x'
);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
