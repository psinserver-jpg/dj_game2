/**
 * Web Audio API Sound Engine & Multi-track Synthesizer
 * Provides jitter-free synthesized music, hitsounds, and latency calibration.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Track playback state
  private isPlaying = false;
  private isPreviewPlaying = false;
  private songStartTime = 0;
  private pauseOffset = 0;
  private bpm = 128;
  private currentPatternId: string | null = null;
  private schedulerTimerId: number | null = null;
  private previewTimerId: number | null = null;
  private currentStep = 0;
  private songTotalDuration = 60;

  // Custom audio playback
  private customBufferSource: AudioBufferSourceNode | null = null;
  private customAudioBuffer: AudioBuffer | null = null;

  // Volumes
  private musicVolume = 0.7;
  private sfxVolume = 0.8;

  constructor() {
    // AudioContext will be initialized on first user gesture
  }

  public init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.8;

      this.musicGain.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public setVolumes(music: number, sfx: number) {
    this.musicVolume = Math.max(0, Math.min(1, music));
    this.sfxVolume = Math.max(0, Math.min(1, sfx));

    if (this.ctx && this.musicGain && this.sfxGain) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  public getAnalyserData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(16);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) return this.pauseOffset;
    return this.ctx.currentTime - this.songStartTime;
  }

  public getAudioContextTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // --- Hitsound Synthesizer ---
  public playHitSound(lane: number) {
    if (!this.ctx || !this.sfxGain) this.init();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    
    // Musical pitch per lane: C5, E5, G5, C6 (Penta/Harmonic arpeggio feel)
    const pitches = [523.25, 659.25, 783.99, 1046.50];
    const freq = pitches[lane % pitches.length];

    // 1. Crystal Harmonic Bell / Tonal Ping
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.98, t + 0.12);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);

    // 2. High-transient Crisp Wood / Clap Click
    const bufferSize = this.ctx.sampleRate * 0.04;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800, t);
    filter.Q.setValueAtTime(3.0, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    noise.start(t);
  }

  public playCalibrationMetronome() {
    this.init();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.06);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // --- Instrument Synthesis Blocks ---
  private triggerKick(time: number, accent = 1.0) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, time);
    osc.frequency.exponentialRampToValueAtTime(36, time + 0.12);

    gain.gain.setValueAtTime(0.85 * accent, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + 0.26);
  }

  private triggerSnare(time: number, accent = 1.0) {
    if (!this.ctx || !this.musicGain) return;

    // Tone body
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(185, time);
    oscGain.gain.setValueAtTime(0.4 * accent, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.13);

    // Noise snap
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, time);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.55 * accent, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.musicGain);
    noise.start(time);
  }

  private triggerHiHat(time: number, open = false) {
    if (!this.ctx || !this.musicGain) return;
    const dur = open ? 0.15 : 0.045;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7500, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(open ? 0.35 : 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(time);
  }

  private triggerBass(time: number, freq: number, duration: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, time);
    filter.frequency.linearRampToValueAtTime(650, time + 0.04);
    filter.frequency.exponentialRampToValueAtTime(200, time + duration);
    filter.Q.setValueAtTime(4.0, time);

    gain.gain.setValueAtTime(0.38, time);
    gain.gain.setValueAtTime(0.38, time + duration * 0.8);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(time);
    osc.stop(time + duration);
  }

  private triggerLead(time: number, freq: number, duration: number, type: OscillatorType = 'sawtooth') {
    if (!this.ctx || !this.musicGain) return;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc1.type = type;
    osc1.frequency.setValueAtTime(freq, time);

    osc2.type = type;
    // Slight detune for wide supersaw / chorus texture
    osc2.frequency.setValueAtTime(freq * 1.004, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, time);
    filter.Q.setValueAtTime(2.5, time);

    gain.gain.setValueAtTime(0.24, time);
    gain.gain.setValueAtTime(0.22, time + duration * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration);
    osc2.stop(time + duration);
  }

  private triggerChord(time: number, freqs: number[], duration: number) {
    if (!this.ctx || !this.musicGain) return;
    const chordGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, time);
    filter.Q.setValueAtTime(1.2, time);

    chordGain.gain.setValueAtTime(0.12, time);
    chordGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    chordGain.connect(filter);
    filter.connect(this.musicGain);

    freqs.forEach(f => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, time);
      osc.connect(chordGain);
      osc.start(time);
      osc.stop(time + duration);
    });
  }

  // --- Procedural / Pre-composed Synthesized Patterns ---
  // Step scheduler runs at 16th notes (4 steps per beat)
  private schedulePatternStep(patternId: string, step: number, time: number, stepDuration: number) {
    const beat = Math.floor(step / 4);
    const subStep = step % 4; // 0, 1, 2, 3

    if (patternId === 'neon_velocity') {
      // DnB / Cyberpunk: 140 BPM, high octane breakbeat rhythm
      // Kick on beat 0 and beat 2.5
      if (beat % 4 === 0 && subStep === 0) this.triggerKick(time, 1.0);
      if (beat % 4 === 2 && subStep === 2) this.triggerKick(time, 0.9);

      // Snare on beat 1 and beat 3
      if ((beat % 4 === 1 || beat % 4 === 3) && subStep === 0) this.triggerSnare(time, 1.0);

      // Hi-hats: rapid 16th pattern
      this.triggerHiHat(time, subStep === 2);

      // Bass notes: F2, G#2, D#2, C2 progression
      const bassProg = [87.31, 87.31, 103.83, 77.78, 65.41, 65.41, 77.78, 87.31];
      const currentBass = bassProg[Math.floor(beat / 2) % bassProg.length];
      if (subStep === 0 || (subStep === 2 && beat % 2 === 1)) {
        this.triggerBass(time, currentBass, stepDuration * 1.8);
      }

      // Fast cyberpunk synth arpeggio
      const melodyNotes = [349.23, 415.30, 523.25, 622.25, 698.46, 523.25, 415.30, 349.23];
      const leadFreq = melodyNotes[step % melodyNotes.length];
      if (beat >= 4) {
        this.triggerLead(time, leadFreq, stepDuration * 0.9, 'sawtooth');
      }
    } else if (patternId === 'midnight_tokyo') {
      // Synthwave / City Pop: 115 BPM, four-on-the-floor + gated snare + lush chords
      if (subStep === 0) {
        this.triggerKick(time, 1.0);
      }
      if ((beat % 4 === 1 || beat % 4 === 3) && subStep === 0) {
        this.triggerSnare(time, 1.1);
      }
      if (subStep === 2) {
        this.triggerHiHat(time, false);
      }

      // 80s rolling bassline: octaves
      const root = [110, 110, 130.81, 98.0][Math.floor(beat / 4) % 4];
      const bassFreq = subStep % 2 === 0 ? root : root * 2;
      this.triggerBass(time, bassFreq, stepDuration * 0.85);

      // Lush synth chords on beat 0 and 2
      if (subStep === 0 && beat % 2 === 0) {
        const chordIndex = Math.floor(beat / 4) % 4;
        const chords = [
          [220, 261.63, 329.63, 415.30], // Am7
          [261.63, 329.63, 392.00, 493.88], // Cmaj7
          [174.61, 220.00, 261.63, 329.63], // Fmaj7
          [196.00, 246.94, 293.66, 369.99], // G7
        ];
        this.triggerChord(time, chords[chordIndex], stepDuration * 7);
      }

      // Lyrical Lead Synth
      if (subStep === 0 && beat % 2 === 1) {
        const leadScale = [440, 493.88, 523.25, 659.25, 783.99];
        const note = leadScale[(beat * 3) % leadScale.length];
        this.triggerLead(time, note, stepDuration * 3.5, 'triangle');
      }
    } else if (patternId === 'solar_overdrive') {
      // Speedcore / Chiptune: 160 BPM, rapid pulse
      if (subStep === 0) {
        this.triggerKick(time, 1.1);
      }
      if ((beat % 2 === 1) && subStep === 0) {
        this.triggerSnare(time, 0.95);
      }
      this.triggerHiHat(time, subStep === 1 || subStep === 3);

      // Rapid Chiptune Bass
      const roots = [130.81, 146.83, 164.81, 196.0];
      const r = roots[Math.floor(beat / 4) % roots.length];
      this.triggerBass(time, r, stepDuration * 0.9);

      // High velocity 16th chiptune square arpeggios
      const chipScale = [523.25, 659.25, 783.99, 1046.50, 783.99, 659.25];
      const chipNote = chipScale[step % chipScale.length];
      this.triggerLead(time, chipNote, stepDuration * 0.75, 'square');
    } else if (patternId === 'starlight_lullaby') {
      // Lo-Fi Future Bass: 95 BPM, mellow, warm
      if ((beat % 4 === 0 || beat % 4 === 2) && subStep === 0) {
        this.triggerKick(time, 0.8);
      }
      if ((beat % 4 === 1 || beat % 4 === 3) && subStep === 0) {
        this.triggerSnare(time, 0.75);
      }
      if (subStep === 2) {
        this.triggerHiHat(time, false);
      }

      // Warm Sub Bass
      const lofiRoots = [65.41, 87.31, 98.00, 77.78];
      const curLofi = lofiRoots[Math.floor(beat / 4) % lofiRoots.length];
      if (subStep === 0) {
        this.triggerBass(time, curLofi, stepDuration * 3.5);
      }

      // Warm E.Piano / Chime chords
      if (subStep === 0 && beat % 4 === 0) {
        const chordIdx = Math.floor(beat / 4) % 4;
        const chords = [
          [261.63, 329.63, 392.0, 493.88],
          [220.0, 261.63, 329.63, 392.0],
          [174.61, 220.0, 261.63, 329.63],
          [196.0, 246.94, 293.66, 392.0],
        ];
        this.triggerChord(time, chords[chordIdx], stepDuration * 14);
      }

      if (subStep === 0 && beat % 2 === 0) {
        const bells = [523.25, 587.33, 659.25, 783.99, 880.0];
        const bell = bells[(beat * 2) % bells.length];
        this.triggerLead(time, bell, stepDuration * 2.5, 'sine');
      }
    }
  }

  // --- Clock & Scheduler Loop ---
  public startSong(
    patternId: string,
    bpm: number,
    duration: number,
    startOffset = 0,
    customBuffer?: AudioBuffer
  ) {
    this.init();
    this.stop(); // Stop any previous playback

    if (!this.ctx) return;

    this.bpm = bpm;
    this.currentPatternId = patternId;
    this.songTotalDuration = duration;
    this.pauseOffset = startOffset;
    this.isPlaying = true;

    // Reset step tracker
    const stepDuration = 60 / bpm / 4;
    this.currentStep = Math.floor(startOffset / stepDuration);
    this.songStartTime = this.ctx.currentTime - startOffset;

    if (customBuffer) {
      this.customAudioBuffer = customBuffer;
      this.customBufferSource = this.ctx.createBufferSource();
      this.customBufferSource.buffer = customBuffer;
      if (this.musicGain) this.customBufferSource.connect(this.musicGain);
      this.customBufferSource.start(0, startOffset);
      return;
    }

    // Schedule synthesized music loop using look-ahead scheduler
    const lookAheadTime = 0.15; // 150ms lookahead
    let nextStepTime = this.ctx.currentTime;

    const scheduler = () => {
      if (!this.isPlaying || !this.ctx) return;

      while (nextStepTime < this.ctx.currentTime + lookAheadTime) {
        const songElapsed = nextStepTime - this.songStartTime;
        if (songElapsed >= this.songTotalDuration) {
          this.stop();
          return;
        }

        if (this.currentPatternId) {
          this.schedulePatternStep(this.currentPatternId, this.currentStep, nextStepTime, stepDuration);
        }

        this.currentStep++;
        nextStepTime += stepDuration;
      }

      this.schedulerTimerId = window.setTimeout(scheduler, 25);
    };

    scheduler();
  }

  public playPreview(patternId: string, bpm: number, start = 15, duration = 8) {
    this.stopPreview();
    this.init();
    if (!this.ctx) return;

    this.isPreviewPlaying = true;
    const stepDuration = 60 / bpm / 4;
    let currentPreviewStep = Math.floor(start / stepDuration);
    let nextStepTime = this.ctx.currentTime;
    const previewEndTime = this.ctx.currentTime + duration;

    const scheduler = () => {
      if (!this.isPreviewPlaying || !this.ctx) return;
      if (this.ctx.currentTime >= previewEndTime) {
        this.stopPreview();
        return;
      }

      while (nextStepTime < this.ctx.currentTime + 0.15) {
        this.schedulePatternStep(patternId, currentPreviewStep, nextStepTime, stepDuration);
        currentPreviewStep++;
        nextStepTime += stepDuration;
      }

      this.previewTimerId = window.setTimeout(scheduler, 25);
    };

    scheduler();
  }

  public stopPreview() {
    this.isPreviewPlaying = false;
    if (this.previewTimerId) {
      clearTimeout(this.previewTimerId);
      this.previewTimerId = null;
    }
  }

  public pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getCurrentTime();
    this.stop();
  }

  public resume() {
    if (!this.currentPatternId) return;
    this.startSong(
      this.currentPatternId,
      this.bpm,
      this.songTotalDuration,
      this.pauseOffset,
      this.customAudioBuffer || undefined
    );
  }

  public stop() {
    this.isPlaying = false;
    if (this.schedulerTimerId) {
      clearTimeout(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    if (this.customBufferSource) {
      try {
        this.customBufferSource.stop();
        this.customBufferSource.disconnect();
      } catch {
        // Source might already have stopped
      }
      this.customBufferSource = null;
    }
  }

  public async decodeAudioFile(file: File): Promise<AudioBuffer> {
    this.init();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    const arrayBuffer = await file.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }
}

export const soundEngine = new SoundEngine();
