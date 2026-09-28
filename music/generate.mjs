// Generates the songs listed in music/songs.json with Gemini Lyria (generateContent) and stores
// the raw results in music/raw/: <id>.mp3 (or .wav), <id>.txt (text parts), <id>.json (metadata).
//
//   node music/generate.mjs                    # songs that have no raw audio yet
//   node music/generate.mjs neon-velocity ...  # only these ids (existing audio still needs --force)
//   node music/generate.mjs --force            # regenerate; the previous take moves to raw/previous/
//   node music/generate.mjs --dry-run          # print the exact prompts, no API calls
//   node music/generate.mjs --concurrency=3    # parallel requests (default 2)
//   node music/generate.mjs --probe            # one cheap 30 s lyria-3-clip-preview call -> raw/_probe.*
//   node music/generate.mjs --vertex           # Vertex AI (Google Cloud credits) instead of an API key
//
// API key: GEMINI_API_KEY from the environment, else from .env.local / .env in the project root.
// Vertex:  Application Default Credentials (gcloud auth application-default login) with
//          GOOGLE_CLOUD_PROJECT (env or .env.local) and GOOGLE_CLOUD_LOCATION (default "global").
//          Lyria on Vertex only works in "global" and through the Interactions API.
// Model:   LYRIA_MODEL env > songs.json "model" > lyria-3.5.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUSIC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(MUSIC_DIR, '..');
const RAW_DIR = join(MUSIC_DIR, 'raw');
const DEFAULT_MODEL = 'lyria-3.5';
// Still the only 30 s clip model, so the cheap probe keeps it (deprecated too, see below).
const PROBE_MODEL = 'lyria-3-clip-preview';
// ai.google.dev/gemini-api/docs/deprecations: deprecated 2026-03-25, no shutdown date yet.
const DEPRECATED_MODELS = new Set(['lyria-3-pro-preview', 'lyria-3-clip-preview']);
const RAW_EXTS = ['mp3', 'wav', 'txt', 'json', 'structure.json'];
const DEFAULT_LENGTH_SEC = 105;
const MAX_TRIES = 3;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]));
const onlyIds = args.filter((a) => !a.startsWith('--'));
const force = flags.has('--force');
const dryRun = flags.has('--dry-run');
const probe = flags.has('--probe');
const concurrencyArg = args.find((a) => a.startsWith('--concurrency='));
const concurrency = Math.max(1, Number.parseInt(concurrencyArg?.split('=')[1] ?? '2', 10) || 2);
const unknownFlags = [...flags].filter((f) => !['--force', '--dry-run', '--probe', '--concurrency', '--vertex'].includes(f));
const useVertex = flags.has('--vertex') || /^vertex$/i.test(process.env.LYRIA_BACKEND ?? '');

// ---------------------------------------------------------------------------------------------
// Config, key, prompt
// ---------------------------------------------------------------------------------------------

function loadConfig() {
  const config = JSON.parse(readFileSync(join(MUSIC_DIR, 'songs.json'), 'utf8'));
  return { ...config, songs: Array.isArray(config.songs) ? config.songs : [] };
}

/** Reads GEMINI_API_KEY without ever printing it. Returns { key, source } or null. */
function loadApiKey() {
  const clean = (v) => {
    let s = String(v ?? '').replace(/\r/g, '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1).trim();
    return s && s !== 'MY_GEMINI_API_KEY' ? s : null;
  };
  const fromEnv = clean(process.env.GEMINI_API_KEY);
  if (fromEnv) return { key: fromEnv, source: 'environment' };
  for (const file of ['.env.local', '.env']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$/);
      if (!m) continue;
      let value = m[1].replace(/\r/g, '').trim();
      if (!/^["']/.test(value)) value = value.replace(/\s+#.*$/, ''); // inline comment on unquoted values
      const key = clean(value);
      if (key) return { key, source: file };
    }
  }
  return null;
}

/** A plain (non-secret) setting from the environment or .env.local / .env. */
function loadSetting(name) {
  const fromEnv = String(process.env[name] ?? '').trim();
  if (fromEnv) return fromEnv;
  for (const file of ['.env.local', '.env']) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m || m[1] !== name) continue;
      const v = m[2].replace(/\r/g, '').trim().replace(/^["']|["']$/g, '').trim();
      if (v) return v;
    }
  }
  return '';
}

function formatLength(sec) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The exact text sent to Lyria: song prompt, shared style, length, tempo, vocals / lyrics. */
function buildPrompt(song, style) {
  const lengthSec = Number(song.lengthSec) > 0 ? Number(song.lengthSec) : DEFAULT_LENGTH_SEC;
  const vocal = song.vocal === 'ja' ? 'ja' : 'none';
  const lyrics = (song.lyrics ?? '').trim();
  const parts = [String(song.prompt ?? '').trim()];
  if (style?.trim()) parts.push(style.trim());
  const direction = [
    `Length: about ${formatLength(lengthSec)} (${Math.round(lengthSec)} seconds).`,
    `Tempo: exactly ${song.bpm} BPM throughout — one constant tempo from the first bar to the last, no tempo changes.`,
  ];
  if (vocal === 'ja') {
    // Lyria writes lyrics in the language of the prompt, so when it has to write them itself the
    // direction is given in Japanese.
    direction.push(
      lyrics
        ? 'Vocals: sung entirely in Japanese (歌詞はすべて日本語で歌う). Sing the lyrics below exactly as written, following the section tags.'
        : 'ボーカル: 日本語で歌うこと。オリジナルの日本語の歌詞を書き、[Verse] / [Chorus] などのセクションに沿って歌ってください。英語の歌詞は使わないでください。'
    );
  } else {
    direction.push('Instrumental only, no vocals.');
  }
  parts.push(direction.join('\n'));
  if (vocal === 'ja' && lyrics) parts.push(`Lyrics:\n\n${lyrics}`);
  return parts.join('\n\n');
}

function promptWarnings(song, style) {
  const warnings = [];
  const vocal = song.vocal === 'ja' ? 'ja' : 'none';
  if (vocal === 'ja' && /no vocals|instrumental only/i.test(style ?? '')) {
    warnings.push('보컬 곡인데 공통 style에 "no vocals / instrumental only"가 들어 있어 지시가 충돌합니다');
  }
  if (vocal === 'ja' && !(song.lyrics ?? '').trim()) {
    warnings.push(
      'vocal이 "ja"인데 lyrics가 비어 있습니다. Lyria는 프롬프트 언어로 가사를 쓰므로(본문은 영어) 영어 가사가 나올 수 있습니다. ' +
        '보컬 지시는 일본어로 보내지만, 일본어 가사를 lyrics에 직접 넣는 것을 권장합니다'
    );
  }
  if (vocal === 'none' && (song.lyrics ?? '').trim()) warnings.push('vocal이 "none"이라 lyrics는 프롬프트에 넣지 않습니다');
  if (!Number(song.bpm)) warnings.push('bpm이 없습니다');
  if (!String(song.prompt ?? '').trim()) warnings.push('prompt가 비어 있습니다');
  return warnings;
}

// ---------------------------------------------------------------------------------------------
// API call
// ---------------------------------------------------------------------------------------------

let secret = null;
const redact = (text) => (secret ? String(text).split(secret).join('***') : String(text));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function errorStatus(err) {
  if (typeof err?.status === 'number') return err.status;
  const m = String(err?.message ?? '').match(/"code"\s*:\s*(\d{3})/);
  return m ? Number(m[1]) : undefined;
}

/** 429 with a quota of 0 (e.g. free tier without Lyria access) never succeeds on retry. */
const zeroQuota = (message) => /limit:\s*0\b/.test(message);

function errorHint(status, message) {
  if (useVertex) {
    if (/default credentials/i.test(message)) {
      return 'ADC 인증 정보가 없습니다. gcloud auth application-default login 으로 로그인하세요.';
    }
    if (status === 404 || /was not found or your project does not have access/i.test(message)) {
      return '404: 이 프로젝트가 Vertex AI의 이 Lyria 모델에 접근할 수 없습니다. 미리보기 모델은 허용 목록(allowlist) 신청이 필요할 수 있습니다. GOOGLE_CLOUD_LOCATION이 global인지도 확인하세요.';
    }
    if (status === 403) {
      return '403: 권한 문제입니다. 프로젝트에서 Vertex AI API(aiplatform.googleapis.com)를 켜고, 계정에 Vertex AI User 역할이 있는지, 결제(크레딧) 계정이 연결됐는지 확인하세요.';
    }
    if (status === 400) {
      return '400: 요청이 거부됐습니다. Vertex의 Lyria는 Interactions API + location "global"만 지원합니다. 프롬프트 정책 위반일 수도 있습니다.';
    }
  }
  if (status === 429 && zeroQuota(message)) {
    return '429 (할당량 0): 이 API 키의 프로젝트에는 Lyria 할당량이 없습니다(무료 등급은 limit 0). Google AI Studio에서 결제를 연결해 유료 등급으로 올린 뒤 다시 실행하세요. 재시도해도 해결되지 않습니다.';
  }
  if (/API_KEY_INVALID|API key not valid/i.test(message)) {
    return 'API 키가 유효하지 않습니다. .env.local의 GEMINI_API_KEY를 확인하세요.';
  }
  if (status === 400) {
    return '400 Bad Request: 요청이 거부됐습니다. 프롬프트가 정책에 걸렸거나(특정 아티스트 목소리/저작권 가사 요청 등) 모델이 지원하지 않는 설정일 수 있습니다.';
  }
  if (status === 401 || status === 403) {
    return `${status}: 권한 문제입니다. 키가 올바른지, 프로젝트에서 Gemini API가 켜져 있는지, Lyria 모델(유료 등급/결제 설정 필요할 수 있음)에 접근 가능한지 확인하세요.`;
  }
  if (status === 404) {
    return '404: 모델을 찾을 수 없습니다. LYRIA_MODEL 또는 songs.json "model" 값을 확인하세요 (문서 기준 현재 ID: lyria-3.5, 30초 클립은 lyria-3-clip-preview).';
  }
  if (status === 429) return '429: 할당량/속도 제한입니다. 잠시 후 다시 실행하거나 --concurrency=1 로 줄이세요.';
  if (status >= 500) return `${status}: 서버 오류입니다. 잠시 후 다시 시도하세요.`;
  return null;
}

async function withRetry(label, fn, tries = MAX_TRIES) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = errorStatus(err);
      const network = status === undefined && /fetch failed|ECONNRESET|ETIMEDOUT|socket|network|aborted|timeout/i.test(String(err?.message ?? err));
      const retryable = (status === 429 && !zeroQuota(String(err?.message ?? ''))) || (status >= 500 && status < 600) || network;
      if (!retryable || attempt >= tries) throw err;
      const hinted = Number(String(err?.message ?? '').match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)?.[1] ?? 0) * 1000;
      const wait = Math.max(hinted, 10_000 * 2 ** (attempt - 1)) * (1 + Math.random() * 0.25);
      console.warn(`  ${label}: ${status ?? 'network'} 오류 -> ${Math.round(wait / 1000)}초 후 재시도 (${attempt + 1}/${tries})`);
      await sleep(wait);
    }
  }
}

function audioExtension(mimeType, bytes) {
  const mt = String(mimeType ?? '').toLowerCase();
  if (/mpeg|mp3/.test(mt)) return 'mp3';
  if (/wav|wave/.test(mt)) return 'wav';
  // unknown type: sniff the bytes
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  if (head === 'RIFF') return 'wav';
  if (head.startsWith('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

async function decodedDuration(path) {
  try {
    const bytes = new Uint8Array(readFileSync(path));
    if (path.endsWith('.wav')) {
      const { decodeWav } = await import('./chart.mjs');
      const { channelData, sampleRate } = decodeWav(bytes);
      return channelData[0].length / sampleRate;
    }
    const { MPEGDecoder } = await import('mpg123-decoder');
    const d = new MPEGDecoder();
    await d.ready;
    try {
      const { samplesDecoded, sampleRate } = d.decode(bytes);
      return samplesDecoded / sampleRate;
    } finally {
      d.free();
    }
  } catch {
    return null;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

/** Moves an existing take to raw/previous/ so a paid generation is never silently overwritten. */
function archivePrevious(id) {
  const exts = RAW_EXTS.filter((e) => existsSync(join(RAW_DIR, `${id}.${e}`)));
  if (!exts.length) return;
  const dir = join(RAW_DIR, 'previous');
  mkdirSync(dir, { recursive: true });
  const tag = stamp();
  for (const e of exts) renameSync(join(RAW_DIR, `${id}.${e}`), join(dir, `${id}.${tag}.${e}`));
}

/** A text part that is a JSON song-structure description (optionally in ``` fences), else undefined. */
function jsonPart(text) {
  const body = text
    .trim()
    .replace(/^```[a-zA-Z]*\s*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  if (!/^[[{]/.test(body)) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/**
 * One Lyria call, normalized across backends:
 *  - Gemini API key: models.generateContent -> candidates[0].content.parts (inlineData audio + text)
 *  - Vertex AI (ADC): interactions.create -> model_output steps / output_audio { data, mime_type }
 *    (generateContent returns 400 for Lyria on Vertex, see googleapis/python-genai#2533)
 */
async function callLyria(ai, model, prompt) {
  if (useVertex) {
    const interaction = await ai.interactions.create({ model, input: prompt });
    const audio = [];
    const texts = [];
    const seen = new Set();
    const addAudio = (a) => {
      if (!a?.data || seen.has(a.data)) return;
      seen.add(a.data);
      audio.push({ mimeType: a.mime_type ?? a.mimeType ?? '', bytes: Buffer.from(a.data, 'base64') });
    };
    for (const step of interaction.steps ?? []) {
      if (step?.type !== 'model_output') continue;
      for (const block of step.content ?? []) {
        if (block?.type === 'audio') addAudio(block);
        else if (block?.type === 'text' && String(block.text ?? '').trim()) texts.push(block.text);
      }
    }
    addAudio(interaction.output_audio); // the last audio block, in case steps were not included
    if (!texts.length && String(interaction.output_text ?? '').trim()) texts.push(interaction.output_text);
    const status = interaction.status ? String(interaction.status) : null;
    return {
      response: { modelVersion: interaction.model ?? null, responseId: interaction.id ?? null, usageMetadata: interaction.usage ?? null },
      feedback: null,
      candidate: null,
      finishReason: status && !/complete|succeed|done/i.test(status) ? status : 'STOP',
      parts: [...audio.map((a) => ({ inlineData: { mimeType: a.mimeType } })), ...texts.map((t) => ({ text: t }))],
      texts,
      audio,
    };
  }
  const response = await ai.models.generateContent({ model, contents: prompt });
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const texts = [];
  const audio = [];
  for (const part of parts) {
    if (part.thought) continue;
    if (typeof part.text === 'string' && part.text.trim()) texts.push(part.text);
    else if (part.inlineData?.data) audio.push({ mimeType: part.inlineData.mimeType ?? '', bytes: Buffer.from(part.inlineData.data, 'base64') });
    else if (part.fileData) console.warn(`  fileData 파트는 지원하지 않습니다 (${part.fileData.mimeType} ${part.fileData.fileUri})`);
  }
  return { response, feedback: response.promptFeedback, candidate, finishReason: candidate?.finishReason ?? null, parts, texts, audio };
}

async function generate(ai, { id, model, prompt, song, archive, tries = MAX_TRIES }) {
  const label = id;
  const started = Date.now();
  console.log(`...  ${label}: ${model} 요청 중`);
  const { response, feedback, candidate, finishReason, parts, texts, audio } = await withRetry(
    label,
    () => callLyria(ai, model, prompt),
    tries
  );

  const blocked = [];
  if (feedback?.blockReason) blocked.push(`프롬프트 차단: ${feedback.blockReason}${feedback.blockReasonMessage ? ` (${feedback.blockReasonMessage})` : ''}`);
  if (finishReason && finishReason !== 'STOP') blocked.push(`finishReason: ${finishReason}${candidate?.finishMessage ? ` (${candidate.finishMessage})` : ''}`);
  for (const r of candidate?.safetyRatings ?? []) if (r.blocked) blocked.push(`safety: ${r.category} ${r.probability ?? ''}`.trim());
  for (const line of blocked) console.warn(`  ${label}: ${line}`);

  if (!audio.length) {
    const reason = blocked.length ? blocked.join('; ') : candidate ? '응답에 오디오 파트가 없습니다' : '응답에 candidate가 없습니다';
    if (/SAFETY|PROHIBITED|BLOCKLIST|SPII/i.test(reason)) {
      console.warn(`  ${label}: 안전 필터에 걸렸습니다. 실존 아티스트 이름/목소리, 기존 곡 가사를 프롬프트에서 빼 보세요.`);
    } else if (/RECITATION/i.test(reason)) {
      console.warn(`  ${label}: 기존 저작물과 비슷하다고 판단됐습니다. 가사나 곡 묘사를 더 독창적으로 바꿔 보세요.`);
    }
    if (texts.length) console.warn(`  ${label}: 텍스트 응답: ${texts.join(' ').slice(0, 300)}`);
    throw new Error(reason);
  }
  if (audio.length > 1) console.warn(`  ${label}: 오디오 파트가 ${audio.length}개입니다. 가장 큰 것을 저장합니다.`);
  const main = audio.reduce((a, b) => (b.bytes.length > a.bytes.length ? b : a));
  const ext = audioExtension(main.mimeType, main.bytes);
  if (!ext) throw new Error(`알 수 없는 오디오 형식입니다 (mimeType "${main.mimeType}")`);

  mkdirSync(RAW_DIR, { recursive: true });
  if (archive) archivePrevious(id);
  for (const other of ['mp3', 'wav']) if (other !== ext) rmSync(join(RAW_DIR, `${id}.${other}`), { force: true });
  const audioPath = join(RAW_DIR, `${id}.${ext}`);
  writeFileSync(audioPath, main.bytes);
  // <id>.txt keeps every text part (lyrics and structure, in the order Lyria sent them; the lyrics
  // are not always first). Parts that are a JSON structure description are also saved parsed in
  // <id>.structure.json; chart.mjs drops them when it takes the lyrics from <id>.txt.
  const txtPath = join(RAW_DIR, `${id}.txt`);
  if (texts.length) writeFileSync(txtPath, texts.join('\n\n').trim() + '\n');
  else rmSync(txtPath, { force: true });
  const structure = texts.map(jsonPart).filter((j) => j !== undefined);
  const structurePath = join(RAW_DIR, `${id}.structure.json`);
  if (structure.length) writeFileSync(structurePath, JSON.stringify(structure.length === 1 ? structure[0] : structure, null, 2) + '\n');
  else rmSync(structurePath, { force: true });

  const duration = await decodedDuration(audioPath);
  const meta = {
    id,
    model,
    backend: useVertex ? 'vertex' : 'gemini-api',
    modelVersion: response.modelVersion ?? null,
    responseId: response.responseId ?? null,
    prompt,
    mimeType: main.mimeType,
    byteLength: main.bytes.length,
    durationSec: duration === null ? null : Math.round(duration * 1000) / 1000,
    finishReason,
    promptFeedback: feedback ?? null,
    safetyRatings: candidate?.safetyRatings ?? null,
    textParts: texts.length,
    textPartKinds: texts.map((t) => (jsonPart(t) === undefined ? 'text' : 'json')),
    partKinds: parts.map((p) => (p.inlineData ? `inlineData:${p.inlineData.mimeType}` : p.text !== undefined ? 'text' : Object.keys(p).join('+'))),
    usageMetadata: response.usageMetadata ?? null,
    bpm: song?.bpm ?? null,
    lengthSec: song ? (Number(song.lengthSec) > 0 ? Number(song.lengthSec) : DEFAULT_LENGTH_SEC) : null,
    vocal: song ? (song.vocal === 'ja' ? 'ja' : 'none') : null,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(RAW_DIR, `${id}.json`), JSON.stringify(meta, null, 2) + '\n');

  const secs = Math.round((Date.now() - started) / 1000);
  const len = duration === null ? '길이 확인 불가' : `${formatLength(duration)} (${duration.toFixed(1)}s${meta.lengthSec ? `, 목표 ${meta.lengthSec}s` : ''})`;
  const textInfo = `텍스트 ${texts.length}개${structure.length ? ` (구조 JSON ${structure.length}개)` : ''}`;
  console.log(`OK   ${label}: ${ext} ${(main.bytes.length / 1024).toFixed(0)} KB, ${len}, ${main.mimeType || 'mimeType 없음'}, ${textInfo}, ${secs}s`);
  return meta;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function makeClient(keyInfo) {
  const { GoogleGenAI } = await import('@google/genai');
  if (useVertex) {
    const project = loadSetting('GOOGLE_CLOUD_PROJECT');
    const location = loadSetting('GOOGLE_CLOUD_LOCATION') || 'global';
    if (!project) throw new Error('GOOGLE_CLOUD_PROJECT가 없습니다 (환경 변수 또는 .env.local).');
    console.log(`backend: Vertex AI (ADC) · project ${project} · location ${location}`);
    return new GoogleGenAI({ vertexai: true, project, location, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
  }
  if (!keyInfo) throw new Error('GEMINI_API_KEY를 찾을 수 없습니다 (환경 변수, .env.local, .env).');
  return new GoogleGenAI({ apiKey: keyInfo.key, httpOptions: { timeout: REQUEST_TIMEOUT_MS } });
}

async function main() {
  if (unknownFlags.length) {
    console.error(`알 수 없는 옵션: ${unknownFlags.join(' ')}`);
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  const model = process.env.LYRIA_MODEL?.trim() || config.model || DEFAULT_MODEL;
  const keyInfo = loadApiKey();
  secret = keyInfo?.key ?? null;

  if (probe) {
    const prompt =
      'A 30-second instrumental electronic groove at exactly 120 BPM: punchy four-on-the-floor kick, ' +
      'crisp closed hi-hats on every eighth note, a clap on beats 2 and 4, and a short plucked synth riff in A minor. ' +
      'Instrumental only, no vocals.';
    const probeModel = process.env.LYRIA_PROBE_MODEL?.trim() || PROBE_MODEL;
    if (DEPRECATED_MODELS.has(probeModel)) {
      console.log(`참고: ${probeModel}은 지원 중단 예정(deprecated) 모델이지만 30초 클립 모델이 이것뿐이라 키/권한 확인용으로만 씁니다.`);
    }
    if (dryRun) {
      console.log(`[dry-run] probe -> ${probeModel}\n${prompt}`);
      return;
    }
    const ai = await makeClient(keyInfo);
    await generate(ai, { id: '_probe', model: probeModel, prompt, song: null, archive: false, tries: 1 });
    return;
  }

  const known = new Set(config.songs.map((s) => s.id));
  const unknown = onlyIds.filter((id) => !known.has(id));
  if (unknown.length) {
    console.error(`songs.json에 없는 id: ${unknown.join(', ')}`);
    process.exitCode = 1;
  }
  const hasAudio = (id) => ['mp3', 'wav'].some((e) => existsSync(join(RAW_DIR, `${id}.${e}`)));
  const selected = config.songs.filter((s) => !onlyIds.length || onlyIds.includes(s.id));
  const jobs = selected.filter((s) => force || !hasAudio(s.id));
  const skipped = selected.filter((s) => !jobs.includes(s));
  if (skipped.length) console.log(`이미 오디오가 있어 건너뜀 (다시 만들려면 --force): ${skipped.map((s) => s.id).join(', ')}`);

  console.log(`model: ${model}${process.env.LYRIA_MODEL ? ' (LYRIA_MODEL)' : ''}`);
  if (DEPRECATED_MODELS.has(model)) {
    console.warn(
      `! ${model}은 2026-03-25부터 지원 중단 예정(deprecated)인 미리보기 모델입니다. 권장: lyria-3.5 ` +
        `(songs.json "model" 또는 LYRIA_MODEL=lyria-3.5). lyria-3.5는 무료 등급이 없어 결제 연결이 필요합니다`
    );
  }
  if (dryRun) {
    console.log(`${useVertex ? `backend: Vertex AI (ADC), project ${loadSetting('GOOGLE_CLOUD_PROJECT') || '(없음)'}` : `API key: ${keyInfo ? `찾음 (${keyInfo.source})` : '없음'}`} — dry-run이라 호출하지 않습니다\n`);
    for (const song of jobs) {
      const lengthSec = Number(song.lengthSec) > 0 ? Number(song.lengthSec) : DEFAULT_LENGTH_SEC;
      const kind = song.vocal === 'ja' ? 'Japanese vocal' : 'instrumental';
      console.log(`── ${song.id} (${song.bpm} BPM, ~${formatLength(lengthSec)}, ${kind}) ${'─'.repeat(20)}`);
      for (const w of promptWarnings(song, config.style)) console.log(`! ${w}`);
      console.log(buildPrompt(song, config.style));
      console.log('');
    }
    console.log(`${jobs.length}곡의 프롬프트를 출력했습니다.`);
    return;
  }

  if (!jobs.length) {
    console.log('생성할 곡이 없습니다.');
    return;
  }
  const ai = await makeClient(keyInfo);

  console.log(`${jobs.length}곡 생성 시작 (동시 ${Math.min(concurrency, jobs.length)}개)`);
  const queue = [...jobs];
  const failed = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (queue.length) {
        const song = queue.shift();
        for (const w of promptWarnings(song, config.style)) console.warn(`  ${song.id}: ! ${w}`);
        try {
          await generate(ai, { id: song.id, model, prompt: buildPrompt(song, config.style), song, archive: true });
        } catch (err) {
          const status = errorStatus(err);
          const message = redact(err?.message ?? err);
          console.error(`FAIL ${song.id}: ${message.slice(0, 600)}`);
          const hint = errorHint(status, message);
          if (hint) console.error(`     ${hint}`);
          failed.push(song.id);
        }
      }
    })
  );
  if (failed.length) {
    console.error(`실패: ${failed.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('완료. 다음 단계: node music/chart.mjs');
  }
}

try {
  await main();
} catch (err) {
  const message = redact(err?.message ?? err);
  console.error(`오류: ${message.slice(0, 600)}`);
  const hint = errorHint(errorStatus(err), message);
  if (hint) console.error(hint);
  process.exitCode = 1;
}
