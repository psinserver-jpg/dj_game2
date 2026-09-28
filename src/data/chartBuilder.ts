/**
 * Chart generator shared by the game (built-in synth songs) and music/chart.mjs
 * (Lyria-generated audio). It turns a list of musical onsets into four difficulty charts.
 *
 * Why charts don't repeat:
 *  - notes are placed only where the music has an onset, picked by loudness + metric weight,
 *    with seeded per-phrase variation so weaker hits change from bar to bar;
 *  - lanes follow the pitch/brightness of each onset (low -> left, high -> right), shifted
 *    and mirrored per 2-bar phrase, and a phrase whose lane sequence already appeared is
 *    transformed before it is accepted.
 *
 * Keep this file dependency-free (type-only imports) so Node can run it directly.
 */
import type { Beatmap, DifficultyLevel, Note } from '../types/game';

export interface Onset {
  time: number; // seconds
  strength: number; // ~0..1
  band: number; // 0 = low/dark .. 1 = high/bright
  sustain?: number; // seconds the sound keeps ringing (hold note candidates)
}

export interface ChartInput {
  onsets: Onset[];
  bpm: number;
  duration: number;
  seed: string;
  gridOffset?: number; // time of the first 16th-grid line, seconds
  leadIn?: number; // no notes before this time
  tailOut?: number; // no notes in the last N seconds
}

interface DifficultySpec {
  nps: number; // target notes per second (upper bound; the music may offer fewer)
  minGapSteps: number; // minimum 16th steps between notes
  maxRun: number; // max consecutive notes at the minimum gap
  chordRate: number; // share of strong downbeats that get a second note
  holdRate: number;
  maxHoldBeats: number;
  holdsBlockOthers: boolean; // easier charts keep other lanes free during a hold
  grid: number; // notes only on every Nth 16th: 4 = beats, 2 = 8ths, 1 = 16ths
  offbeat16Strength: number; // 16th off-beats (odd steps) need at least this strength
}

const SPECS: Record<DifficultyLevel, DifficultySpec> = {
  EASY: { nps: 1.4, minGapSteps: 4, maxRun: 99, chordRate: 0, holdRate: 0.35, maxHoldBeats: 3, holdsBlockOthers: true, grid: 4, offbeat16Strength: 9 },
  NORMAL: { nps: 2.7, minGapSteps: 2, maxRun: 6, chordRate: 0.05, holdRate: 0.2, maxHoldBeats: 2, holdsBlockOthers: false, grid: 2, offbeat16Strength: 9 },
  HARD: { nps: 4.5, minGapSteps: 1, maxRun: 4, chordRate: 0.12, holdRate: 0.18, maxHoldBeats: 2, holdsBlockOthers: false, grid: 1, offbeat16Strength: 0.55 },
  EXPERT: { nps: 6.8, minGapSteps: 1, maxRun: 8, chordRate: 0.2, holdRate: 0.12, maxHoldBeats: 2, holdsBlockOthers: false, grid: 1, offbeat16Strength: 0.3 },
};

const DIFFICULTIES: DifficultyLevel[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];
const PHRASE_STEPS = 32; // 2 bars of 16ths

// --- Seeded RNG so every build of a song produces the same chart ---
function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function makeRng(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

interface Slot {
  idx: number; // 16th-step index
  time: number;
  strength: number;
  band: number;
  sustain: number;
}

/** Quantize onsets to the 16th grid and merge onsets that share a step. */
function toSlots(input: ChartInput, stepSec: number): Slot[] {
  const gridOffset = input.gridOffset ?? 0;
  const leadIn = input.leadIn ?? 2.0;
  const tailOut = input.tailOut ?? 1.5;
  const byIdx = new Map<number, Slot>();

  for (const o of input.onsets) {
    const idx = Math.round((o.time - gridOffset) / stepSec);
    const time = gridOffset + idx * stepSec;
    if (time < leadIn || time > input.duration - tailOut) continue;
    const prev = byIdx.get(idx);
    if (!prev) {
      byIdx.set(idx, { idx, time, strength: o.strength, band: o.band, sustain: o.sustain ?? 0 });
    } else {
      const w = prev.strength + o.strength || 1;
      prev.band = (prev.band * prev.strength + o.band * o.strength) / w;
      prev.strength = Math.max(prev.strength, o.strength);
      prev.sustain = Math.max(prev.sustain, o.sustain ?? 0);
    }
  }
  return [...byIdx.values()].sort((a, b) => a.idx - b.idx);
}

function metricWeight(idx: number): number {
  const pos = ((idx % 16) + 16) % 16;
  if (pos === 0) return 1.0;
  if (pos % 8 === 0) return 0.92;
  if (pos % 4 === 0) return 0.82;
  if (pos % 2 === 0) return 0.62;
  return 0.45;
}

/** Choose which slots become notes for one difficulty. */
function selectSlots(slots: Slot[], spec: DifficultySpec, playSeconds: number, rng: () => number): Slot[] {
  const target = Math.max(8, Math.round(spec.nps * playSeconds));

  // Seeded variation per phrase keeps identical-sounding bars from getting identical rhythms
  const phraseBias = new Map<number, number>();
  const bias = (idx: number) => {
    const p = Math.floor(idx / PHRASE_STEPS);
    if (!phraseBias.has(p)) phraseBias.set(p, 0.85 + rng() * 0.3);
    return phraseBias.get(p)!;
  };

  const ranked = slots
    .map((s) => ({ s, score: s.strength * (0.55 + 0.45 * metricWeight(s.idx)) * bias(s.idx) + rng() * 0.12 }))
    .sort((a, b) => b.score - a.score);

  const taken = new Set<number>();
  const runLength = (idx: number) => {
    // consecutive notes spaced exactly minGapSteps apart through idx
    let n = 1;
    for (let i = idx - spec.minGapSteps; taken.has(i); i -= spec.minGapSteps) n++;
    for (let i = idx + spec.minGapSteps; taken.has(i); i += spec.minGapSteps) n++;
    return n;
  };

  const chosen: Slot[] = [];
  for (const { s } of ranked) {
    if (chosen.length >= target) break;
    // Keep every note on the beat grid of its difficulty (beats / 8ths / 16ths)
    const pos = ((s.idx % 4) + 4) % 4;
    if (pos % spec.grid !== 0) continue;
    if (pos % 2 === 1 && s.strength < spec.offbeat16Strength) continue;
    let blocked = false;
    for (let d = 1; d < spec.minGapSteps; d++) {
      if (taken.has(s.idx - d) || taken.has(s.idx + d)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;
    taken.add(s.idx);
    if (runLength(s.idx) > spec.maxRun) {
      taken.delete(s.idx);
      continue;
    }
    chosen.push(s);
  }
  return chosen.sort((a, b) => a.idx - b.idx);
}

/** Lanes follow the onset's pitch/brightness, varied per phrase, with no fast jacks. */
function assignLanes(slots: Slot[], rng: () => number): number[] {
  const lanes: number[] = new Array(slots.length);
  const seenPhrases = new Set<string>();
  let prevLane = -1;
  let prevIdx = -999;

  let i = 0;
  while (i < slots.length) {
    const phrase = Math.floor(slots[i].idx / PHRASE_STEPS);
    let j = i;
    while (j < slots.length && Math.floor(slots[j].idx / PHRASE_STEPS) === phrase) j++;

    const shift = [-1, 0, 0, 1][Math.floor(rng() * 4)];
    const mirror = rng() < 0.35;

    const assign = (transform: (l: number) => number) => {
      let pl = prevLane;
      let pi = prevIdx;
      const out: number[] = [];
      for (let k = i; k < j; k++) {
        const s = slots[k];
        let target = s.band * 3 + shift;
        if (mirror) target = 3 - target;
        target = Math.min(3, Math.max(0, target));
        const gap = s.idx - pi;
        const weights = [0, 1, 2, 3].map((l) => {
          let w = Math.exp(-1.3 * Math.abs(l - target));
          if (l === pl && gap < 4) w *= 0.03; // no fast jacks
          else if (l === pl) w *= 0.4;
          return w;
        });
        let lane = transform(pickWeighted(weights, rng));
        if (lane === pl && gap < 4) lane = (lane + 1 + Math.floor(rng() * 3)) % 4;
        out.push(lane);
        pl = lane;
        pi = s.idx;
      }
      return out;
    };

    let phraseLanes = assign((l) => l);
    const key = (ls: number[]) => ls.join('');
    if (phraseLanes.length >= 4 && seenPhrases.has(key(phraseLanes))) {
      phraseLanes = assign((l) => 3 - l);
      if (seenPhrases.has(key(phraseLanes))) phraseLanes = assign((l) => (l + 1) % 4);
    }
    seenPhrases.add(key(phraseLanes));

    for (let k = i; k < j; k++) lanes[k] = phraseLanes[k - i];
    prevLane = lanes[j - 1];
    prevIdx = slots[j - 1].idx;
    i = j;
  }

  // Break up accidental jacks introduced at phrase boundaries or by transforms
  for (let k = 1; k < slots.length; k++) {
    if (lanes[k] === lanes[k - 1] && slots[k].idx - slots[k - 1].idx < 4) {
      const next = lanes[k + 1];
      lanes[k] = [0, 1, 2, 3].find((l) => l !== lanes[k - 1] && l !== next) ?? (lanes[k] + 2) % 4;
    }
  }
  return lanes;
}

function buildOne(input: ChartInput, difficulty: DifficultyLevel, slots: Slot[], stepSec: number): Beatmap {
  const spec = SPECS[difficulty];
  const rng = makeRng(`${input.seed}:${difficulty}`);
  const leadIn = input.leadIn ?? 2.0;
  const playSeconds = Math.max(1, input.duration - leadIn - (input.tailOut ?? 1.5));

  const chosen = selectSlots(slots, spec, playSeconds, rng);
  const lanes = assignLanes(chosen, rng);
  const beatSec = stepSec * 4;

  // Chords on the strongest downbeats. When the music offers few onsets (slow songs),
  // the hardest charts lean on chords instead so they stay harder than the one below.
  const target = spec.nps * playSeconds;
  const chordRate = Math.min(0.45, spec.chordRate * (chosen.length < target * 0.7 ? 2.2 : 1));
  const chordCut = [...chosen].map((s) => s.strength).sort((a, b) => b - a)[Math.floor(chosen.length * chordRate)];

  const notes: Note[] = [];
  const holdEnd = [0, 0, 0, 0]; // lane is busy until this time
  let id = 0;
  const push = (lane: number, time: number, duration?: number) => {
    notes.push({
      id: `n_${difficulty}_${id++}`,
      lane,
      time: Number(time.toFixed(3)),
      duration: duration ? Number(duration.toFixed(3)) : undefined,
    });
    holdEnd[lane] = time + (duration ?? 0);
  };

  for (let k = 0; k < chosen.length; k++) {
    const s = chosen[k];
    const lane = lanes[k];
    const next = chosen[k + 1];
    const gapToNext = next ? next.time - s.time : Infinity;
    const nextSameLane = chosen.findIndex((c, m) => m > k && lanes[m] === lane);
    const gapSameLane = nextSameLane === -1 ? Infinity : chosen[nextSameLane].time - s.time;

    // Hold notes: on sustained sounds (chords, pads, long leads); otherwise on strong hits
    // that have room — the whole gap on easier charts, the same lane on harder ones.
    let holdDur: number | undefined;
    const room = Math.min(
      spec.maxHoldBeats * beatSec,
      (spec.holdsBlockOthers ? gapToNext : gapSameLane) - stepSec * 2
    );
    const sustained = s.sustain >= beatSec;
    const holdChance = sustained ? spec.holdRate : s.strength > 0.7 ? spec.holdRate * 0.6 : 0;
    if (room >= beatSec && rng() < holdChance) {
      const want = sustained ? s.sustain : beatSec * (1 + Math.floor(rng() * 2));
      const dur = Math.floor(Math.min(want, room) / stepSec) * stepSec;
      if (dur >= beatSec) holdDur = dur;
    }
    push(lane, s.time, holdDur);

    const isDownbeat = s.idx % 4 === 0;
    if (chordRate > 0 && chordCut !== undefined && isDownbeat && s.strength >= chordCut && !holdDur) {
      // Second note: far from the first, not a jack with its neighbours, not inside a hold
      const near = (m: number) => (m >= 0 && m < chosen.length && Math.abs(chosen[m].idx - s.idx) < 4 ? lanes[m] : -1);
      const options = [0, 1, 2, 3].filter(
        (l) => Math.abs(l - lane) >= 2 && l !== near(k - 1) && l !== near(k + 1) && holdEnd[l] <= s.time
      );
      if (options.length) push(options[Math.floor(rng() * options.length)], s.time);
    }
  }

  notes.sort((a, b) => a.time - b.time || a.lane - b.lane);
  const tapCount = notes.length;
  const nps = tapCount / playSeconds;
  const level = Math.min(15, Math.max(1, Math.round(1 + nps * 1.45)));

  return { difficulty, level, notes, noteCount: notes.length };
}

export function buildBeatmaps(input: ChartInput): Record<DifficultyLevel, Beatmap> {
  const stepSec = 60 / input.bpm / 4;
  const slots = toSlots(input, stepSec);
  const out = {} as Record<DifficultyLevel, Beatmap>;
  for (const d of DIFFICULTIES) out[d] = buildOne(input, d, slots, stepSec);
  return out;
}

/** Map a frequency in Hz to the 0..1 band used for lane placement. */
export function freqToBand(freq: number): number {
  const lo = Math.log2(180);
  const hi = Math.log2(1100);
  return Math.min(1, Math.max(0, (Math.log2(freq) - lo) / (hi - lo)));
}
