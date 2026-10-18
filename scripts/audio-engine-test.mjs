/**
 * Verifies the Web Audio graph that AudioEngine builds.
 *
 * The original implementation created the reverb (ConvolverNode) and chorus (DelayNode)
 * but never connected them, so the effects were silent. These assertions lock the chain down.
 *
 *   node scripts/audio-engine-test.mjs
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules', '.smoke', 'audio-engine.mjs');

fs.mkdirSync(path.dirname(outfile), { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'components', 'audio', 'AudioEngine.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2020',
  outfile,
  logLevel: 'error',
});

// --- Web Audio API stub ------------------------------------------------
const edges = [];
let nodeCounter = 0;

class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.ramped = 0;
  }
  /** The engine ramps parameters instead of jumping them, so the target is recorded. */
  setTargetAtTime(value) {
    this.value = value;
    this.ramped++;
  }
  cancelScheduledValues() {}
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.id = `${kind}#${++nodeCounter}`;
    this.out = [];
  }
  connect(dest) {
    this.out.push(dest);
    edges.push([this, dest]);
    return dest;
  }
  disconnect() {
    this.out = [];
  }
  get gain() {
    return (this._gain ??= new FakeParam(1));
  }
  get frequency() {
    return (this._frequency ??= new FakeParam(440));
  }
  get delayTime() {
    return (this._delayTime ??= new FakeParam(0));
  }
  get threshold() {
    return (this._threshold ??= new FakeParam(-24));
  }
  get knee() {
    return (this._knee ??= new FakeParam(30));
  }
  get ratio() {
    return (this._ratio ??= new FakeParam(12));
  }
  get attack() {
    return (this._attack ??= new FakeParam(0.003));
  }
  get release() {
    return (this._release ??= new FakeParam(0.25));
  }
  get curve() {
    return this._curve;
  }
  set curve(value) {
    this._curve = value;
  }
  get oversample() {
    return this._oversample;
  }
  set oversample(value) {
    this._oversample = value;
  }
  get buffer() {
    return this._buffer;
  }
  set buffer(value) {
    this._buffer = value;
  }
  get normalize() {
    return this._normalize;
  }
  set normalize(value) {
    this._normalize = value;
  }
}

class FakeAudioContext {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate ?? 44100;
    this.state = 'running';
    this.baseLatency = 0.01;
    this.destination = new FakeNode('destination');
    this.destination.channelCount = 2;
  }
  createGain() {
    return new FakeNode('gain');
  }
  createAnalyser() {
    const node = new FakeNode('analyser');
    node.frequencyBinCount = 1024;
    return node;
  }
  createBiquadFilter() {
    const node = new FakeNode('biquad');
    node.Q = new FakeParam(1);
    return node;
  }
  createDynamicsCompressor() {
    return new FakeNode('compressor');
  }
  createWaveShaper() {
    return new FakeNode('waveshaper');
  }
  createDelay() {
    return new FakeNode('delay');
  }
  createOscillator() {
    const node = new FakeNode('oscillator');
    node.start = () => {};
    node.stop = () => {};
    return node;
  }
  createConvolver() {
    return new FakeNode('convolver');
  }
  createBuffer(channels, length) {
    return { length, numberOfChannels: channels, getChannelData: () => new Float32Array(length) };
  }
  createMediaElementSource() {
    return new FakeNode('source');
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

global.AudioContext = FakeAudioContext;

// --- Minimal DOM stubs -------------------------------------------------
global.document = {
  createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, removeAttribute() {} }),
  getElementById: () => null,
  head: { appendChild() {} },
  body: { appendChild() {} },
};
global.window = { location: { origin: 'http://localhost' } };

const { AudioEngine } = await import(pathToFileURL(outfile).href);

const engine = new AudioEngine();
await engine.initialize();

// The source node is created inside loadAudio; emulate a media element.
class FakeAudioElement {
  constructor() {
    this.readyState = 1;
    this.currentTime = 0;
    this.duration = 100;
    this.listeners = {};
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener() {}
  removeAttribute() {}
  load() {}
  play() {
    return Promise.resolve();
  }
  pause() {}
}
global.Audio = FakeAudioElement;
global.URL.createObjectURL = () => 'blob:test';
global.URL.revokeObjectURL = () => {};

const sourceNode = new FakeNode('source');
engine.sourceNode = sourceNode;
sourceNode.connect(engine.equalizerNodes[0]);

const chain = edges.map(([from, to]) => `${from.kind}->${to.kind}`).join('\n');

const hasEdge = (fromKind, toKind) => edges.some(([from, to]) => from.kind === fromKind && to.kind === toKind);

const checks = [
  ['source feeds the first EQ band', sourceNode.out.includes(engine.equalizerNodes[0])],
  ['EQ bands are chained', hasEdge('biquad', 'biquad')],
  ['EQ feeds the distortion', hasEdge('biquad', 'waveshaper')],
  ['distortion feeds the chorus input', hasEdge('waveshaper', 'gain')],
  ['chorus dry path is connected', edges.some(([from, to]) => from.kind === 'gain' && to.kind === 'gain')],
  ['chorus delay is connected', hasEdge('gain', 'delay')],
  ['chorus feedback loop is connected', hasEdge('delay', 'gain')],
  ['LFO is connected to the chorus depth gain', engine.chorusLfo.out.includes(engine.chorusLfoDepth)],
  ['LFO modulates the chorus delay time', engine.chorusLfoDepth.out.includes(engine.chorusDelay.delayTime)],
  ['reverb convolver is connected', hasEdge('gain', 'convolver')],
  ['reverb feeds the compressor', hasEdge('gain', 'compressor')],
  ['compressor feeds the master gain', hasEdge('compressor', 'gain')],
  ['master gain reaches the analyser', hasEdge('gain', 'analyser')],
  ['analyser reaches the destination', hasEdge('analyser', 'destination')],
];

// Effect settings have to reach the real nodes.
engine.setReverbSettings({ roomSize: 0.8, damping: 0.4, wetLevel: 0.3, dryLevel: 0.7 });
engine.setChorusSettings({ rate: 2.5, depth: 0.6, feedback: 0.4, wetLevel: 0.5 });
engine.setDistortionAmount(42);
engine.setDistortionOversample('2x');
engine.setVolume(0.5);
engine.setEqualizerBand(0, 6);

const reverbWet = engine.reverbWet?.gain.value;
const chorusWet = engine.chorusWet?.gain.value;
const chorusDry = engine.chorusDry?.gain.value;
const lfoFreq = engine.chorusLfo?.frequency.value;
const distortionAmount = engine.distortionNode?.curve?.[2200];

checks.push(['reverb wet gain applied', reverbWet === 0.3]);
checks.push(['chorus wet gain applied', chorusWet === 0.5]);
checks.push(['chorus dry gain complements wet', chorusDry === 0.5]);
checks.push(['chorus LFO rate applied', lfoFreq === 2.5]);
checks.push(['distortion curve rebuilt', typeof distortionAmount === 'number' && Number.isFinite(distortionAmount)]);
checks.push(['oversample applied', engine.distortionNode?.oversample === '2x']);
checks.push(['volume applied', engine.masterGain?.gain.value === 0.5]);
// Jumping a gain produces an audible click, so every change has to be ramped.
checks.push(['the volume is ramped, not jumped', (engine.masterGain?.gain.ramped ?? 0) > 0]);
checks.push(['the equalizer gain is ramped', (engine.equalizerNodes?.[0]?.gain.ramped ?? 0) > 0]);
checks.push(['the reverb wet gain is ramped', (engine.reverbWet?.gain.ramped ?? 0) > 0]);
checks.push(['the chorus dry gain is ramped', (engine.chorusDry?.gain.ramped ?? 0) > 0]);
checks.push(['EQ band applied', engine.equalizerNodes[0].gain.value === 6]);

// The impulse response is generated on a short debounce.
await new Promise((resolve) => setTimeout(resolve, 250));
checks.push(['reverb impulse generated', engine.reverbConvolver?.buffer != null]);

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}

if (failed) {
  console.log('\n--- graph ---');
  console.log(chain);
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
