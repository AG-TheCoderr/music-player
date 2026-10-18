/**
 * Headless smoke test: boots the real app inside jsdom and asserts that the
 * player shell renders, the tabs work and no errors are thrown.
 *
 *   node scripts/smoke-test.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules', '.smoke', 'app.js');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'main.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  outfile,
  jsx: 'automatic',
  loader: { '.css': 'empty', '.svg': 'text' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://example.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('anon-test-key'),
  },
  logLevel: 'error',
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:8080/',
  pretendToBeVisual: true,
});

const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true, writable: true });
global.HTMLElement = window.HTMLElement;
global.Element = window.Element;
global.Node = window.Node;
global.Event = window.Event;
global.CustomEvent = window.CustomEvent;
global.MouseEvent = window.MouseEvent;
global.getComputedStyle = window.getComputedStyle.bind(window);

// jsdom does not implement matchMedia - Radix UI relies on it.
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
global.matchMedia = window.matchMedia;

// jsdom has no ResizeObserver - Radix sliders rely on it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverStub;
global.ResizeObserver = ResizeObserverStub;
window.DOMRect = window.DOMRect || class DOMRect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    Object.assign(this, { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height });
  }
};
global.DOMRect = window.DOMRect;
global.fetch = globalThis.fetch;
global.Headers = globalThis.Headers;
global.Request = globalThis.Request;
global.Response = globalThis.Response;
window.fetch = globalThis.fetch;
window.Headers = globalThis.Headers;
window.Request = globalThis.Request;
window.Response = globalThis.Response;
global.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 16);
global.cancelAnimationFrame = (id) => window.clearTimeout(id);
global.localStorage = window.localStorage;

const errors = [];
const origError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(' '));
  origError(...args);
};

window.addEventListener('error', (e) => errors.push(`window error: ${e.message}`));

await import(pathToFileURL(outfile).href);

await new Promise((resolve) => setTimeout(resolve, 400));

const doc = window.document;

const findByText = (selector, text) =>
  Array.from(doc.querySelectorAll(selector)).find((el) => (el.textContent || '').trim().includes(text));

const clickText = async (selector, text) => {
  const el = findByText(selector, text);
  if (!el) throw new Error(`Could not find ${selector} containing "${text}"`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 120));
};

// Radix tabs activate on mousedown, not on click.
const pressTab = async (text) => {
  const el = findByText('button[role="tab"]', text);
  if (!el) throw new Error(`Could not find tab "${text}"`);
  el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 120));
};

// Snapshot the initial state before any interaction mutates it.
const initialBody = doc.body.textContent || '';

// --- interactions -------------------------------------------------------
// 1. switch to the YouTube tab
await pressTab('YouTube');
const youtubeTab = findByText('button[role="tab"]', 'YouTube');
const youtubeTabSelected = youtubeTab?.getAttribute('data-state') === 'active';
const youtubeContainer = doc.getElementById('yt-player-root') !== null;

// 2. switch back to the player tab
await pressTab('Player');

// 3. pick a listening mode -> the badge has to follow
await clickText('button', 'Bass Boost');
const modeBadge = Array.from(doc.querySelectorAll('div')).find(
  (el) => el.textContent?.trim() === 'Bass Boost' && el.children.length === 0
);

// 4. add the demo track to the playlist
await clickText('button', 'Demo Track');
const playlistHasTrack = (doc.body.textContent || '').includes('Demo Track - Ambient Soundscape');
const playlistCount = (doc.body.textContent || '').match(/Up Next\s*\((\d+)\)/)?.[1];

// 5. transport controls exist and are labelled
const labelled = ['Toggle shuffle', 'Previous track', 'Next track', 'Repeat: none'];
const hasLabelledControls = labelled.every((label) => doc.querySelector(`[aria-label="${label}"]`) !== null);

const body = doc.body.textContent || '';
const html = doc.body.innerHTML;

const checks = [
  ['app mounted', html.includes('Pro Audio Player')],
  ['player tab', body.includes('Player')],
  ['equalizer tab', body.includes('Equalizer')],
  ['effects tab', body.includes('Effects')],
  ['youtube tab', body.includes('YouTube')],
  ['settings tab', body.includes('Settings')],
  ['search panel', body.includes('Music Search')],
  ['load panel', body.includes('Load Music')],
  ['mode panel', body.includes('Audio Mode')],
  ['playlist panel', body.includes('Up Next')],
  ['empty playlist hint (initially)', initialBody.includes('Playlist is empty')],
  ['visualiser present', body.includes('Audio Visualizer')],
  ['track info present', body.includes('Track Info')],
  ['no hardcoded fake format', !body.includes('MP3 320kbps')],
  ['no hardcoded fake latency', !body.includes('46ms')],
  ['youtube tab switches', youtubeTabSelected],
  ['youtube player container exists', youtubeContainer],
  ['mode selection updates the badge', modeBadge !== undefined],
  ['demo track added to playlist', playlistHasTrack],
  ['playlist counter updated', playlistCount === '1'],
  ['transport controls are labelled', hasLabelledControls],
  ['no runtime errors', errors.length === 0],
];

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
