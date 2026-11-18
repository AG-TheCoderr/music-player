/**
 * Verifies that the player preferences survive a reload and that malformed stored data is
 * ignored instead of breaking the player.
 *
 *   node scripts/preferences-test.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { setupJsdom, captureErrors } from './jsdom-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules', '.smoke', 'preferences.mjs');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'services', 'preferences.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('anon-test-key'),
  },
  logLevel: 'error',
});

const { window } = setupJsdom();
const errors = captureErrors();

const { loadPreferences, savePreferences, clearPreferences } = await import(
  pathToFileURL(outfile).href
);

const checks = [];

// 1. Nothing stored yet.
checks.push(['no preferences on a fresh install', loadPreferences() === null]);

// 2. Round trip.
const effects = {
  reverb: { roomSize: 0.4, damping: 0.6, wetLevel: 0.2, dryLevel: 0.8 },
  chorus: { rate: 2, depth: 0.4, feedback: 0.3, wetLevel: 0.25 },
  distortion: { amount: 12, oversample: '2x' },
  compressor: { threshold: -20, knee: 25, ratio: 10, attack: 0.004, release: 0.2 },
};

savePreferences({
  volume: 0.42,
  equalizerBands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  equalizerPreset: 'rock',
  effects,
  mode: 'bass-boost',
  isShuffled: true,
  repeatMode: 'all',
  playlist: [{ id: 'a', title: 'Track', artist: 'Artist', duration: 10, src: 'https://x/y.mp3' }],
});

const restored = loadPreferences();
checks.push(['volume restored', restored?.volume === 0.42]);
checks.push(['equalizer restored', restored?.equalizerBands?.[9] === 10]);
checks.push(['preset restored', restored?.equalizerPreset === 'rock']);
checks.push(['reverb restored', restored?.effects?.reverb?.roomSize === 0.4]);
checks.push(['mode restored', restored?.mode === 'bass-boost']);
checks.push(['shuffle restored', restored?.isShuffled === true]);
checks.push(['repeat restored', restored?.repeatMode === 'all']);
checks.push(['playlist restored', restored?.playlist?.[0]?.id === 'a']);

// 3. Malformed data must not throw and must be ignored.
window.localStorage.setItem('sonic-studio-pro:preferences', '{not json');
checks.push(['malformed json is ignored', loadPreferences() === null]);

window.localStorage.setItem('sonic-studio-pro:preferences', JSON.stringify({ version: 999, volume: 1 }));
checks.push(['a different schema version is ignored', loadPreferences() === null]);

window.localStorage.setItem(
  'sonic-studio-pro:preferences',
  JSON.stringify({ version: 1, volume: 'loud', equalizerBands: [1, 2] })
);
const partial = loadPreferences();
checks.push(['a bad volume falls back to the default', partial?.volume === undefined]);
checks.push(['a wrong length band array is ignored', partial?.equalizerBands === undefined]);

// 4. Out of range values are clamped.
window.localStorage.setItem(
  'sonic-studio-pro:preferences',
  JSON.stringify({ version: 1, volume: 12 })
);
checks.push(['an out of range volume is clamped', loadPreferences()?.volume === 1]);

// 5. Clearing removes everything.
clearPreferences();
checks.push(['clearing removes the preferences', loadPreferences() === null]);

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
