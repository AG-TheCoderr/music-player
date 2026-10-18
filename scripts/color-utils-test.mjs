/**
 * Verifies the colour parsing that the visualiser depends on.
 *
 * The original implementation asked the browser to normalise the colour through a scratch
 * canvas. It ignored the colour completely and always returned the same purple, and the
 * equalizer could not use hsl() at all.
 *
 *   node scripts/color-utils-test.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules', '.smoke', 'color-utils.mjs');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'utils', 'colorUtils.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile,
  logLevel: 'error',
});

const { parseColor, createColorWithAlpha } = await import(pathToFileURL(outfile).href);

const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

const near = (actual, expected, tolerance = 1) => Math.abs(actual - expected) <= tolerance;

// --- hex -------------------------------------------------------------------
check('parses a short hex colour', (() => {
  const c = parseColor('#f00');
  return c.r === 255 && c.g === 0 && c.b === 0 && c.a === 1;
})());
check('parses a long hex colour', (() => {
  const c = parseColor('#1a2b3c');
  return c.r === 0x1a && c.g === 0x2b && c.b === 0x3c;
})());
check('parses a hex colour with alpha', (() => {
  const c = parseColor('#ff000080');
  return c.r === 255 && c.g === 0 && c.b === 0 && near(c.a, 0.502, 0.01);
})());
check('parses a short hex colour with alpha', (() => {
  const c = parseColor('#f008');
  return c.r === 255 && c.g === 0 && c.b === 0 && near(c.a, 0.533, 0.01);
})());

// --- rgb -------------------------------------------------------------------
check('parses rgb()', (() => {
  const c = parseColor('rgb(12, 34, 56)');
  return c.r === 12 && c.g === 34 && c.b === 56 && c.a === 1;
})());
check('parses the space separated rgb syntax', (() => {
  const c = parseColor('rgb(12 34 56)');
  return c.r === 12 && c.g === 34 && c.b === 56;
})());
check('parses rgba()', (() => {
  const c = parseColor('rgba(12, 34, 56, 0.25)');
  return c.r === 12 && c.g === 34 && c.b === 56 && near(c.a, 0.25);
})());
check('parses the slash separated rgba syntax', (() => {
  const c = parseColor('rgb(12 34 56 / 50%)');
  return c.r === 12 && c.g === 34 && c.b === 56 && near(c.a, 0.5);
})());
check('parses percentage channels', (() => {
  const c = parseColor('rgb(100%, 0%, 50%)');
  return c.r === 255 && c.g === 0 && c.b === 128;
})());

// --- hsl -------------------------------------------------------------------
check('parses hsl()', (() => {
  const c = parseColor('hsl(0, 100%, 50%)');
  return c.r === 255 && c.g === 0 && c.b === 0;
})());
check('parses a green hsl()', (() => {
  const c = parseColor('hsl(120, 100%, 50%)');
  return c.r === 0 && c.g === 255 && c.b === 0;
})());
check('parses a blue hsl()', (() => {
  const c = parseColor('hsl(240, 100%, 50%)');
  return c.r === 0 && c.g === 0 && c.b === 255;
})());
check('parses the space separated hsl syntax', (() => {
  const c = parseColor('hsl(0 100% 50%)');
  return c.r === 255 && c.g === 0 && c.b === 0;
})());
check('parses hsla()', (() => {
  const c = parseColor('hsla(0, 100%, 50%, 0.5)');
  return c.r === 255 && c.g === 0 && c.b === 0 && near(c.a, 0.5);
})());
check('parses a hue that wraps around', (() => {
  const c = parseColor('hsl(360, 100%, 50%)');
  return c.r === 255 && c.g === 0 && c.b === 0;
})());
check('parses a mid grey hsl()', (() => {
  const c = parseColor('hsl(0, 0%, 50%)');
  return near(c.r, 128) && near(c.g, 128) && near(c.b, 128);
})());

// --- the tailwind style bare hsl components --------------------------------
check('parses bare hsl components', (() => {
  const c = parseColor('280 100% 70%');
  return near(c.r, 204) && near(c.g, 102) && near(c.b, 255);
})());
check('bare hsl components keep the alpha at 1', parseColor('280 100% 70%').a === 1);

// --- named ----------------------------------------------------------------
check('parses a named colour', (() => {
  const c = parseColor('white');
  return c.r === 255 && c.g === 255 && c.b === 255;
})());
check('parses transparent', (() => {
  const c = parseColor('transparent');
  return c.a === 0;
})());

// --- invalid --------------------------------------------------------------
const fallback = parseColor('not-a-colour');
check('an invalid colour falls back', fallback.r === 168 && fallback.g === 85 && fallback.b === 247);
check('an empty colour falls back', parseColor('').r === 168);
check('a css variable falls back', parseColor('var(--primary)').r === 168);
check('the fallback is a copy, not the shared object', (() => {
  const a = parseColor('nope');
  const b = parseColor('nope');
  a.r = 0;
  return b.r === 168;
})());

// --- alpha ----------------------------------------------------------------
check('createColorWithAlpha uses the parsed colour', createColorWithAlpha('#ff0000', 0.5) === 'rgba(255, 0, 0, 0.5)');
check('createColorWithAlpha understands hsl', (() => {
  const result = createColorWithAlpha('hsl(0, 100%, 50%)', 0.5);
  return result === 'rgba(255, 0, 0, 0.5)';
})());
check('createColorWithAlpha clamps the alpha', createColorWithAlpha('#000000', 5) === 'rgba(0, 0, 0, 1)');
check('createColorWithAlpha clamps a negative alpha', createColorWithAlpha('#000000', -1) === 'rgba(0, 0, 0, 0)');

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
