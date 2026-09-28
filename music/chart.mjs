// Turns the Lyria-generated audio in music/raw/ into rhythm-game charts and the web manifest.
//
//   node music/chart.mjs                    # every song in songs.json that has raw audio
//   node music/chart.mjs neon-velocity ...  # only these ids (others keep their manifest entry)
//   node music/chart.mjs --test             # self-test on synthetic audio (writes nothing)
//
// Pipeline: decode (mp3 via mpg123-decoder, wav via the RIFF parser below) -> mono ->
// STFT (own FFT, Hann ~2048 / hop ~512) -> log-band spectral flux -> onsets (time, strength,
// band, sustain) -> tempo + beat phase search around the prompt BPM -> buildBeatmaps() from
// src/data/chartBuilder.ts -> public/music/<id>.mp3 + public/music/manifest.json.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildBeatmaps } from '../src/data/chartBuilder.ts';

const MUSIC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(MUSIC_DIR, '..');
const RAW_DIR = join(MUSIC_DIR, 'raw');
const OUT_DIR = join(ROOT, 'public', 'music');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json');
const DIFFICULTIES = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
const PREVIEW_SEC = 12;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod = (a, m) => ((a % m) + m) % m;

// ---------------------------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------------------------

const ascii = (b, at, len) => String.fromCharCode(...b.subarray(at, at + len));

export function isWav(bytes) {
  return bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE';
}

/** Minimal RIFF/WAVE reader: PCM 8/16/24/32-bit, float 32/64-bit, WAVE_FORMAT_EXTENSIBLE. */
export function decodeWav(bytes) {
  if (!isWav(bytes)) throw new Error('RIFF/WAVE 파일이 아닙니다');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt = null;
  let dataOff = -1;
  let dataLen = 0;
  for (let p = 12; p + 8 <= bytes.length; ) {
    const id = ascii(bytes, p, 4);
    const size = view.getUint32(p + 4, true);
    const body = p + 8;
    if (id === 'fmt ') {
      let format = view.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(body + 24, true); // extensible -> sub-format
      fmt = {
        format,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        blockAlign: view.getUint16(body + 12, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === 'data') {
      dataOff = body;
      // streaming writers leave the size at 0 or 0xFFFFFFFF; trust the file length then
      dataLen = size === 0 || size === 0xffffffff ? bytes.length - body : Math.min(size, bytes.length - body);
      if (fmt) break;
    }
    if (size === 0xffffffff) break;
    p = body + size + (size & 1);
  }
  if (!fmt) throw new Error('WAV에 fmt 청크가 없습니다');
  if (dataOff < 0) throw new Error('WAV에 data 청크가 없습니다');
  const { format, channels, sampleRate, blockAlign } = fmt;
  const width = blockAlign / channels; // container bytes per sample
  if (!channels || !Number.isInteger(width)) throw new Error('지원하지 않는 WAV 블록 정렬입니다');
  const frames = Math.floor(dataLen / blockAlign);
  const channelData = Array.from({ length: channels }, () => new Float32Array(frames));

  let read;
  if (format === 1) {
    if (width === 1) read = (o) => (bytes[o] - 128) / 128;
    else if (width === 2) read = (o) => view.getInt16(o, true) / 32768;
    else if (width === 3) read = (o) => ((bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16)) << 8 >> 8) / 8388608;
    else if (width === 4) read = (o) => view.getInt32(o, true) / 2147483648;
  } else if (format === 3) {
    if (width === 4) read = (o) => view.getFloat32(o, true);
    else if (width === 8) read = (o) => view.getFloat64(o, true);
  }
  if (!read) throw new Error(`지원하지 않는 WAV 형식입니다 (format ${format}, ${fmt.bits}-bit)`);

  for (let f = 0, o = dataOff; f < frames; f++) {
    for (let c = 0; c < channels; c++, o += width) channelData[c][f] = read(o);
  }
  return { channelData, sampleRate, warnings: [] };
}

async function decodeMp3(bytes) {
  const { MPEGDecoder } = await import('mpg123-decoder');
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const { channelData, sampleRate, samplesDecoded, errors } = decoder.decode(bytes);
    if (!samplesDecoded) throw new Error('mp3 디코딩 결과가 비어 있습니다');
    return {
      channelData: channelData.map((c) => c.subarray(0, samplesDecoded)),
      sampleRate,
      warnings: errors?.length ? [`mp3 프레임 오류 ${errors.length}개 (무시하고 진행)`] : [],
    };
  } finally {
    decoder.free();
  }
}

export async function decodeAudioFile(path) {
  const bytes = new Uint8Array(readFileSync(path));
  return isWav(bytes) ? decodeWav(bytes) : decodeMp3(bytes);
}

export function toMono(channelData) {
  const n = channelData[0].length;
  const out = new Float32Array(n);
  const g = 1 / channelData.length;
  for (const ch of channelData) for (let i = 0; i < n; i++) out[i] += ch[i] * g;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Spectral analysis
// ---------------------------------------------------------------------------------------------

/** In-place iterative radix-2 complex FFT of size n (power of two). */
function makeFft(n) {
  const levels = Math.round(Math.log2(n));
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r = (r << 1) | ((i >>> b) & 1);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >>> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j;
          const b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  };
}

/** Log-spaced bands (12 per octave, 30 Hz .. 16 kHz); low bands collapse to single FFT bins. */
function makeBands(n, sr) {
  const binHz = sr / n;
  const fmin = 30;
  const top = Math.min(16000, sr * 0.46);
  const bands = [];
  let cur = null;
  for (let b = 1; b <= n / 2; b++) {
    const f = b * binHz;
    if (f < fmin) continue;
    if (f > top) break;
    const idx = Math.floor(12 * Math.log2(f / fmin));
    if (!cur || cur.idx !== idx) {
      cur = { idx, lo: b, hi: b + 1 };
      bands.push(cur);
    } else cur.hi = b + 1;
  }
  for (const band of bands) {
    band.center = Math.sqrt(band.lo * (band.hi - 1)) * binHz;
    band.log2 = Math.log2(band.center);
  }
  return bands;
}

/** STFT (centered Hann frames) reduced to mean magnitude per log band. */
function bandSpectrogram(x, sr) {
  const n = 2 ** Math.round(Math.log2((2048 * sr) / 44100));
  const hop = n / 4;
  const half = n / 2;
  const frames = Math.floor(x.length / hop) + 1;
  const bands = makeBands(n, sr);
  const nb = bands.length;
  const maxBin = bands[nb - 1].hi;
  const win = new Float64Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  const fft = makeFft(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const magA = new Float64Array(maxBin);
  const magB = new Float64Array(maxBin);
  const bm = new Float32Array(frames * nb);
  const scale = 2 / n; // a full-scale sine reads ~1 (0.5 unpacking factor x 4/n Hann gain)

  const load = (buf, f) => {
    if (f >= frames) return buf.fill(0);
    const start = f * hop - half;
    for (let i = 0; i < n; i++) {
      const s = start + i;
      buf[i] = s >= 0 && s < x.length ? x[s] * win[i] : 0;
    }
  };
  const writeBands = (f, mag) => {
    const o = f * nb;
    for (let b = 0; b < nb; b++) {
      const { lo, hi } = bands[b];
      let s = 0;
      for (let k = lo; k < hi; k++) s += mag[k];
      bm[o + b] = s / (hi - lo);
    }
  };

  // Two real frames per complex FFT: frame f in re, frame f+1 in im.
  for (let f = 0; f < frames; f += 2) {
    load(re, f);
    load(im, f + 1);
    fft(re, im);
    for (let k = 0; k < maxBin; k++) {
      const nk = (n - k) & (n - 1);
      const ar = re[k] + re[nk];
      const ai = im[k] - im[nk];
      const br = im[k] + im[nk];
      const bi = re[nk] - re[k];
      magA[k] = Math.sqrt(ar * ar + ai * ai) * scale;
      magB[k] = Math.sqrt(br * br + bi * bi) * scale;
    }
    writeBands(f, magA);
    if (f + 1 < frames) writeBands(f + 1, magB);
  }
  return { bm, frames, nb, bands, n, hop, dt: hop / sr, sr };
}

const GAMMA = 100; // log compression: log(1 + GAMMA * magnitude)

/** Half-wave rectified log-magnitude flux (previous frame max-filtered over ±1 band). */
function spectralFlux(spec) {
  const { bm, frames, nb, bands } = spec;
  const lowTop = bands.findIndex((b) => b.center > 180);
  const env = new Float32Array(frames);
  const low = new Float32Array(frames);
  let prev = new Float32Array(nb);
  let cur = new Float32Array(nb);
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < nb; b++) cur[b] = Math.log1p(GAMMA * bm[f * nb + b]);
    if (f > 0) {
      let e = 0;
      let el = 0;
      for (let b = 0; b < nb; b++) {
        const ref = Math.max(prev[b], b > 0 ? prev[b - 1] : 0, b + 1 < nb ? prev[b + 1] : 0);
        const d = cur[b] - ref;
        if (d > 0) {
          e += d;
          if (b < lowTop) el += d;
        }
      }
      env[f] = e;
      low[f] = el;
    }
    [prev, cur] = [cur, prev];
  }
  return { env, low };
}

function mean(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[clamp(Math.round((p / 100) * (s.length - 1)), 0, s.length - 1)];
}

function normalized(a) {
  const m = mean(a) || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] / m;
  return out;
}

function prefixSum(a) {
  const p = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) p[i + 1] = p[i] + a[i];
  return p;
}

const PEAK_DELTA = 0.35; // threshold above the local mean, in units of the global mean flux

/** Adaptive-threshold peak picking with ~50 ms minimum spacing. Returns frame positions. */
function pickPeaks(env, dt) {
  const n = env.length;
  const e = normalized(env);
  const reach = Math.max(1, Math.round(0.03 / dt));
  const preAvg = Math.round(0.1 / dt);
  const postAvg = Math.round(0.07 / dt);
  const minGap = Math.max(1, Math.round(0.05 / dt));
  const ps = prefixSum(e);
  const peaks = [];
  const make = (k) => {
    const a = e[k - 1];
    const b = e[k];
    const c = e[k + 1];
    const denom = a - 2 * b + c;
    const off = denom < 0 ? clamp((0.5 * (a - c)) / denom, -0.5, 0.5) : 0;
    return { k, pos: k + off, h: b - 0.25 * (a - c) * off };
  };
  for (let k = 1; k < n - 1; k++) {
    const v = e[k];
    if (v <= PEAK_DELTA) continue;
    let isMax = true;
    for (let j = Math.max(0, k - reach); j <= Math.min(n - 1, k + reach); j++) {
      if (e[j] > v || (e[j] === v && j < k)) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    const lo = Math.max(0, k - preAvg);
    const hi = Math.min(n, k + postAvg + 1);
    if (v < (ps[hi] - ps[lo]) / (hi - lo) + PEAK_DELTA) continue;
    const last = peaks[peaks.length - 1];
    if (last && k - last.k < minGap) {
      if (v > e[last.k]) peaks[peaks.length - 1] = make(k);
      continue;
    }
    peaks.push(make(k));
  }
  return peaks;
}

/** Onset features: strength, band (flux-weighted log-frequency centroid), sustain. */
function describeOnsets(spec, peaks, latency) {
  const { bm, frames, nb, bands, dt } = spec;
  const L = (f, b) => Math.log1p(GAMMA * bm[clamp(f, 0, frames - 1) * nb + b]);
  const LO = Math.log2(80);
  const HI = Math.log2(8000);
  const capFrames = Math.round(4 / dt);

  // Candidate bands per onset: the band with the largest linear magnitude increase, plus up to three
  // tonal bands (>= 150 Hz) that clearly start a new sound. A kick often lands together with the
  // chord or lead note that actually rings, so sustain is measured on every candidate.
  const tonalFrom = bands.findIndex((b) => b.center >= 150);
  const candidates = peaks.map(({ k }) => {
    const incs = [];
    let best = 0;
    for (let b = 0; b < nb; b++) {
      // level just before the attack (min over 3 frames: the windows overlap the attack itself)
      const before = Math.min(bm[Math.max(0, k - 1) * nb + b], bm[Math.max(0, k - 2) * nb + b], bm[Math.max(0, k - 3) * nb + b]);
      const now = Math.max(bm[k * nb + b], k + 1 < frames ? bm[(k + 1) * nb + b] : 0);
      const inc = now - before;
      if (inc > (incs[best]?.inc ?? -Infinity)) best = b;
      incs.push({ b, inc, before });
    }
    const top = incs[best].inc;
    // spectral peaks of the increase only: the skirt of a kick or snare is not a new tone
    const isPeak = (c) => c.inc >= (incs[c.b - 1]?.inc ?? 0) && c.inc >= (incs[c.b + 1]?.inc ?? 0);
    const tonal = incs
      .filter((c) => c.b >= tonalFrom && Math.abs(c.b - best) > 1 && c.inc >= 0.1 * top && c.inc >= 0.3 * c.before && isPeak(c))
      .sort((x, y) => y.inc - x.inc);
    const out = [best];
    for (const c of tonal) {
      if (out.length >= 4) break;
      if (out.every((o) => Math.abs(o - c.b) > 1)) out.push(c.b);
    }
    return out;
  });

  const heights = peaks.map((p) => p.h);
  const ref = percentile(heights, 90) || 1;

  /** Seconds the energy in bands db-1..db+1 stays above 50% of its onset level. */
  const sustainOf = (i, db) => {
    const { k } = peaks[i];
    const bLo = Math.max(0, db - 1);
    const bHi = Math.min(nb - 1, db + 1);
    const energy = (f) => {
      let s = 0;
      for (let b = bLo; b <= bHi; b++) s += bm[f * nb + b] ** 2;
      return s;
    };
    let jPeak = k;
    let level = energy(k);
    for (let j = k + 1; j <= Math.min(frames - 1, k + 3); j++) {
      const e = energy(j);
      if (e > level) {
        level = e;
        jPeak = j;
      }
    }
    if (level <= 0) return 0;
    // a later onset where this band's energy jumps again (re-strike) ends the sustain
    let stop = Math.min(frames - 1, k + capFrames);
    for (let m = i + 1; m < peaks.length && peaks[m].k <= stop; m++) {
      const km = peaks[m].k;
      const base = Math.min(energy(km - 1), energy(Math.max(0, km - 2)), energy(Math.max(0, km - 3)));
      if (km > k + 1 && Math.max(energy(km), energy(Math.min(frames - 1, km + 1))) > 1.35 * base) {
        stop = km - 1;
        break;
      }
    }
    let lastAbove = jPeak;
    let below = 0;
    for (let j = jPeak + 1; j <= stop; j++) {
      if (energy(j) >= 0.5 * level) {
        lastAbove = j;
        below = 0;
      } else if (++below >= 2) break;
    }
    return Math.min(4, (lastAbove - k) * dt);
  };

  return peaks.map((p, i) => {
    const { k } = p;
    // band: flux-weighted centroid on a log-frequency axis
    let w = 0;
    let wl = 0;
    for (let b = 0; b < nb; b++) {
      const prev = Math.max(L(k - 1, b), b > 0 ? L(k - 1, b - 1) : 0, b + 1 < nb ? L(k - 1, b + 1) : 0);
      const d = Math.max(L(k, b), L(k + 1, b)) - prev;
      if (d > 0) {
        w += d;
        wl += d * bands[b].log2;
      }
    }
    const centroid = w > 0 ? wl / w : Math.log2(1000);
    const band = clamp((centroid - LO) / (HI - LO), 0, 1);
    const sustain = Math.max(...candidates[i].map((db) => sustainOf(i, db)));

    return {
      time: p.pos * dt + latency,
      strength: Math.min(1.2, p.h / ref),
      band,
      sustain,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Tempo, beat phase, downbeat
// ---------------------------------------------------------------------------------------------

/** Onset envelope used for tempo: full flux + low-band flux, local mean removed. */
function tempoEnvelope(flux, dt) {
  const a = normalized(flux.env);
  const b = normalized(flux.low);
  const n = a.length;
  const sum = new Float32Array(n);
  for (let i = 0; i < n; i++) sum[i] = a[i] + b[i];
  const w = Math.round(0.2 / dt);
  const ps = prefixSum(sum);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - w);
    const hi = Math.min(n, i + w + 1);
    out[i] = Math.max(0, sum[i] - (ps[hi] - ps[lo]) / (hi - lo));
  }
  const smooth = new Float32Array(n);
  for (let i = 0; i < n; i++) smooth[i] = 0.25 * (out[Math.max(0, i - 1)] + 2 * out[i] + out[Math.min(n - 1, i + 1)]);
  return smooth;
}

/** Linear interpolation of an envelope sampled every dt seconds (t >= 0). */
function sampleAt(env, dt, t) {
  const x = t / dt;
  const i = Math.floor(x);
  if (i < 0 || i + 1 >= env.length) return 0;
  return env[i] + (env[i + 1] - env[i]) * (x - i);
}

/**
 * Comb over the envelope: for each phase, the mean envelope value at phase + n * period.
 * Returns the best phase (parabolic-refined) and its mean value.
 */
function combScan(env, dt, period, { step, from = 0, to = (env.length - 2) * dt, lo = 0, hi = period }) {
  const count = Math.max(3, Math.round((hi - lo) / step));
  const circular = Math.abs(hi - lo - period) < 1e-9;
  const inc = (hi - lo) / count;
  const vals = new Float64Array(count);
  const maxI = env.length - 2;
  for (let p = 0; p < count; p++) {
    const ph = lo + p * inc;
    let t = ph + Math.ceil((from - ph) / period) * period;
    let s = 0;
    let c = 0;
    for (; t < to; t += period) {
      const x = t / dt;
      const i = x | 0;
      if (i > maxI) break;
      s += env[i] + (env[i + 1] - env[i]) * (x - i);
      c++;
    }
    vals[p] = c ? s / c : 0;
  }
  let m = 0;
  for (let p = 1; p < count; p++) if (vals[p] > vals[m]) m = p;
  const at = (p) => (circular ? vals[mod(p, count)] : vals[clamp(p, 0, count - 1)]);
  const a = at(m - 1);
  const b = vals[m];
  const c = at(m + 1);
  const denom = a - 2 * b + c;
  const off = denom < 0 ? clamp((0.5 * (a - c)) / denom, -0.5, 0.5) : 0;
  const phase = lo + (m + off) * inc;
  return { phase: circular ? mod(phase, period) : phase, value: b - 0.25 * (a - c) * off };
}

/** Beat salience: envelope at the beats minus envelope halfway between them. */
function salience(env, dt, period, phase) {
  const T = (env.length - 2) * dt;
  let s = 0;
  let c = 0;
  for (let t = mod(phase, period); t + period / 2 < T; t += period) {
    s += sampleAt(env, dt, t) - sampleAt(env, dt, t + period / 2);
    c++;
  }
  return c ? s / c : 0;
}

// Ratios of the in-window tempo whose 16th grid contains (or is contained in) the in-window grid.
// Only these are skipped in the wide scan: 3:4 / 2:3 aliases put notes between grid lines.
const GRID_SAFE_RATIOS = [0.25, 0.5, 2, 4];
// 3:4, 2:3, 4:3, 3:2 ... aliases. A triplet/swing feel at the prompt tempo also scores well at
// these (the 3:4 tempo's 16th grid is the prompt tempo's triplet grid), so they must win clearly.
const TRIPLE_RATIOS = [1 / 3, 2 / 3, 0.75, 4 / 3, 1.5, 3];
const OUTSIDE_MARGIN = 1.25;
const TRIPLE_OUTSIDE_MARGIN = 1.6;
const GRID_TOL = 0.03; // an onset further than this from every 16th line is "off the grid"
const GRID_MISS_WARN = 0.1; // warn above this share of off-grid strong onsets
const DOUBLE_MAX_MISS = 0.03; // doubling must leave at most this share off the doubled grid

const nearRatio = (a, b, ratios, tol = 0.02) => ratios.some((q) => Math.abs(a / b / q - 1) < tol);

/**
 * Comb search for the tempo around `centerBpm` (the prompt BPM, or songs.json "chartBpm").
 * With `wide`, also checks 60..220 BPM outside the window in case Lyria ignored the prompt tempo;
 * the caller decides whether such an outside tempo may be used (see analyzeAudio).
 */
function estimateTempo(env, dt, centerBpm, { window = 0.12, wide = true } = {}) {
  const envMean = mean(env) || 1;
  const scoreOf = (bpm, step = 0.005) => {
    const r = combScan(env, dt, 60 / bpm, { step });
    return { bpm, phase: r.phase, score: r.value / envMean };
  };
  const refine = (item) => {
    let best = item;
    for (let bpm = item.bpm - 0.05; bpm <= item.bpm + 0.05 + 1e-9; bpm += 0.005) {
      const r = scoreOf(bpm, 0.002);
      if (r.score > best.score) best = r;
    }
    return best;
  };

  // Comb search within ±window of the center BPM at 0.05 BPM, refined to 0.005 BPM
  const lo = centerBpm * (1 - window);
  const hi = centerBpm * (1 + window);
  const scan = [];
  let best = null;
  for (let bpm = lo; bpm <= hi + 1e-9; bpm += 0.05) {
    const item = scoreOf(bpm);
    scan.push(item);
    if (!best || item.score > best.score) best = item;
  }
  best = refine(best);
  const confidence = best.score / (percentile(scan.map((s) => s.score), 50) || 1);

  // Half / double salience of the in-window tempo: diagnostics only. The tempo is doubled later
  // only when the onset timing needs it (analyzeAudio), never on salience alone.
  const P = 60 / best.bpm;
  const base = salience(env, dt, P, best.phase);
  const half = Math.max(salience(env, dt, 2 * P, best.phase), salience(env, dt, 2 * P, best.phase + P));
  const dbl = salience(env, dt, P / 2, best.phase);
  const alias = { base: r2(base / envMean), half: r2(half / envMean), double: r2(dbl / envMean) };
  const result = { bpm: best.bpm, searchedBpm: best.bpm, phase: best.phase, score: best.score, confidence, alias, outside: null };
  if (!wide) return result;

  // Did Lyria ignore the prompt tempo? Scan 60..220 BPM outside the window, skipping the grid-safe
  // ratios of the window's best. The comb favours slow sub-multiples (they sample only the
  // strongest hits), so prefer the fastest near-equal multiple before comparing.
  let outside = null;
  const wideScores = [];
  for (let bpm = 60; bpm <= 220; bpm += 0.05) {
    if (bpm >= lo && bpm <= hi) continue;
    if (nearRatio(bpm, best.bpm, GRID_SAFE_RATIOS)) continue;
    const item = scoreOf(bpm);
    wideScores.push(item.score);
    if (!outside || item.score > outside.score) outside = item;
  }
  const wideMedian = percentile(wideScores, 50) || 1;
  while (outside && outside.bpm * 2 <= 220 && !(outside.bpm * 2 >= lo && outside.bpm * 2 <= hi)) {
    const doubled = scoreOf(outside.bpm * 2);
    if (doubled.score < 0.75 * outside.score) break;
    outside = doubled;
  }
  if (!outside) return result;
  const margin = nearRatio(outside.bpm, best.bpm, TRIPLE_RATIOS) ? TRIPLE_OUTSIDE_MARGIN : OUTSIDE_MARGIN;
  result.outside = { bpm: r2(outside.bpm), ratio: r2(outside.score / best.score), margin };
  if (outside.score > margin * best.score && outside.score > 1.5 * wideMedian) {
    const chosen = refine(outside);
    Object.assign(result, { bpm: chosen.bpm, phase: chosen.phase, score: chosen.score, alias: {} });
    result.outside.bpm = chosen.bpm;
    result.outside.chosen = true;
  }
  return result;
}

/** Share of strong onsets (strength >= minStrength) more than `tol` seconds off the 16th grid. */
export function gridMiss(onsets, bpm, offset, tol = 0.03, minStrength = 0.3) {
  const step = 60 / bpm / 4;
  let strong = 0;
  let off = 0;
  for (const o of onsets) {
    if (o.strength < minStrength) continue;
    strong++;
    const r = (o.time - offset) / step;
    if (Math.abs(r - Math.round(r)) * step > tol) off++;
  }
  return strong ? off / strong : 0;
}

/**
 * Evidence that the song runs at twice `bpm`: strong onsets off the 16th grid (`miss`), how many of
 * them are not on the doubled grid either (`stray`, tolerance a quarter of a 32nd so swung 8ths a
 * third of a 32nd away do not count), and how the rest split between the "e" and the "a" of the
 * doubled beat. Real double-time 16ths use both; a swung 8th only ever lands on the "e".
 */
function doubleTimeEvidence(onsets, bpm, offset, minStrength = 0.3) {
  const step = 60 / bpm / 4;
  const half = step / 2;
  const tol = Math.min(GRID_TOL, 0.25 * half);
  let strong = 0;
  let off = 0;
  let stray = 0;
  let e = 0;
  let a = 0;
  for (const o of onsets) {
    if (o.strength < minStrength) continue;
    strong++;
    const r = (o.time - offset) / step;
    if (Math.abs(r - Math.round(r)) * step <= GRID_TOL) continue;
    off++;
    const h = (o.time - offset) / half;
    const k = Math.round(h);
    if (Math.abs(h - k) * half > tol || k % 2 === 0) stray++;
    else if (mod(k, 4) === 1) e++;
    else a++;
  }
  const n = strong || 1;
  return { miss: off / n, stray: stray / n, e, a };
}

/** True when bpm is within ±tol of centerBpm * 2^k for some integer k (half/double time is fine). */
function octaveMatch(bpm, centerBpm, tol = 0.12) {
  const r = bpm / centerBpm;
  const k = Math.round(Math.log2(r));
  return Math.abs(r / 2 ** k - 1) <= tol;
}

// ---------------------------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------------------------

const LEAD_MIN_STRENGTH = 0.08;

/**
 * Analyse mono samples. Returns everything chart building needs plus diagnostics.
 * Times are seconds from the start of the decoded audio.
 *
 * `chartBpm` (songs.json override) replaces the prompt BPM as the tempo to trust: the search is
 * narrowed to ±3% around it and never leaves that range.
 */
export function analyzeAudio(x, sr, promptBpm, { chartBpm } = {}) {
  const warnings = [];
  const duration = x.length / sr;
  const spec = bandSpectrogram(x, sr);
  const { dt, n } = spec;
  // Flux of a sharp attack peaks ~1/8 window before the attack (centered frames): shift it back.
  const latency = (0.125 * n) / sr;

  const flux = spectralFlux(spec);
  const peaks = pickPeaks(flux.env, dt);
  const onsets = describeOnsets(spec, peaks, latency).filter((o) => o.time >= 0 && o.time < duration);

  // --- tempo & phase
  const override = Number(chartBpm) > 0 ? Number(chartBpm) : null;
  const centerBpm = override ?? promptBpm;
  const centerLabel = override ? `chartBpm ${override}` : `프롬프트 BPM ${promptBpm}`;
  const envT = tempoEnvelope(flux, dt);
  const tempo = override ? estimateTempo(envT, dt, override, { window: 0.03, wide: false }) : estimateTempo(envT, dt, promptBpm);
  let bpm = tempo.bpm;
  if (tempo.outside?.chosen) {
    warnings.push(
      `Lyria가 템포를 따르지 않은 것 같습니다: ${centerLabel}의 ±12% 밖인 ${r2(bpm)} BPM이 ` +
        `창 안의 최선(${r2(tempo.searchedBpm)} BPM)보다 ${tempo.outside.ratio}배 잘 맞습니다`
    );
  } else if (tempo.confidence < 1.1) {
    warnings.push(`템포 검출 신뢰도가 낮아(${tempo.confidence.toFixed(2)}) ${centerLabel}을 사용합니다`);
    bpm = centerBpm;
  }

  // Double the tempo only when the onset timing needs it: many strong onsets fall between the
  // 16th lines, nearly all of them sit on the doubled grid, and they use both of its in-between
  // positions (see doubleTimeEvidence). The doubled grid shares every beat line, so the phase
  // carries over. Staying at the prompt-level tempo is otherwise always safe: notes are moved back
  // onto their onsets after quantization (alignNotes).
  const phase0 = mod(combScan(envT, dt, 60 / bpm, { step: 0.001 }).phase + latency, 60 / bpm);
  const dbl = doubleTimeEvidence(onsets, bpm, phase0);
  Object.assign(tempo.alias, { stray: r3(dbl.stray), e: dbl.e, a: dbl.a });
  const bothSides = Math.min(dbl.e, dbl.a) >= 0.25 * (dbl.e + dbl.a);
  if (!override && dbl.miss > GRID_MISS_WARN && dbl.stray <= DOUBLE_MAX_MISS && bothSides && 2 * bpm <= 300) {
    warnings.push(
      `강한 온셋의 ${Math.round(dbl.miss * 100)}%가 ${r2(bpm)} BPM의 16분 격자 사이에 있고 2배 템포 격자에는 맞아서 ` +
        `BPM을 ${r2(bpm)} -> ${r2(2 * bpm)} 로 바꿨습니다`
    );
    bpm *= 2;
    tempo.alias.switched = 'double';
  }

  // Never trust a tempo that is not the prompt tempo (or its half / double) without a human:
  // chartSong refuses to write the chart and asks for a regeneration or a "chartBpm" override.
  const tempoMismatch = !override && !octaveMatch(bpm, promptBpm) ? { detected: r2(bpm), prompt: promptBpm } : null;
  const octaveRef = centerBpm * 2 ** Math.round(Math.log2(bpm / centerBpm));
  if (!tempoMismatch && Math.abs(bpm - octaveRef) / octaveRef > 0.03) {
    warnings.push(`검출 BPM ${r2(bpm)} 이 ${centerLabel}${octaveRef !== centerBpm ? `(×${r2(octaveRef / centerBpm)})` : ''} 과 3% 넘게 다릅니다 -> 검출값 사용`);
  }
  const P = 60 / bpm;
  const fine = combScan(envT, dt, P, { step: 0.001 });
  const beatPhase = mod(fine.phase + latency, P);

  // --- downbeat: the beat of the bar with the most low-band (kick) flux. Snares sit on 2 and 4,
  // so mid/high flux would point at the backbeat. Near-ties (four-on-the-floor) go to the bar
  // position of the first strong onset, since songs almost always start on a downbeat.
  const low = normalized(flux.low);
  const barScore = [0, 0, 0, 0];
  const barCount = [0, 0, 0, 0];
  for (let i = 0, t = beatPhase; t < duration - 0.05; i++, t += P) {
    const tf = t - latency;
    if (tf < 0) continue;
    barScore[i % 4] += sampleAt(low, dt, tf);
    barCount[i % 4]++;
  }
  const barAvg = barScore.map((s, m) => s / (barCount[m] || 1));
  const topAvg = Math.max(...barAvg);
  const firstHit = onsets.find((o) => o.strength >= 0.4) ?? onsets[0];
  const startPos = firstHit ? mod(Math.round((firstHit.time - beatPhase) / P), 4) : 0;
  let bar = barAvg.indexOf(topAvg);
  if (barAvg[startPos] >= 0.9 * topAvg) bar = startPos;
  const downbeat = beatPhase + bar * P;

  // --- grid fit: a wrong tempo (a 3:4 / 2:3 alias) leaves many strong onsets between the 16th
  // lines; a correct straight-feel tempo leaves almost none. Swing / triplets also show up here.
  const step = P / 4;
  const gridDist = (t) => {
    const r = (t - downbeat) / step;
    return Math.abs(r - Math.round(r)) * step;
  };
  const miss = gridMiss(onsets, bpm, downbeat, GRID_TOL);
  if (miss > GRID_MISS_WARN) {
    warnings.push(
      `강한 온셋의 ${Math.round(miss * 100)}%가 ${r2(bpm)} BPM 16분 격자에서 ${GRID_TOL * 1000}ms 넘게 벗어납니다 ` +
        `(템포가 틀렸거나 스윙/셋잇단 리듬). 노트는 박자 격자에만 놓이지만, 템포가 맞는지 들어 보고 확인하세요`
    );
  }

  // --- drift check: best local phase in ~20 s segments vs the global grid
  const drift = [];
  const segLen = 20;
  for (let s = 0; s + segLen / 2 < duration; s += segLen) {
    const from = s;
    const to = Math.min(duration, s + segLen) - latency;
    if (to - from < 8) continue;
    const r = combScan(envT, dt, P, { step: 0.001, from, to, lo: fine.phase - P / 4, hi: fine.phase + P / 4 });
    drift.push(r3(r.phase - fine.phase));
  }
  const maxDrift = drift.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
  if (maxDrift > 0.03) warnings.push(`구간별 박자 위치가 최대 ${Math.round(maxDrift * 1000)}ms 어긋납니다 (템포 흔들림 가능): ${drift.join(', ')}`);

  // --- loudness blocks for lead-in / tail / preview
  const blockSec = 0.05;
  const block = Math.max(1, Math.round(blockSec * sr));
  const blocks = Math.ceil(x.length / block);
  const power = new Float64Array(blocks);
  for (let i = 0; i < blocks; i++) {
    let s = 0;
    const end = Math.min(x.length, (i + 1) * block);
    for (let j = i * block; j < end; j++) s += x[j] * x[j];
    power[i] = s / Math.max(1, end - i * block);
  }
  const loud = percentile([...power], 95) || 1e-12;
  let lastActive = duration;
  for (let i = blocks - 1; i >= 0; i--) {
    if (power[i] > loud * 0.0025) {
      lastActive = Math.min(duration, (i + 1) * blockSec);
      break;
    }
  }
  const tailOut = Math.max(1.0, duration - lastActive);

  // --- lead-in: the first on-grid onset that starts a rhythm (at least two more on-grid onsets
  // within the next two bars). Strength is relative to the loudest part of the song, so a quiet
  // but rhythmic intro (solo piano, music box) only needs a low floor; chartBuilder ranks slots by
  // strength, so its weak onsets only fill the harder charts. Never wait more than ~2 bars.
  const rhythmic = onsets.filter((o) => o.strength >= LEAD_MIN_STRENGTH && gridDist(o.time) <= GRID_TOL);
  let start = null;
  for (let i = 0; i + 2 < rhythmic.length && !start; i++) {
    if (rhythmic[i + 2].time - rhythmic[i].time <= 8 * P) start = rhythmic[i];
  }
  const leadInMax = Math.max(2.0, Math.min(6, 8 * P));
  const leadIn = clamp(start ? start.time - 0.05 : 2.0, 2.0, leadInMax);

  // --- preview: loudest 12 s window inside [8 s, duration - 15 s], snapped to a bar line
  const barSec = 4 * P;
  const snap = (t) => downbeat + Math.round((t - downbeat) / barSec) * barSec;
  const win = Math.round(PREVIEW_SEC / blockSec);
  const first = Math.ceil(8 / blockSec);
  const last = Math.floor((duration - 15 - PREVIEW_SEC) / blockSec);
  let previewStart;
  if (last >= first) {
    const ps = prefixSum(power);
    let bestI = first;
    for (let i = first; i <= last; i++) if (ps[i + win] - ps[i] > ps[bestI + win] - ps[bestI]) bestI = i;
    previewStart = snap(bestI * blockSec);
    if (previewStart < 8) previewStart += barSec;
    if (previewStart + PREVIEW_SEC > duration - 15) previewStart -= barSec;
  } else {
    previewStart = snap(Math.max(0, Math.min(duration - PREVIEW_SEC, duration * 0.35)));
  }
  previewStart = clamp(previewStart, 0, Math.max(0, duration - PREVIEW_SEC));

  return {
    duration,
    promptBpm,
    chartBpm: override,
    bpm,
    searchedBpm: tempo.searchedBpm,
    outside: tempo.outside,
    tempoMismatch,
    gridMiss: miss,
    confidence: tempo.confidence,
    alias: tempo.alias,
    beatPhase,
    downbeat,
    gridOffset: downbeat,
    drift,
    onsets,
    leadIn,
    tailOut,
    previewStart,
    warnings,
  };
}

/** Onsets in the shape chartBuilder expects. */
function chartOnsets(onsets) {
  return onsets.map((o) => ({ time: r3(o.time), strength: r3(o.strength), band: r3(o.band), sustain: r3(o.sustain) }));
}

const SNAP_KEEP = 0.01; // a grid time this close to its onset is kept as is
const HOLD_END_MARGIN = 0.05; // holds end at least this long before the audio does

/**
 * chartBuilder quantizes notes to the straight 16th grid. Put every note back on the audio onset
 * it came from (same rounding as chartBuilder's toSlots, strongest onset per slot), so swung 8ths
 * and tempo wander keep their real timing. A hold keeps its length, but never runs past the end
 * of the audio (the game ends the run there); one that drops below a beat becomes a tap.
 */
/**
 * Notes stay exactly on the song's beat grid (steady Lyria tempo, drift of a few ms), so they fall
 * in time with the beat. Only hold tails are trimmed so they never run past the end of the audio.
 */
function alignNotes(beatmaps, input) {
  const beat = 60 / input.bpm;
  const lastEnd = input.duration - HOLD_END_MARGIN;
  for (const d of DIFFICULTIES) {
    const notes = beatmaps[d].notes;
    for (const note of notes) {
      const room = lastEnd - note.time;
      if (note.duration && note.duration > room) note.duration = room >= beat - 0.001 ? r3(room) : undefined;
    }
    notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  }
  return beatmaps;
}

export function buildCharts(analysis, seed) {
  const input = {
    onsets: chartOnsets(analysis.onsets),
    bpm: analysis.bpm,
    duration: analysis.duration,
    seed,
    gridOffset: analysis.gridOffset,
    leadIn: analysis.leadIn,
    tailOut: analysis.tailOut,
  };
  return alignNotes(buildBeatmaps(input), input);
}

// ---------------------------------------------------------------------------------------------
// Songs -> public/music
// ---------------------------------------------------------------------------------------------

function findRawAudio(id) {
  const found = ['mp3', 'wav']
    .map((ext) => join(RAW_DIR, `${id}.${ext}`))
    .filter((p) => existsSync(p))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return found[0] ?? null;
}

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) return { version: 1, songs: [] };
  try {
    const m = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    return { version: 1, songs: Array.isArray(m.songs) ? m.songs : [] };
  } catch (err) {
    console.warn(`manifest.json을 읽지 못해 새로 만듭니다: ${err.message}`);
    return { version: 1, songs: [] };
  }
}

/** Pretty JSON, but each chart's notes array stays on one line. */
function stringifyManifest(manifest) {
  const inline = [];
  const json = JSON.stringify(
    manifest,
    (key, value) => {
      if (key === 'notes' && Array.isArray(value)) {
        inline.push(JSON.stringify(value));
        return `@@NOTES_${inline.length - 1}@@`;
      }
      return value;
    },
    2
  );
  return json.replace(/"@@NOTES_(\d+)@@"/g, (_, i) => inline[Number(i)]) + '\n';
}

function lyricsFor(song) {
  const own = (song.lyrics ?? '').trim();
  if (own) return own;
  if ((song.vocal ?? 'none') !== 'ja') return undefined;
  const txt = join(RAW_DIR, `${song.id}.txt`);
  if (!existsSync(txt)) return undefined;
  return stripStructure(readFileSync(txt, 'utf8')) || undefined;
}

const parsesAsJson = (s) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

/**
 * Lyria's text parts are lyrics or a JSON description of the song structure, in any order
 * (generate.mjs joins them into raw/<id>.txt). Keep the lyrics: drop fenced code blocks and any
 * top-level JSON object/array. "[Verse]" section tags are not JSON, so they stay.
 */
export function stripStructure(text) {
  let s = String(text ?? '').replace(/\r/g, '');
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_, body) => (parsesAsJson(body.trim()) ? '' : body));
  const out = [];
  for (let i = 0; i < s.length; ) {
    const lineStart = i === 0 || s[i - 1] === '\n';
    if (lineStart && (s[i] === '{' || s[i] === '[')) {
      const end = jsonEnd(s, i);
      if (end > i && parsesAsJson(s.slice(i, end))) {
        i = end;
        continue;
      }
    }
    out.push(s[i++]);
  }
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Index just past the bracket that closes the one at `from` (string-aware), or -1. */
function jsonEnd(s, from) {
  let depth = 0;
  let inString = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) return i + 1;
    }
  }
  return -1;
}

/** Manifest entry in contract field order; analysis fields come from a fresh run or the old entry. */
function makeEntry(song, a) {
  const entry = {
    id: song.id,
    title: song.title,
    artist: song.artist,
    genre: song.genre,
  };
  if (song.referenceTradition) entry.referenceTradition = song.referenceTradition;
  Object.assign(entry, {
    bpm: a.bpm,
    duration: a.duration,
    vocal: song.vocal === 'ja' ? 'ja' : 'none',
    audioUrl: a.audioUrl,
    coverUrl: `/images/covers/${song.id}.webp`,
    stageUrl: `/images/stages/${song.id}.webp`,
    previewStart: a.previewStart,
    previewDuration: PREVIEW_SEC,
  });
  const lyrics = lyricsFor(song);
  if (lyrics) entry.lyrics = lyrics;
  entry.charts = a.charts;
  return entry;
}

function compactCharts(beatmaps) {
  const charts = {};
  for (const d of DIFFICULTIES) {
    const bm = beatmaps[d];
    charts[d] = {
      level: bm.level,
      notes: bm.notes.map((n) => (n.duration ? [r3(n.time), n.lane, r3(n.duration)] : [r3(n.time), n.lane])),
    };
  }
  return charts;
}

async function chartSong(song, rawPath) {
  const decoded = await decodeAudioFile(rawPath);
  const mono = toMono(decoded.channelData);
  const promptBpm = Number(song.bpm) || 120;
  const a = analyzeAudio(mono, decoded.sampleRate, promptBpm, { chartBpm: song.chartBpm });
  a.warnings.unshift(...decoded.warnings);
  if (a.tempoMismatch) {
    const { detected, prompt } = a.tempoMismatch;
    throw new Error(
      `검출 BPM ${detected} ≠ 프롬프트 ${prompt} (±12%, 절반/2배 범위 밖): 곡을 다시 생성하거나, 들어 보고 실제 템포를 ` +
        `songs.json에 "chartBpm"으로 지정하세요 (예: "chartBpm": ${detected}, 셔플/스윙이라 프롬프트 템포가 맞으면 "chartBpm": ${prompt}). ` +
        `강한 온셋 격자 이탈 ${Math.round(a.gridMiss * 100)}%, 창 안 최선 ${r2(a.searchedBpm)} BPM`
    );
  }
  const beatmaps = buildCharts(a, song.id);
  const empty = DIFFICULTIES.filter((d) => !beatmaps[d].noteCount);
  if (empty.length) throw new Error(`노트가 없는 난이도: ${empty.join(', ')} (오디오 ${a.duration.toFixed(1)}s, 온셋 ${a.onsets.length}개)`);

  const ext = rawPath.endsWith('.wav') ? 'wav' : 'mp3';
  if (ext === 'wav') a.warnings.push('원본이 WAV라서 public/music에 .wav로 복사합니다 (mp3 인코더 없음)');
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(rawPath, join(OUT_DIR, `${song.id}.${ext}`));
  rmSync(join(OUT_DIR, `${song.id}.${ext === 'mp3' ? 'wav' : 'mp3'}`), { force: true });

  const entry = makeEntry(song, {
    bpm: r2(a.bpm),
    duration: r3(a.duration),
    audioUrl: `/music/${song.id}.${ext}`,
    previewStart: r3(a.previewStart),
    charts: compactCharts(beatmaps),
  });
  return { entry, analysis: a, beatmaps, sampleRate: decoded.sampleRate };
}

function printStats(song, { analysis: a, beatmaps, sampleRate }) {
  const counts = DIFFICULTIES.map((d) => {
    const holds = beatmaps[d].notes.filter((n) => n.duration).length;
    return `${d} ${beatmaps[d].noteCount} (Lv${beatmaps[d].level}, hold ${holds})`;
  }).join(' | ');
  console.log(
    `OK   ${song.id}: bpm ${a.bpm.toFixed(2)} (prompt ${a.promptBpm}${a.chartBpm ? `, chartBpm ${a.chartBpm}` : ''}, confidence ${a.confidence.toFixed(2)}), ` +
      `offset ${a.beatPhase.toFixed(3)}s, downbeat ${a.downbeat.toFixed(3)}s, duration ${a.duration.toFixed(3)}s @ ${sampleRate} Hz`
  );
  console.log(
    `     onsets ${a.onsets.length}, off-grid strong onsets ${(a.gridMiss * 100).toFixed(1)}%, leadIn ${a.leadIn.toFixed(2)}s, tailOut ${a.tailOut.toFixed(2)}s, ` +
      `preview ${a.previewStart.toFixed(2)}s, drift [${a.drift.map((d) => Math.round(d * 1000)).join(' ')}] ms` +
      (a.alias.base === undefined ? '' : `, alias salience base ${a.alias.base} / half ${a.alias.half} / double ${a.alias.double}`) +
      (a.outside && !a.outside.chosen ? `, best outside ${a.outside.bpm} (x${a.outside.ratio})` : '')
  );
  console.log(`     ${counts}`);
  for (const w of a.warnings) console.log(`     ! ${w}`);
}

async function main(ids) {
  const config = JSON.parse(readFileSync(join(MUSIC_DIR, 'songs.json'), 'utf8'));
  const songs = Array.isArray(config.songs) ? config.songs : [];
  const known = new Set(songs.map((s) => s.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    console.error(`songs.json에 없는 id: ${unknown.join(', ')}`);
    process.exitCode = 1;
  }

  const targets = songs.filter((s) => !ids.length || ids.includes(s.id));
  const fresh = new Map();
  for (const song of targets) {
    const raw = findRawAudio(song.id);
    if (!raw) {
      console.log(`skip ${song.id} (music/raw/${song.id}.mp3 없음 — 먼저 generate.mjs 실행)`);
      continue;
    }
    try {
      const started = Date.now();
      const result = await chartSong(song, raw);
      fresh.set(song.id, result.entry);
      printStats(song, result);
      console.log(`     (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    } catch (err) {
      console.error(`FAIL ${song.id}: ${process.env.DEBUG ? err.stack : (err?.message ?? err)}`);
      process.exitCode = 1;
    }
  }

  const previous = readManifest();
  if (!fresh.size && !existsSync(MANIFEST_PATH)) {
    console.log('차트로 만들 오디오가 없어 manifest.json을 만들지 않았습니다.');
    return;
  }
  const prevById = new Map(previous.songs.map((s) => [s.id, s]));
  const out = [];
  for (const song of songs) {
    if (fresh.has(song.id)) out.push(fresh.get(song.id));
    else if (prevById.has(song.id)) {
      const old = prevById.get(song.id);
      // keep the old analysis/charts, refresh the descriptive fields from songs.json
      out.push(makeEntry(song, old));
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, stringifyManifest({ version: 1, songs: out }));

  // Songs dropped from songs.json: remove their audio too (several MB each, copied into dist).
  const dropped = previous.songs.filter((s) => !known.has(s.id)).map((s) => s.id);
  if (dropped.length) {
    const removed = [];
    for (const id of dropped) {
      for (const ext of ['mp3', 'wav']) {
        const path = join(OUT_DIR, `${id}.${ext}`);
        if (!existsSync(path)) continue;
        rmSync(path, { force: true });
        removed.push(`${id}.${ext}`);
      }
    }
    console.log(
      `songs.json에서 빠진 곡을 manifest에서 제거: ${dropped.join(', ')}` +
        (removed.length ? ` (public/music에서 ${removed.join(', ')} 삭제)` : '')
    );
  }
  console.log(`manifest.json: ${out.length}곡 (이번에 차트 생성 ${fresh.size}곡) -> ${MANIFEST_PATH}`);
}

// ---------------------------------------------------------------------------------------------
// Self-test on synthetic audio
// ---------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function synthesize({ bpm, firstBeat, seconds, sr, seed }) {
  const x = new Float32Array(Math.round(seconds * sr));
  const rng = mulberry32(seed);
  const beat = 60 / bpm;
  const add = (t, len, fn) => {
    const i0 = Math.round(t * sr);
    const n = Math.min(Math.round(len * sr), x.length - i0);
    for (let i = 0; i < n; i++) x[i0 + i] += fn(i / sr, i);
  };
  const attack = (tau, a = 0.001) => Math.min(1, tau / a);

  const kicks = [];
  const snares = [];
  const hats = [];
  const notes = [];
  // drums
  for (let i = 0, t = firstBeat; t < seconds - 0.4; i++, t = firstBeat + i * beat) {
    kicks.push(t);
    let ph = 0;
    add(t, 0.3, (tau) => {
      ph += (2 * Math.PI * (50 + 100 * Math.exp(-tau / 0.03))) / sr;
      return 0.8 * attack(tau) * Math.exp(-tau / 0.12) * Math.sin(ph);
    });
    if (i % 4 === 1 || i % 4 === 3) {
      snares.push(t);
      add(t, 0.25, (tau) => attack(tau) * (0.3 * (rng() * 2 - 1) * Math.exp(-tau / 0.05) + 0.25 * Math.sin(2 * Math.PI * 190 * tau) * Math.exp(-tau / 0.08)));
    }
  }
  for (let i = 0, t = firstBeat; t < seconds - 0.2; i++, t = firstBeat + (i * beat) / 2) {
    hats.push(t);
    let prev = 0;
    add(t, 0.06, (tau) => {
      const w = rng() * 2 - 1;
      const hp = w - prev;
      prev = w;
      return 0.06 * attack(tau) * Math.exp(-tau / 0.012) * hp;
    });
  }
  // melody on the 16th grid: A minor pentatonic random walk, with some long notes
  const scale = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
  const rhythms = [
    [4, 4, 4, 4],
    [2, 2, 4, 8],
    [16],
    [3, 3, 2, 8],
    [2, 2, 2, 2, 8],
    [8, 8],
    [1, 1, 2, 4, 4, 4],
    [6, 10], // long note starting on an off-beat (no kick under it)
    [2, 14],
  ];
  const step = beat / 4;
  let deg = 5;
  for (let barStart = firstBeat; barStart < seconds - 4 * beat; barStart += 4 * beat) {
    let pos = 0;
    for (const len of rhythms[Math.floor(rng() * rhythms.length)]) {
      deg = clamp(deg + Math.round((rng() - 0.5) * 4), 0, scale.length - 1);
      const f = 440 * 2 ** ((scale[deg] - 69) / 12);
      const t = barStart + pos * step;
      const dur = len * step * 0.95;
      notes.push({ t, dur, f });
      add(t, dur + 0.05, (tau) => {
        const env = Math.min(1, tau / 0.005) * (tau > dur ? Math.max(0, 1 - (tau - dur) / 0.04) : 1) * (0.7 + 0.3 * Math.exp(-tau / 0.3));
        const w = 2 * Math.PI * f * tau;
        return 0.16 * env * (Math.sin(w) + 0.35 * Math.sin(2 * w) + 0.15 * Math.sin(3 * w));
      });
      pos += len;
    }
  }
  for (let i = 0; i < x.length; i++) x[i] = 0.6 * x[i] + 0.0008 * (rng() * 2 - 1);
  return { samples: x, kicks, snares, hats, notes };
}

function encodeWav(samples, sr, kind) {
  const width = kind === 'pcm16' ? 2 : kind === 'pcm24' ? 3 : 4;
  const format = kind === 'float32' ? 3 : 1;
  const data = samples.length * width;
  const buf = new Uint8Array(44 + data);
  const v = new DataView(buf.buffer);
  const put = (at, s) => [...s].forEach((ch, i) => (buf[at + i] = ch.charCodeAt(0)));
  put(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  put(8, 'WAVE');
  put(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, format, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * width, true);
  v.setUint16(32, width, true);
  v.setUint16(34, width * 8, true);
  put(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0, o = 44; i < samples.length; i++, o += width) {
    const s = clamp(samples[i], -1, 1);
    if (kind === 'float32') v.setFloat32(o, s, true);
    else if (kind === 'pcm16') v.setInt16(o, Math.round(s * 32767), true);
    else {
      const q = Math.round(s * 8388607);
      buf[o] = q & 0xff;
      buf[o + 1] = (q >> 8) & 0xff;
      buf[o + 2] = (q >> 16) & 0xff;
    }
  }
  return buf;
}

function selfTest() {
  let failures = 0;
  const check = (ok, label) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) failures++;
  };

  console.log('WAV reader round-trip');
  const probe = Float32Array.from({ length: 1000 }, (_, i) => 0.9 * Math.sin(i / 7));
  for (const [kind, tol] of [['pcm16', 1e-4], ['pcm24', 1e-6], ['float32', 1e-7]]) {
    const back = decodeWav(encodeWav(probe, 44100, kind)).channelData[0];
    let err = 0;
    for (let i = 0; i < probe.length; i++) err = Math.max(err, Math.abs(back[i] - probe[i]));
    check(back.length === probe.length && err < tol, `${kind}: max error ${err.toExponential(2)}`);
  }

  const cases = [
    { name: '128 BPM, first beat 0.37 s, 44.1 kHz pcm16', bpm: 128, firstBeat: 0.37, sr: 44100, prompt: 125, wav: 'pcm16', seed: 1 },
    { name: '174 BPM, first beat 0.12 s, 48 kHz float32', bpm: 174, firstBeat: 0.12, sr: 48000, prompt: 178, wav: 'float32', seed: 7 },
  ];
  for (const c of cases) {
    console.log(`\nCase: ${c.name} (prompt says ${c.prompt} BPM)`);
    const started = Date.now();
    const syn = synthesize({ bpm: c.bpm, firstBeat: c.firstBeat, seconds: 60, sr: c.sr, seed: c.seed });
    const decoded = decodeWav(encodeWav(syn.samples, c.sr, c.wav));
    const a = analyzeAudio(toMono(decoded.channelData), decoded.sampleRate, c.prompt);
    const beatmaps = buildCharts(a, `selftest-${c.bpm}`);
    const secs = ((Date.now() - started) / 1000).toFixed(2);

    const P = 60 / c.bpm;
    const phaseErr = Math.abs(mod(a.beatPhase - c.firstBeat + P / 2, P) - P / 2);
    const tol = 0.03;
    const errs = [];
    let hit = 0;
    for (const k of syn.kicks) {
      let bestErr = Infinity;
      for (const o of a.onsets) if (Math.abs(o.time - k) < Math.abs(bestErr)) bestErr = o.time - k;
      if (Math.abs(bestErr) <= tol) {
        hit++;
        errs.push(bestErr);
      }
    }
    const recall = hit / syn.kicks.length;
    const bias = errs.length ? mean(errs) : NaN;
    const near = (t) => a.onsets.find((o) => Math.abs(o.time - t) <= tol);
    const bandOf = (times) => mean(times.map(near).filter(Boolean).map((o) => o.band));
    const strengthOf = (times) => mean(times.map(near).filter(Boolean).map((o) => o.strength));
    const offHats = syn.hats.filter((_, i) => i % 2 === 1);
    const onKick = (n) => syn.kicks.some((k) => Math.abs(k - n.t) < 0.03);
    const held = (list) => `${list.filter((n) => (near(n.t)?.sustain ?? 0) >= P).length}/${list.length}`;
    const longNotes = syn.notes.filter((n) => n.dur >= 1.5 * P);
    const shortNotes = syn.notes.filter((n) => n.dur <= 0.5 * P);
    const downbeatErr = Math.abs(mod(a.downbeat - c.firstBeat + 2 * P, 4 * P) - 2 * P);

    console.log(
      `  detected ${a.bpm.toFixed(3)} BPM (confidence ${a.confidence.toFixed(2)}), beat phase ${a.beatPhase.toFixed(4)} s, ` +
        `downbeat ${a.downbeat.toFixed(3)} s, duration ${a.duration.toFixed(3)} s, ${a.onsets.length} onsets, ${secs}s`
    );
    console.log(
      `  kick timing bias ${(bias * 1000).toFixed(1)} ms; band kick ${bandOf(syn.kicks).toFixed(2)} / off-beat hat ${bandOf(offHats).toFixed(2)}; ` +
        `strength kick ${strengthOf(syn.kicks).toFixed(2)} / off-beat hat ${strengthOf(offHats).toFixed(2)}`
    );
    console.log(
      `  sustain >= 1 beat: long notes off-kick ${held(longNotes.filter((n) => !onKick(n)))}, ` +
        `long notes on a kick ${held(longNotes.filter(onKick))}, short notes ${held(shortNotes)}`
    );
    console.log(`  leadIn ${a.leadIn.toFixed(2)} s, tailOut ${a.tailOut.toFixed(2)} s, preview ${a.previewStart.toFixed(2)} s, drift [${a.drift.map((d) => Math.round(d * 1000)).join(' ')}] ms`);
    for (const w of a.warnings) console.log(`  ! ${w}`);
    const counts = DIFFICULTIES.map((d) => beatmaps[d].noteCount);
    console.log(`  notes ${DIFFICULTIES.map((d, i) => `${d} ${counts[i]} (Lv${beatmaps[d].level})`).join(' | ')}`);

    check(Math.abs(a.bpm - c.bpm) < 0.3, `|bpm - ${c.bpm}| = ${Math.abs(a.bpm - c.bpm).toFixed(3)} < 0.3`);
    check(phaseErr < 0.015, `beat phase error ${(phaseErr * 1000).toFixed(1)} ms < 15 ms`);
    check(recall >= 0.9, `kick onset recall ${(recall * 100).toFixed(1)}% >= 90% (±${tol * 1000} ms)`);
    check(counts.every((n) => n > 0), 'every difficulty has notes');
    check(counts.every((n, i) => i === 0 || n > counts[i - 1]), `note counts increase EASY < NORMAL < HARD < EXPERT (${counts.join(' < ')})`);
    check(downbeatErr < 0.015, `downbeat on bar 1 (error ${(downbeatErr * 1000).toFixed(1)} ms)`);
    check(Math.abs(a.duration - 60) < 0.01, `duration ${a.duration.toFixed(3)} s == 60 s`);
    check(a.previewStart >= 8 && a.previewStart + PREVIEW_SEC <= a.duration - 15 + 1e-6, `preview window ${a.previewStart.toFixed(2)}..${(a.previewStart + PREVIEW_SEC).toFixed(2)} s inside [8, ${(a.duration - 15).toFixed(2)}]`);
    check(!a.tempoMismatch && !a.alias.switched, 'prompt-level tempo kept (no mismatch, no double switch)');
    check(a.gridMiss < 0.05, `strong onsets off the 16th grid ${(a.gridMiss * 100).toFixed(1)}% < 5%`);
    const lastEnd = Math.max(...DIFFICULTIES.flatMap((d) => beatmaps[d].notes.map((n) => n.time + (n.duration ?? 0))));
    check(lastEnd <= a.duration - HOLD_END_MARGIN + 1e-6, `last note/hold ends at ${lastEnd.toFixed(3)} s <= duration - ${HOLD_END_MARGIN} s`);
  }

  // Lyria ignored the prompt tempo: the chart must be refused, and "chartBpm" must unlock it.
  console.log('\nCase: 90 BPM audio, prompt says 120 BPM (Lyria ignored the tempo)');
  {
    const syn = synthesize({ bpm: 90, firstBeat: 0.25, seconds: 60, sr: 44100, seed: 3 });
    const a = analyzeAudio(syn.samples, 44100, 120);
    console.log(`  detected ${a.bpm.toFixed(3)} BPM (window best ${a.searchedBpm.toFixed(2)}), mismatch ${JSON.stringify(a.tempoMismatch)}`);
    check(a.tempoMismatch !== null, 'tempo outside prompt ±12% (and its half/double) is flagged -> chartSong refuses');
    const o = analyzeAudio(syn.samples, 44100, 120, { chartBpm: 90 });
    console.log(`  with "chartBpm": 90 -> ${o.bpm.toFixed(3)} BPM, off-grid ${(o.gridMiss * 100).toFixed(1)}%`);
    check(!o.tempoMismatch && Math.abs(o.bpm - 90) < 0.3, 'chartBpm override is honoured');
  }

  console.log('\nLyrics vs. JSON structure text parts');
  {
    const lyrics = '[Verse]\n夜の街を走る\n\n[Chorus]\n止まらない';
    const mixed = `{"sections": [{"name": "Verse", "note": "a } in a string"}]}\n\n${lyrics}\n\n\`\`\`json\n{"bpm": 128}\n\`\`\``;
    check(stripStructure(mixed) === lyrics, 'JSON parts (bare or fenced) are dropped, [Section] tags kept');
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  return failures ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--test')) {
    process.exitCode = selfTest();
  } else {
    const bad = args.filter((a) => a.startsWith('--'));
    if (bad.length) {
      console.error(`알 수 없는 옵션: ${bad.join(' ')}  (사용법: node music/chart.mjs [ids...] | --test)`);
      process.exitCode = 1;
    } else {
      await main(args.filter((a) => !a.startsWith('--')));
    }
  }
}
