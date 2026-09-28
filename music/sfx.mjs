// Game sound effects -> public/sfx/
//   hit.wav   : the note hit sound (pitch-less percussive "tak", same for every lane)
//   clear.wav : stage-clear fanfare, cut from a Lyria clip (music/raw/sfx-clear.mp3)
//
//   node music/sfx.mjs            # render hit.wav; cut clear.wav if the Lyria clip exists
//   node music/sfx.mjs --vertex   # also generate the fanfare clip with Lyria (Vertex AI, ~$0.04)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUSIC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(MUSIC_DIR, '..');
const OUT_DIR = join(ROOT, 'public', 'sfx');
const RAW_CLEAR = join(MUSIC_DIR, 'raw', 'sfx-clear.mp3');
const SR = 44100;

const CLEAR_PROMPT =
  'A short, bright video game STAGE CLEAR victory fanfare stinger. It starts immediately on the very first beat with a big ' +
  'orchestra hit and a cymbal crash, then a triumphant brass fanfare with rising strings, timpani and sparkling bells, and ' +
  'resolves on a huge sustained major chord within the first 4 seconds; after that only a soft ambient shimmer tail. ' +
  'Instrumental only, no vocals. Crisp, loud, celebratory, polished game-audio mix.';

// ---------------------------------------------------------------------------------------------
// WAV writer (16-bit PCM)
// ---------------------------------------------------------------------------------------------
function writeWav(path, channels) {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), 44 + (i * ch + c) * 2);
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

// ---------------------------------------------------------------------------------------------
// Hit sound: layered percussive one-shot, no musical pitch so it never clashes with a song's key
// ---------------------------------------------------------------------------------------------
function biquadBandpass(input, freq, q) {
  const w = (2 * Math.PI * freq) / SR;
  const alpha = Math.sin(w) / (2 * q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
  const out = new Float32Array(input.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

function renderHit() {
  const n = Math.round(SR * 0.16);
  let seed = 1234567;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  const noise = Float32Array.from({ length: n }, rand);

  const snap = biquadBandpass(noise, 3200, 0.9); // bright snare-like "tsk"
  const crack = biquadBandpass(noise, 7500, 1.2); // very short air on the attack
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // low "thump": fast downward sweep, so it reads as a drum hit rather than a note
    const f = 70 + 150 * Math.exp(-t / 0.012);
    phase += (2 * Math.PI * f) / SR;
    const body = Math.sin(phase) * Math.exp(-t / 0.028) * 0.55;
    const snapEnv = Math.exp(-t / 0.022) * 1.6;
    const crackEnv = Math.exp(-t / 0.0025) * 1.2;
    const click = i < 40 ? (1 - i / 40) * 0.6 : 0;
    out[i] = body + snap[i] * snapEnv + crack[i] * crackEnv + click;
  }
  // gentle soft-clip + normalize, short fade at the end
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.tanh(out[i] * 1.4);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  for (let i = 0; i < n; i++) {
    const fade = i > n - 400 ? (n - i) / 400 : 1;
    out[i] = (out[i] / peak) * 0.9 * fade;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Clear fanfare: generate with Lyria (optional), then cut the first seconds from the onset
// ---------------------------------------------------------------------------------------------
function loadSetting(name) {
  if (process.env[name]) return process.env[name].trim();
  for (const f of ['.env.local', '.env']) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)$`, 'm'));
    if (m) return m[1].replace(/\r/g, '').trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

async function generateClearClip() {
  const project = loadSetting('GOOGLE_CLOUD_PROJECT');
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT가 없습니다 (.env.local).');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ vertexai: true, project, location: loadSetting('GOOGLE_CLOUD_LOCATION') || 'global' });
  console.log('...  sfx-clear: lyria-3-clip-preview 요청 중 (Vertex AI)');
  const it = await ai.interactions.create({ model: 'lyria-3-clip-preview', input: CLEAR_PROMPT });
  const audio = it.output_audio?.data;
  if (!audio) throw new Error('응답에 오디오가 없습니다');
  mkdirSync(dirname(RAW_CLEAR), { recursive: true });
  writeFileSync(RAW_CLEAR, Buffer.from(audio, 'base64'));
  console.log(`OK   sfx-clear: ${RAW_CLEAR}`);
}

async function cutClear() {
  const { MPEGDecoder } = await import('mpg123-decoder');
  const d = new MPEGDecoder();
  await d.ready;
  const { channelData, sampleRate } = d.decode(new Uint8Array(readFileSync(RAW_CLEAR)));
  d.free();
  if (sampleRate !== SR) throw new Error(`unexpected sample rate ${sampleRate}`);
  const L = channelData[0];
  const R = channelData[1] ?? channelData[0];
  let start = 0;
  while (start < L.length && Math.max(Math.abs(L[start]), Math.abs(R[start])) < 0.02) start++;
  start = Math.max(0, start - Math.round(SR * 0.005));
  const len = Math.min(L.length - start, Math.round(SR * 5.2));
  const fade = Math.round(SR * 1.0);
  const out = [new Float32Array(len), new Float32Array(len)];
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const g = i > len - fade ? (len - i) / fade : 1;
    out[0][i] = L[start + i] * g;
    out[1][i] = R[start + i] * g;
    peak = Math.max(peak, Math.abs(out[0][i]), Math.abs(out[1][i]));
  }
  for (const c of out) for (let i = 0; i < len; i++) c[i] = (c[i] / peak) * 0.89;
  writeWav(join(OUT_DIR, 'clear.wav'), out);
  console.log(`ok   public/sfx/clear.wav (${(len / SR).toFixed(2)}s from ${(start / SR).toFixed(2)}s)`);
}

writeWav(join(OUT_DIR, 'hit.wav'), [renderHit()]);
console.log('ok   public/sfx/hit.wav');
if (process.argv.includes('--vertex')) await generateClearClip();
if (existsSync(RAW_CLEAR)) await cutClear();
else console.log('skip clear.wav (music/raw/sfx-clear.mp3 없음 — node music/sfx.mjs --vertex 로 생성)');
