/**
 * Generated song library: reads public/music/manifest.json (written by music/chart.mjs)
 * and expands its compact charts into the game's SongMetadata / Note objects.
 *
 * Keep this file dependency-free (type-only imports) so it can be smoke-tested in Node.
 */
import type { Beatmap, DifficultyLevel, Note, SongMetadata } from '../types/game';

export const MANIFEST_URL = '/music/manifest.json';

const DIFFICULTIES: DifficultyLevel[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
const LANE_COUNT = 4;
const DEFAULT_PREVIEW_DURATION = 12;

type JsonObject = Record<string, unknown>;

const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

let reportedUnavailable = false;
function reportUnavailable(reason: string) {
  if (reportedUnavailable) return;
  reportedUnavailable = true;
  console.info(`[musicLibrary] No generated songs (${reason}); using the built-in songs only.`);
}

/** Generated songs from the manifest, or [] when there is none (or it cannot be read). */
export async function loadGeneratedSongs(): Promise<SongMetadata[]> {
  let data: unknown;
  try {
    // Asking for JSON keeps the dev server from answering a missing file with index.html
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      reportUnavailable(`${MANIFEST_URL} answered ${res.status}`);
      return [];
    }
    data = await res.json();
  } catch (err) {
    reportUnavailable(`${MANIFEST_URL} could not be read: ${errorText(err)}`);
    return [];
  }
  return parseManifest(data);
}

/** Validate a manifest and expand it; malformed songs are skipped with a warning. */
export function parseManifest(data: unknown): SongMetadata[] {
  if (!isObject(data) || !Array.isArray(data.songs)) {
    console.warn('[musicLibrary] manifest.json is not { version: 1, songs: [...] }; ignoring it.');
    return [];
  }
  if (data.version !== undefined && data.version !== 1) {
    console.warn(`[musicLibrary] Unsupported manifest version ${String(data.version)}; ignoring it.`);
    return [];
  }

  const songs: SongMetadata[] = [];
  const seen = new Set<string>();
  data.songs.forEach((entry, index) => {
    const label = isObject(entry) && typeof entry.id === 'string' ? entry.id : `#${index}`;
    try {
      const song = parseSong(entry);
      if (seen.has(song.id)) throw new Error('duplicate id');
      seen.add(song.id);
      songs.push(song);
    } catch (err) {
      console.warn(`[musicLibrary] Skipping song ${label}: ${errorText(err)}`);
    }
  });
  return songs;
}

function requireString(obj: JsonObject, key: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`"${key}" is missing`);
  return v;
}

function optionalString(obj: JsonObject, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function requirePositive(obj: JsonObject, key: string): number {
  const v = obj[key];
  if (!isNumber(v) || v <= 0) throw new Error(`"${key}" must be a positive number`);
  return v;
}

function parseSong(entry: unknown): SongMetadata {
  if (!isObject(entry)) throw new Error('entry is not an object');

  const id = requireString(entry, 'id');
  const title = requireString(entry, 'title');
  const audioUrl = requireString(entry, 'audioUrl');
  const bpm = requirePositive(entry, 'bpm');
  const duration = requirePositive(entry, 'duration');

  const charts = entry.charts;
  if (!isObject(charts)) throw new Error('"charts" is missing');
  const difficulties = {} as Record<DifficultyLevel, Beatmap>;
  for (const diff of DIFFICULTIES) {
    difficulties[diff] = parseChart(id, diff, charts[diff], duration);
  }

  const previewDuration =
    isNumber(entry.previewDuration) && entry.previewDuration > 0 ? entry.previewDuration : DEFAULT_PREVIEW_DURATION;
  const previewStart =
    isNumber(entry.previewStart) && entry.previewStart >= 0 ? entry.previewStart : Math.round(duration * 0.3);
  const lyrics = optionalString(entry, 'lyrics');
  // No made-up per-id path: without a stageUrl, getStageUrl() falls back to the title backdrop
  const stageUrl = optionalString(entry, 'stageUrl');

  return {
    id,
    title,
    artist: optionalString(entry, 'artist') ?? '',
    genre: optionalString(entry, 'genre') ?? '',
    bpm,
    duration,
    coverUrl: optionalString(entry, 'coverUrl') ?? `/images/covers/${id}.webp`,
    ...(stageUrl ? { stageUrl } : {}),
    previewStart,
    previewDuration,
    difficulties,
    musicPatternId: 'audio',
    audioUrl,
    vocal: entry.vocal === 'ja' ? 'ja' : 'none',
    ...(lyrics ? { lyrics } : {}),
  };
}

/** Expand compact [time, lane] / [time, lane, holdDuration] notes into Note objects. */
function parseChart(songId: string, diff: DifficultyLevel, chart: unknown, duration: number): Beatmap {
  if (!isObject(chart)) throw new Error(`chart ${diff} is missing`);
  if (!isNumber(chart.level)) throw new Error(`${diff}: "level" must be a number`);
  if (!Array.isArray(chart.notes)) throw new Error(`${diff}: "notes" must be an array`);

  const parsed = chart.notes.map((raw: unknown, i) => {
    if (!Array.isArray(raw) || raw.length < 2 || raw.length > 3) {
      throw new Error(`${diff} note ${i} is not [time, lane] or [time, lane, hold]`);
    }
    const [time, lane, hold] = raw as unknown[];
    if (!isNumber(time) || time < 0 || time > duration) {
      throw new Error(`${diff} note ${i} has an invalid time`);
    }
    if (!isNumber(lane) || !Number.isInteger(lane) || lane < 0 || lane >= LANE_COUNT) {
      throw new Error(`${diff} note ${i} has an invalid lane`);
    }
    if (raw.length === 3 && (!isNumber(hold) || hold < 0)) {
      throw new Error(`${diff} note ${i} has an invalid hold duration`);
    }
    return { time, lane, hold: isNumber(hold) && hold > 0 ? hold : undefined };
  });

  // The manifest is already sorted; sorting again keeps the game's end-of-song check safe.
  parsed.sort((a, b) => a.time - b.time || a.lane - b.lane);

  const notes: Note[] = parsed.map((n, i) => ({
    id: `${songId}_${diff}_${i}`,
    lane: n.lane,
    time: n.time,
    ...(n.hold ? { duration: n.hold } : {}),
  }));

  return {
    difficulty: diff,
    level: Math.max(1, Math.round(chart.level)),
    notes,
    noteCount: notes.length,
  };
}
