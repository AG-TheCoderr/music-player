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

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private equalizerNodes: BiquadFilterNode[] = [];
  private reverbNode: ConvolverNode | null = null;
  private chorusNode: DelayNode | null = null;
  private distortionNode: WaveShaperNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private splitterNode: ChannelSplitterNode | null = null;
  private mergerNode: ChannelMergerNode | null = null;
  
  private currentAudio: HTMLAudioElement | null = null;
  private isInitialized = false;

  constructor(private config: AudioEngineConfig = { sampleRate: 44100, bufferSize: 2048 }) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate,
    });

    // Create the audio graph
    this.setupAudioGraph();
    this.isInitialized = true;
  }

  private setupAudioGraph(): void {
    if (!this.audioContext) return;

    // Create nodes
    this.gainNode = this.audioContext.createGain();
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = this.config.bufferSize;
    
    // Create equalizer bands (10-band EQ)
    const frequencies = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    this.equalizerNodes = frequencies.map(freq => {
      const filter = this.audioContext!.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });

    // Create reverb
    this.reverbNode = this.audioContext.createConvolver();
    this.createReverbImpulse();

    // Create chorus
    this.chorusNode = this.audioContext.createDelay(1);
    
    // Create distortion
    this.distortionNode = this.audioContext.createWaveShaper();
    this.createDistortionCurve(0);

    // Create compressor
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    
    // Create splitter/merger for stereo processing
    this.splitterNode = this.audioContext.createChannelSplitter(2);
    this.mergerNode = this.audioContext.createChannelMerger(2);

    // Connect the audio graph
    this.connectAudioGraph();
  }

  private connectAudioGraph(): void {
    if (!this.audioContext || !this.gainNode || !this.analyserNode) return;

    // Chain: source -> EQ -> effects -> gain -> analyser -> destination
    let currentNode: AudioNode = this.gainNode;

    // Connect EQ chain
    this.equalizerNodes.forEach((filter, index) => {
      if (index === 0) {
        currentNode.connect(filter);
      } else {
        this.equalizerNodes[index - 1].connect(filter);
      }
    });

    if (this.equalizerNodes.length > 0) {
      currentNode = this.equalizerNodes[this.equalizerNodes.length - 1];
    }

    // Connect effects
    if (this.compressorNode) {
      currentNode.connect(this.compressorNode);
      currentNode = this.compressorNode;
    }

    if (this.distortionNode) {
      currentNode.connect(this.distortionNode);
      currentNode = this.distortionNode;
    }

    // Connect to analyser and destination
    currentNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);
  }

  async loadAudio(source: string | File): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.audioContext) throw new Error('Audio context not initialized');

    // Stop current audio
    this.stop();

    // Create audio element
    this.currentAudio = new Audio();
    this.currentAudio.crossOrigin = 'anonymous';
    
    if (typeof source === 'string') {
      this.currentAudio.src = source;
    } else {
      this.currentAudio.src = URL.createObjectURL(source);
    }

    // Create source node
    this.sourceNode = this.audioContext.createMediaElementSource(this.currentAudio);
    
    // Connect to audio graph
    if (this.gainNode) {
      this.sourceNode.connect(this.gainNode);
    }
  }

  play(): void {
    if (this.currentAudio) {
      this.currentAudio.play();
    }
  }

  pause(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  setEqualizerBand(index: number, gain: number): void {
    if (this.equalizerNodes[index]) {
      this.equalizerNodes[index].gain.value = gain;
    }
  }

  setAllEqualizerBands(gains: number[]): void {
    gains.forEach((gain, index) => {
      this.setEqualizerBand(index, gain);
    });
  }

  setReverbSettings(settings: AudioEffects['reverb']): void {
    if (this.reverbNode) {
      this.createReverbImpulse(settings.roomSize, settings.damping);
    }
  }

  setCompressorSettings(settings: AudioEffects['compressor']): void {
    if (this.compressorNode) {
      this.compressorNode.threshold.value = settings.threshold;
      this.compressorNode.knee.value = settings.knee;
      this.compressorNode.ratio.value = settings.ratio;
      this.compressorNode.attack.value = settings.attack;
      this.compressorNode.release.value = settings.release;
    }
  }

  setDistortionAmount(amount: number): void {
    if (this.distortionNode) {
      this.createDistortionCurve(amount);
    }
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0);
    
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteFrequencyData(dataArray);
    return dataArray;
  }

  getTimeDomainData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0);
    
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyserNode.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  getCurrentTime(): number {
    return this.currentAudio?.currentTime || 0;
  }

  getDuration(): number {
    return this.currentAudio?.duration || 0;
  }

  setCurrentTime(time: number): void {
    if (this.currentAudio) {
      this.currentAudio.currentTime = time;
    }
  }

  getAudioElement(): HTMLAudioElement | null {
    return this.currentAudio;
  }

  private createReverbImpulse(roomSize: number = 0.5, damping: number = 0.5): void {
    if (!this.audioContext || !this.reverbNode) return;

    const sampleRate = this.audioContext.sampleRate;
    const length = sampleRate * 2; // 2 second reverb
    const impulse = this.audioContext.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, damping * 10);
        channelData[i] = (Math.random() * 2 - 1) * decay * roomSize;
      }
    }

    this.reverbNode.buffer = impulse;
  }

  private createDistortionCurve(amount: number): void {
    if (!this.distortionNode) return;

    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }

    this.distortionNode.curve = curve;
    this.distortionNode.oversample = '4x';
  }

  dispose(): void {
    this.stop();
    
    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }
    
    if (this.audioContext) {
      this.audioContext.close();
    }
    
    this.isInitialized = false;
  }
}