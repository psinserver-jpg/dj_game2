/**
 * Web Audio API Sound Engine & Multi-track Synthesizer
 * Provides jitter-free synthesized music, generated-track playback, hitsounds, and latency calibration.
 */

import { getPatternEvents } from '../data/patterns';

const SFX_URLS = { hit: '/sfx/hit.wav', clear: '/sfx/clear.wav' } as const;

// A decoded 2-minute stereo track is ~40 MB of PCM, so only the most recent few are kept.
const MAX_CACHED_TRACKS = 3;
const PREVIEW_FADE_SEC = 0.35;
const PREVIEW_STOP_FADE_SEC = 0.08;
const END_FADE_SEC = 0.6;

export type AudioPreviewResult = 'playing' | 'cancelled' | 'failed';

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
  private customTrackGain: GainNode | null = null; // per-track gain so a run can fade out at the end
  private customAudioBuffer: AudioBuffer | null = null;

  // Generated tracks by URL, oldest first (LRU): pending/settled loads and finished decodes
  private audioLoads = new Map<string, Promise<AudioBuffer>>();
  private decodedAudio = new Map<string, AudioBuffer>();

  // Buffer preview for generated songs
  private previewSource: AudioBufferSourceNode | null = null;
  private previewGain: GainNode | null = null;
  private previewRequest = 0; // bumped by stopPreview(), so a newer request cancels older ones

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
    this.loadSfx();

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

  /** Song position of the sound coming out of the speakers right now (not the render clock). */
  public getCurrentTime(): number {
    if (!this.isPlaying || !this.ctx) return this.pauseOffset;
    return this.getHeardContextTime() - this.songStartTime;
  }

  /** Output latency (render -> speaker) in seconds, e.g. ~0.05 s wired, 0.2 s+ on Bluetooth. */
  public getOutputLatency(): number {
    if (!this.ctx) return 0;
    return this.ctx.currentTime - this.getHeardContextTime();
  }

  // ctx.currentTime runs ahead of what the player hears by the device's output latency.
  // getOutputTimestamp() tells which context time is at the speaker right now.
  private getHeardContextTime(): number {
    const ctx = this.ctx!;
    if (typeof ctx.getOutputTimestamp === 'function') {
      const ts = ctx.getOutputTimestamp();
      if (ts.contextTime !== undefined && ts.performanceTime !== undefined && ts.performanceTime > 0) {
        const heard = ts.contextTime + (performance.now() - ts.performanceTime) / 1000;
        // Guard against bogus timestamps (e.g. right after resume)
        if (heard <= ctx.currentTime + 0.001 && heard > ctx.currentTime - 1) return heard;
      }
    }
    return ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
  }

  public getAudioContextTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // --- Hitsound Synthesizer ---
  // --- Sampled sound effects (public/sfx, rendered by music/sfx.mjs) ---
  private sfxBuffers: Record<string, AudioBuffer | null> = {};
  private sfxLoading: Record<string, Promise<void> | undefined> = {};

  /** Fetch + decode the effect samples once (called on the first user gesture via init()). */
  public loadSfx() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const [name, url] of Object.entries(SFX_URLS)) {
      if (this.sfxBuffers[name] || this.sfxLoading[name]) continue;
      this.sfxLoading[name] = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.arrayBuffer();
        })
        .then((data) => ctx.decodeAudioData(data))
        .then((buf) => {
          this.sfxBuffers[name] = buf;
        })
        .catch((err) => {
          console.warn(`[soundEngine] sfx ${url} failed:`, err);
          this.sfxLoading[name] = undefined;
        });
    }
  }

  private playSfx(name: keyof typeof SFX_URLS, gain = 1) {
    if (!this.ctx || !this.sfxGain) this.init();
    const buf = this.sfxBuffers[name];
    if (!this.ctx || !this.sfxGain || !buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.sfxGain);
    src.start();
  }

  /** Note hit: one pitch-less percussive sample for every lane, so it never clashes with the song. */
  public playHitSound(_lane: number) {
    this.playSfx('hit', 0.9);
  }

  /** Stage clear fanfare on the result screen. */
  public playClearSound() {
    this.playSfx('clear', 0.8);
  }

  public playCalibrationMetronome() {
    this.init();
    this.playSfx('hit', 1);
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

  // --- Built-in Synth Arrangements (see data/patterns.ts) ---
  // Step scheduler runs at 16th notes (4 steps per beat)
  private schedulePatternStep(patternId: string, step: number, time: number, stepDuration: number) {
    for (const ev of getPatternEvents(patternId, step)) {
      switch (ev.inst) {
        case 'kick':
          this.triggerKick(time, ev.accent);
          break;
        case 'snare':
          this.triggerSnare(time, ev.accent);
          break;
        case 'hat':
          this.triggerHiHat(time, ev.open);
          break;
        case 'bass':
          this.triggerBass(time, ev.freq, stepDuration * ev.steps);
          break;
        case 'lead':
          this.triggerLead(time, ev.freq, stepDuration * ev.steps, ev.wave);
          break;
        case 'chord':
          this.triggerChord(time, ev.freqs, stepDuration * ev.steps);
          break;
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
    this.stopPreview();

    if (!this.ctx) return;

    this.bpm = bpm;
    this.currentPatternId = patternId;
    this.songTotalDuration = duration;
    this.pauseOffset = startOffset;
    this.isPlaying = true;
    // Remember (or forget) the track so resume() never replays a previous song's buffer
    this.customAudioBuffer = customBuffer ?? null;

    // Reset step tracker
    const stepDuration = 60 / bpm / 4;
    this.currentStep = Math.floor(startOffset / stepDuration);
    this.songStartTime = this.ctx.currentTime - startOffset;

    if (customBuffer) {
      const source = this.ctx.createBufferSource();
      const trackGain = this.ctx.createGain();
      source.buffer = customBuffer;
      source.connect(trackGain);
      if (this.musicGain) trackGain.connect(this.musicGain);
      source.onended = () => {
        source.disconnect();
        trackGain.disconnect();
      };
      source.start(0, startOffset);
      this.customBufferSource = source;
      this.customTrackGain = trackGain;
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

  /** Preview a synth arrangement; onEnded runs only when it stops by itself (not via stopPreview). */
  public playPreview(patternId: string, bpm: number, start = 15, duration = 8, onEnded?: () => void) {
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
        onEnded?.();
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

  /**
   * Preview a segment of a generated track with a short fade in/out; it stops by itself.
   * Resolves 'cancelled' when another preview, stopPreview() or a song start came first.
   * onEnded runs only when a started preview finishes by itself (not via stopPreview).
   */
  public async playAudioPreview(
    url: string,
    start: number,
    duration: number,
    onEnded?: () => void
  ): Promise<AudioPreviewResult> {
    this.stopPreview();
    const request = this.previewRequest;
    this.init();

    let buffer: AudioBuffer;
    try {
      buffer = this.getLoadedAudio(url) ?? (await this.loadAudio(url));
    } catch (err) {
      if (request !== this.previewRequest) return 'cancelled';
      console.warn(`[soundEngine] Could not load preview audio ${url}:`, err);
      return 'failed';
    }
    if (request !== this.previewRequest || this.isPlaying) return 'cancelled';

    const ctx = this.ctx;
    const out = this.musicGain;
    if (!ctx || !out) return 'failed';

    const offset = Math.min(Math.max(0, start), Math.max(0, buffer.duration - 1));
    const length = Math.min(Math.max(0.5, duration), buffer.duration - offset);
    if (!(length > 0)) return 'failed';
    const fade = Math.min(PREVIEW_FADE_SEC, length / 4);
    const t0 = ctx.currentTime + 0.02;
    const tEnd = t0 + length;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + fade);
    gain.gain.setValueAtTime(1, tEnd - fade);
    gain.gain.linearRampToValueAtTime(0, tEnd);
    gain.connect(out);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      // stopPreview() clears previewSource before stopping, so a match means it ended by itself
      if (this.previewSource === source) {
        this.previewSource = null;
        this.previewGain = null;
        onEnded?.();
      }
    };
    source.start(t0, offset, length);

    this.previewSource = source;
    this.previewGain = gain;
    return 'playing';
  }

  /** Stops both the synth preview and the generated-track preview (and cancels pending loads). */
  public stopPreview() {
    this.previewRequest++;
    this.isPreviewPlaying = false;
    if (this.previewTimerId) {
      clearTimeout(this.previewTimerId);
      this.previewTimerId = null;
    }

    const source = this.previewSource;
    const gain = this.previewGain;
    this.previewSource = null;
    this.previewGain = null;
    if (source && gain && this.ctx) {
      // Quick fade instead of a hard cut, which would click
      const now = this.ctx.currentTime;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + PREVIEW_STOP_FADE_SEC);
        source.stop(now + PREVIEW_STOP_FADE_SEC + 0.01);
      } catch {
        // Source might already have stopped
      }
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
    if (this.customTrackGain) {
      this.customTrackGain.disconnect();
      this.customTrackGain = null;
    }
  }

  /**
   * Like stop(), but a buffer track fades out over fadeSec instead of cutting off with a click.
   * Synth notes that are already scheduled simply ring out.
   */
  public fadeOutAndStop(fadeSec = END_FADE_SEC) {
    const source = this.customBufferSource;
    const trackGain = this.customTrackGain;
    // Detach first so stop() leaves this track alone; its onended handler disconnects it
    this.customBufferSource = null;
    this.customTrackGain = null;
    this.stop();
    if (!source || !trackGain || !this.ctx) return;

    const now = this.ctx.currentTime;
    try {
      trackGain.gain.cancelScheduledValues(now);
      trackGain.gain.setValueAtTime(trackGain.gain.value, now);
      trackGain.gain.linearRampToValueAtTime(0, now + fadeSec);
      source.stop(now + fadeSec);
    } catch {
      // Source might already have stopped
    }
  }

  public async decodeAudioFile(file: File): Promise<AudioBuffer> {
    this.init();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    const arrayBuffer = await file.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  // --- Generated tracks (public/music/*.mp3) ---

  /** Fetch + decode a track once; concurrent callers share the request, failures are not cached. */
  public loadAudio(url: string): Promise<AudioBuffer> {
    const pending = this.audioLoads.get(url);
    if (pending) {
      this.touchTrack(url, pending);
      return pending;
    }

    const request = this.fetchAndDecode(url);
    this.audioLoads.set(url, request);
    this.evictOldTracks();
    request.then(
      (buffer) => {
        if (this.audioLoads.get(url) === request) this.decodedAudio.set(url, buffer);
      },
      () => {
        if (this.audioLoads.get(url) === request) this.audioLoads.delete(url);
      }
    );
    return request;
  }

  /** The decoded track if loadAudio(url) already finished, otherwise null. */
  public getLoadedAudio(url: string): AudioBuffer | null {
    const buffer = this.decodedAudio.get(url);
    if (!buffer) return null;
    const request = this.audioLoads.get(url);
    if (request) this.touchTrack(url, request);
    return buffer;
  }

  private async fetchAndDecode(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const data = await res.arrayBuffer();
    this.init();
    if (!this.ctx) throw new Error('AudioContext unavailable');
    return await this.ctx.decodeAudioData(data);
  }

  private touchTrack(url: string, request: Promise<AudioBuffer>) {
    // Map keeps insertion order, so re-inserting marks the track as most recently used
    this.audioLoads.delete(url);
    this.audioLoads.set(url, request);
  }

  private evictOldTracks() {
    while (this.audioLoads.size > MAX_CACHED_TRACKS) {
      const oldest = this.audioLoads.keys().next().value;
      if (oldest === undefined) break;
      this.audioLoads.delete(oldest);
      this.decodedAudio.delete(oldest);
    }
  }
}

export const soundEngine = new SoundEngine();
