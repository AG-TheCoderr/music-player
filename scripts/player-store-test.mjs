/**
 * Verifies that the player store only re-renders the components that use the changed slice.
 *
 * The playback position updates ten times a second. If every component re-rendered on each
 * tick the app would be needlessly expensive, so the store is subscription based.
 *
 *   node scripts/player-store-test.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { setupJsdom, captureErrors } from './jsdom-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules', '.smoke', 'store-probe.mjs');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, 'scripts', 'store-probe.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('anon-test-key'),
  },
  logLevel: 'error',
});

const { window } = setupJsdom();
const errors = captureErrors();

const { mount, renders } = await import(pathToFileURL(outfile).href);

mount(window.document.getElementById('root'));

await new Promise((resolve) => setTimeout(resolve, 300));

const store = window.__store;
const snapshot = () => ({ ...renders });
const baseline = snapshot();

const checks = [];

// 1. A playback tick must re-render the time consumer...
store.setState((prev) => ({ ...prev, currentTime: 12.5 }));
await new Promise((resolve) => setTimeout(resolve, 100));
const afterTick = snapshot();

checks.push(['time consumer re-renders on a tick', afterTick.time > baseline.time]);
checks.push(['volume consumer ignores a tick', afterTick.volume === baseline.volume]);
checks.push(['action consumer ignores a tick', afterTick.actions === baseline.actions]);

// 2. A volume change must re-render the volume consumer but not the time consumer.
const beforeVolume = snapshot();
store.setState((prev) => ({ ...prev, volume: 0.25 }));
await new Promise((resolve) => setTimeout(resolve, 100));
const afterVolume = snapshot();

checks.push(['volume consumer re-renders on a volume change', afterVolume.volume > beforeVolume.volume]);
checks.push(['time consumer ignores a volume change', afterVolume.time === beforeVolume.time]);

// 3. An object slice keeps its identity while the contents are equal.
const bandsBefore = store.getState().equalizerBands;
store.setState((prev) => ({ ...prev, currentTime: 20 }));
await new Promise((resolve) => setTimeout(resolve, 60));
checks.push([
  'object slices keep their identity',
  store.getState().equalizerBands === bandsBefore,
]);

// 4. Subscribing to the same value twice does not cause extra renders.
const beforeIdempotent = snapshot();
store.setState((prev) => ({ ...prev, currentTime: prev.currentTime }));
await new Promise((resolve) => setTimeout(resolve, 60));
const afterIdempotent = snapshot();
checks.push(['no re-render when nothing changes', afterIdempotent.time === beforeIdempotent.time]);

// 5. The store keeps working after many rapid updates.
for (let i = 0; i < 50; i++) {
  store.setState((prev) => ({ ...prev, currentTime: i }));
}
await new Promise((resolve) => setTimeout(resolve, 120));
checks.push(['state reflects the last update', store.getState().currentTime === 49]);

// 6. No console errors anywhere.
checks.push(['no runtime errors', errors.length === 0]);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

if (errors.length) {
  console.log('\n--- captured errors ---');
  errors.forEach((e) => console.log(e));
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
