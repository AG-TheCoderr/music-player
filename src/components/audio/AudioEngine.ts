export interface AudioEngineConfig {
  sampleRate: number;
  bufferSize: number;
}

export interface EqualizerBand {
  frequency: number;
  gain: number;
  q: number;
}

export interface AudioEffects {
  reverb: {
    roomSize: number;
    damping: number;
    wetLevel: number;
    dryLevel: number;
  };
  chorus: {
    rate: number;
    depth: number;
    feedback: number;
    wetLevel: number;
  };
  distortion: {
    amount: number;
    oversample: OverSampleType;
  };
  compressor: {
    threshold: number;
    knee: number;
    ratio: number;
    attack: number;
    release: number;
  };
}

export interface AudioEngineInfo {
  sampleRate: number;
  channelCount: number;
  bufferSize: number;
  /** Seconds of latency introduced by the browser's output buffer. */
  baseLatency: number;
  /** Seconds of latency reported by the output device (not supported everywhere). */
  outputLatency: number;
  state: AudioContextState;
}

const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

/** Shared empty buffer returned when no analyser is available. */
const EMPTY_DATA = new Uint8Array(0);

/**
 * Web Audio graph:
 *
 *   source -> EQ(10 band) -> distortion
 *          -> chorus (dry/wet + LFO modulated delay)
 *          -> reverb (dry/wet + convolver)
 *          -> compressor (glue / safety limiter)
 *          -> master gain -> analyser -> destination
 */
export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private equalizerNodes: BiquadFilterNode[] = [];
  private compressorNode: DynamicsCompressorNode | null = null;
  private distortionNode: WaveShaperNode | null = null;

  // Chorus chain
  private chorusInput: GainNode | null = null;
  private chorusDry: GainNode | null = null;
  private chorusWet: GainNode | null = null;
  private chorusDelay: DelayNode | null = null;
  private chorusFeedback: GainNode | null = null;
  private chorusLfo: OscillatorNode | null = null;
  private chorusLfoDepth: GainNode | null = null;
  private chorusOutput: GainNode | null = null;

  // Reverb chain
  private reverbInput: GainNode | null = null;
  private reverbDry: GainNode | null = null;
  private reverbWet: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbOutput: GainNode | null = null;

  private currentAudio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private isInitialized = false;

  private reverbRegenTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingReverb: { roomSize: number; damping: number } | null = null;
  private lastReverbParams = { roomSize: -1, damping: -1 };

  private frequencyBuffer: Uint8Array | null = null;
  private timeDomainBuffer: Uint8Array | null = null;

  /**
   * Moves an AudioParam to a new value without a click.
   *
   * Setting `param.value` jumps the signal, which is audible as a pop on every volume or
   * slider change. A short exponential ramp does the same thing smoothly.
   */
  private ramp(param: AudioParam, value: number, timeConstant = 0.015): void {
    const ctx = this.audioContext;
    if (!ctx) {
      param.value = value;
      return;
    }

    try {
      param.cancelScheduledValues(ctx.currentTime);
      param.setTargetAtTime(value, ctx.currentTime, timeConstant);
    } catch {
      param.value = value;
    }
  }

  private endedHandler: (() => void) | null = null;
  private errorHandler: ((error: Error) => void) | null = null;

  constructor(private config: AudioEngineConfig = { sampleRate: 44100, bufferSize: 2048 }) {}

  async initialize(): Promise<void> {
    if (this.isInitialized && this.audioContext) return;

    this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
    this.setupAudioGraph();
    this.isInitialized = true;

    // Browsers start the context suspended until a user gesture occurs.
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => undefined);
    }
  }

  private setupAudioGraph(): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    this.masterGain = ctx.createGain();
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = this.config.bufferSize;
    this.analyserNode.smoothingTimeConstant = 0.8;

    this.equalizerNodes = EQ_FREQUENCIES.map((frequency) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });

    this.compressorNode = ctx.createDynamicsCompressor();
    this.distortionNode = ctx.createWaveShaper();
    this.distortionNode.oversample = '4x';
    this.createDistortionCurve(0);

    this.setupChorus();
    this.setupReverb();

    this.connectAudioGraph();
  }

  private setupChorus(): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    this.chorusInput = ctx.createGain();
    this.chorusDry = ctx.createGain();
    this.chorusWet = ctx.createGain();
    this.chorusOutput = ctx.createGain();
    this.chorusDelay = ctx.createDelay(1);
    this.chorusFeedback = ctx.createGain();
    this.chorusLfo = ctx.createOscillator();
    this.chorusLfoDepth = ctx.createGain();

    this.chorusDelay.delayTime.value = 0.02;
    this.chorusLfo.type = 'sine';
    this.chorusLfo.frequency.value = 1.5;
    this.chorusLfoDepth.gain.value = 0.003;
    this.chorusFeedback.gain.value = 0.2;

    this.chorusLfo.connect(this.chorusLfoDepth);
    this.chorusLfoDepth.connect(this.chorusDelay.delayTime);
    this.chorusLfo.start();
  }

  private setupReverb(): void {
    const ctx = this.audioContext;
    if (!ctx) return;

    this.reverbInput = ctx.createGain();
    this.reverbDry = ctx.createGain();
    this.reverbWet = ctx.createGain();
    this.reverbOutput = ctx.createGain();
    this.reverbConvolver = ctx.createConvolver();
    this.reverbConvolver.normalize = true;
  }

  private connectAudioGraph(): void {
    const ctx = this.audioContext;
    if (!ctx || !this.masterGain || !this.analyserNode) return;

    // --- EQ chain -------------------------------------------------------
    // The source is attached to eq[0] when a track is loaded.
    for (let index = 1; index < this.equalizerNodes.length; index++) {
      this.equalizerNodes[index - 1].connect(this.equalizerNodes[index]);
    }

    let current: AudioNode = this.equalizerNodes[this.equalizerNodes.length - 1] ?? this.masterGain;

    // --- Distortion -----------------------------------------------------
    if (this.distortionNode) {
      current.connect(this.distortionNode);
      current = this.distortionNode;
    }

    // --- Chorus ---------------------------------------------------------
    if (this.chorusInput && this.chorusOutput && this.chorusDry && this.chorusWet && this.chorusDelay) {
      current.connect(this.chorusInput);

      // dry path
      this.chorusInput.connect(this.chorusDry);
      this.chorusDry.connect(this.chorusOutput);

      // wet path
      this.chorusInput.connect(this.chorusDelay);
      this.chorusDelay.connect(this.chorusWet);
      this.chorusWet.connect(this.chorusOutput);

      // feedback loop
      if (this.chorusFeedback) {
        this.chorusDelay.connect(this.chorusFeedback);
        this.chorusFeedback.connect(this.chorusDelay);
      }

      current = this.chorusOutput;
    }

    // --- Reverb ---------------------------------------------------------
    if (this.reverbInput && this.reverbOutput && this.reverbDry && this.reverbWet && this.reverbConvolver) {
      current.connect(this.reverbInput);

      this.reverbInput.connect(this.reverbDry);
      this.reverbDry.connect(this.reverbOutput);

      this.reverbInput.connect(this.reverbConvolver);
      this.reverbConvolver.connect(this.reverbWet);
      this.reverbWet.connect(this.reverbOutput);

      current = this.reverbOutput;
    }

    // --- Compressor (glue / safety limiter) ------------------------------
    // It runs last so that the wet and dry paths summing above 1.0 cannot clip.
    if (this.compressorNode) {
      current.connect(this.compressorNode);
      current = this.compressorNode;
    }

    // --- Master -> analyser -> destination -------------------------------
    current.connect(this.masterGain);
    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(ctx.destination);
  }

  async loadAudio(source: string | File): Promise<void> {
    await this.initialize();
    const ctx = this.audioContext;
    if (!ctx) throw new Error('Audio context not initialized');

    this.teardownSource();

    const element = new Audio();
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';

    // Safari refuses to play a media element that is not part of the document, so it is
    // attached hidden instead of being kept in memory only.
    element.setAttribute('aria-hidden', 'true');
    element.style.display = 'none';
    if (typeof document !== 'undefined' && document.body) {
      document.body.appendChild(element);
    }

    this.currentAudio = element;

    element.addEventListener('ended', () => {
      // Ignore events coming from an element that has already been replaced.
      if (this.currentAudio !== element) return;
      this.endedHandler?.();
    });

    element.addEventListener('error', () => {
      if (this.currentAudio !== element) return;

      const code = element.error?.code;
      const reasons: Record<number, string> = {
        1: 'Loading was aborted.',
        2: 'A network error interrupted the download.',
        3: 'The audio file could not be decoded.',
        4: 'The audio source is not supported by this browser.',
      };
      this.errorHandler?.(new Error(reasons[code ?? 4] ?? 'The audio source could not be played.'));
    });

    // The metadata listeners have to be attached before the source is assigned,
    // otherwise the loadedmetadata event can be missed.
    const metadata = this.waitForMetadata(element);

    if (typeof source === 'string') {
      element.src = source;
    } else {
      this.objectUrl = URL.createObjectURL(source);
      element.src = this.objectUrl;
    }

    this.sourceNode = ctx.createMediaElementSource(element);
    const entryPoint = this.equalizerNodes[0] ?? this.masterGain;
    if (!entryPoint) throw new Error('The audio graph is not ready.');
    this.sourceNode.connect(entryPoint);

    await metadata;
  }

  private waitForMetadata(element: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      if (element.readyState >= 1) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out while loading the audio source.'));
      }, 15000);

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('The audio source could not be loaded.'));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        element.removeEventListener('loadedmetadata', onLoaded);
        element.removeEventListener('error', onError);
      };

      element.addEventListener('loadedmetadata', onLoaded);
      element.addEventListener('error', onError);
    });
  }

  private teardownSource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.sourceNode = null;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute('src');
      this.currentAudio.load();
      this.currentAudio.remove();
      this.currentAudio = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  play(): void {
    if (!this.currentAudio) return;
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume().catch(() => undefined);
    }
    // The returned promise rejects when autoplay is blocked - report it in plain language.
    this.currentAudio.play().catch((error: unknown) => {
      const name = (error as { name?: string } | null)?.name;
      const message =
        name === 'NotAllowedError'
          ? 'Playback was blocked by the browser. Press play again to start the audio.'
          : error instanceof Error
            ? error.message
            : 'The track could not be started.';
      this.errorHandler?.(new Error(message));
    });
  }

  pause(): void {
    this.currentAudio?.pause();
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
  }

  setVolume(volume: number): void {
    if (this.masterGain) {
      this.ramp(this.masterGain.gain, Math.max(0, Math.min(1, volume)));
    }
  }

  setEqualizerBand(index: number, gain: number): void {
    const node = this.equalizerNodes[index];
    if (node) {
      this.ramp(node.gain, Math.max(-24, Math.min(24, gain)), 0.02);
    }
  }

  setAllEqualizerBands(gains: number[]): void {
    gains.forEach((gain, index) => this.setEqualizerBand(index, gain));
  }

  setReverbSettings(settings: AudioEffects['reverb']): void {
    if (!this.reverbDry || !this.reverbWet) return;

    this.ramp(this.reverbDry.gain, Math.max(0, Math.min(1, settings.dryLevel)), 0.05);
    this.ramp(this.reverbWet.gain, Math.max(0, Math.min(1, settings.wetLevel)), 0.05);

    const changed =
      this.lastReverbParams.roomSize !== settings.roomSize || this.lastReverbParams.damping !== settings.damping;

    if (!changed) return;

    this.lastReverbParams = { roomSize: settings.roomSize, damping: settings.damping };
    this.pendingReverb = { roomSize: settings.roomSize, damping: settings.damping };

    // Regenerating an impulse response is expensive, so coalesce rapid slider moves.
    if (this.reverbRegenTimer) clearTimeout(this.reverbRegenTimer);
    this.reverbRegenTimer = setTimeout(() => {
      this.reverbRegenTimer = null;
      if (this.pendingReverb) {
        this.createReverbImpulse(this.pendingReverb.roomSize, this.pendingReverb.damping);
        this.pendingReverb = null;
      }
    }, 120);
  }

  setChorusSettings(settings: AudioEffects['chorus']): void {
    if (!this.chorusDry || !this.chorusWet || !this.chorusDelay) return;

    const wet = Math.max(0, Math.min(1, settings.wetLevel));
    this.ramp(this.chorusWet.gain, wet, 0.05);
    this.ramp(this.chorusDry.gain, 1 - wet, 0.05);

    if (this.chorusLfo) {
      this.ramp(this.chorusLfo.frequency, Math.max(0.05, Math.min(20, settings.rate)), 0.05);
    }
    if (this.chorusLfoDepth) {
      this.ramp(this.chorusLfoDepth.gain, Math.max(0, Math.min(1, settings.depth)) * 0.008, 0.05);
    }
    if (this.chorusFeedback) {
      this.ramp(this.chorusFeedback.gain, Math.max(0, Math.min(0.85, settings.feedback)), 0.05);
    }
  }

  setCompressorSettings(settings: AudioEffects['compressor']): void {
    if (!this.compressorNode) return;
    this.ramp(this.compressorNode.threshold, settings.threshold, 0.05);
    this.ramp(this.compressorNode.knee, settings.knee, 0.05);
    this.ramp(this.compressorNode.ratio, settings.ratio, 0.05);
    this.ramp(this.compressorNode.attack, settings.attack, 0.05);
    this.ramp(this.compressorNode.release, settings.release, 0.05);
  }

  setDistortionAmount(amount: number): void {
    this.createDistortionCurve(amount);
  }

  setDistortionOversample(oversample: OverSampleType): void {
    if (this.distortionNode) {
      this.distortionNode.oversample = oversample;
    }
  }

  /**
   * Returns the current frequency data.
   *
   * The buffer is reused between calls - the visualiser reads it every frame, so allocating a
   * new array each time would create 60 allocations per second per visualiser. Treat the
   * result as read-only and copy it if you need to keep it.
   */
  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return EMPTY_DATA;

    if (!this.frequencyBuffer || this.frequencyBuffer.length !== this.analyserNode.frequencyBinCount) {
      this.frequencyBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);
    }

    this.analyserNode.getByteFrequencyData(this.frequencyBuffer);
    return this.frequencyBuffer;
  }

  /** Returns the current time domain data. The buffer is reused - see getFrequencyData. */
  getTimeDomainData(): Uint8Array {
    if (!this.analyserNode) return EMPTY_DATA;

    if (!this.timeDomainBuffer || this.timeDomainBuffer.length !== this.analyserNode.frequencyBinCount) {
      this.timeDomainBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);
    }

    this.analyserNode.getByteTimeDomainData(this.timeDomainBuffer);
    return this.timeDomainBuffer;
  }

  getCurrentTime(): number {
    return this.currentAudio?.currentTime || 0;
  }

  getDuration(): number {
    const duration = this.currentAudio?.duration;
    return Number.isFinite(duration) ? duration : 0;
  }

  setCurrentTime(time: number): void {
    if (this.currentAudio) {
      this.currentAudio.currentTime = Math.max(0, time);
    }
  }

  getAudioElement(): HTMLAudioElement | null {
    return this.currentAudio;
  }

  getInfo(): AudioEngineInfo {
    const ctx = this.audioContext;
    return {
      sampleRate: ctx?.sampleRate ?? this.config.sampleRate,
      channelCount: ctx?.destination.channelCount ?? 2,
      bufferSize: this.config.bufferSize,
      baseLatency: ctx?.baseLatency ?? 0,
      outputLatency: (ctx as (AudioContext & { outputLatency?: number }) | null)?.outputLatency ?? 0,
      state: ctx?.state ?? 'closed',
    };
  }

  setEndedHandler(handler: (() => void) | null): void {
    this.endedHandler = handler;
  }

  setErrorHandler(handler: ((error: Error) => void) | null): void {
    this.errorHandler = handler;
  }

  private createReverbImpulse(roomSize: number = 0.5, damping: number = 0.5): void {
    const ctx = this.audioContext;
    if (!ctx || !this.reverbConvolver) return;

    const sampleRate = ctx.sampleRate;
    // 0.4s (small room) .. 3s (huge hall)
    const seconds = 0.4 + Math.max(0, Math.min(1, roomSize)) * 2.6;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const impulse = ctx.createBuffer(2, length, sampleRate);

    // Damping controls how quickly high frequencies decay -> one-pole lowpass.
    const dampingFactor = 0.15 + Math.max(0, Math.min(1, damping)) * 0.7;

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < length; i++) {
        const progress = i / length;
        const decay = Math.pow(1 - progress, 2 + (1 - damping) * 4);
        const noise = Math.random() * 2 - 1;
        previous = previous * dampingFactor + noise * (1 - dampingFactor);
        channelData[i] = previous * decay * Math.max(0, Math.min(1, roomSize) * 1.2);
      }
    }

    this.reverbConvolver.buffer = impulse;
  }

  private createDistortionCurve(amount: number): void {
    if (!this.distortionNode) return;

    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;
    const drive = Math.max(0, Math.min(100, amount));

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + drive) * x * 20 * deg) / (Math.PI + drive * Math.abs(x));
    }

    this.distortionNode.curve = curve;
  }

  dispose(): void {
    this.stop();
    this.teardownSource();

    if (this.chorusLfo) {
      try {
        this.chorusLfo.stop();
      } catch {
        /* not started */
      }
    }

    if (this.reverbRegenTimer) {
      clearTimeout(this.reverbRegenTimer);
      this.reverbRegenTimer = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }

    this.isInitialized = false;
  }
}
