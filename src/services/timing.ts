import type { TimingStats } from '../types/game';

export const HISTOGRAM_MIN_MS = -140;
export const HISTOGRAM_BIN_MS = 10;
export const HISTOGRAM_BINS = 28; // -140 .. +140 ms

// Judgment windows in ms (see handleLanePress in App.tsx)
export const WINDOWS_MS = { PERFECT: 45, GREAT: 85, GOOD: 135 } as const;

/** Summarizes signed hit offsets (ms, negative = early). */
export function computeTimingStats(offsets: number[], audioOffsetMs: number): TimingStats {
  const hits = offsets.length;
  const histogram = new Array<number>(HISTOGRAM_BINS).fill(0);
  if (!hits) return { hits: 0, meanMs: 0, stdMs: 0, histogram, audioOffsetMs };

  const mean = offsets.reduce((a, b) => a + b, 0) / hits;
  const variance = offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / hits;
  for (const o of offsets) {
    const bin = Math.floor((o - HISTOGRAM_MIN_MS) / HISTOGRAM_BIN_MS);
    histogram[Math.min(HISTOGRAM_BINS - 1, Math.max(0, bin))]++;
  }
  return {
    hits,
    meanMs: Math.round(mean * 10) / 10,
    stdMs: Math.round(Math.sqrt(variance) * 10) / 10,
    histogram,
    audioOffsetMs,
  };
}

/**
 * Offset setting that would center this player's hits on the notes, or null when the play
 * is too short or already centered. Hitting late (positive mean) means the notes should
 * arrive later, which is a larger audioOffsetMs.
 */
export function suggestedOffset(t: TimingStats | undefined): number | null {
  if (!t || t.hits < 20 || Math.abs(t.meanMs) < 5) return null;
  return Math.max(-200, Math.min(200, Math.round(t.audioOffsetMs + t.meanMs)));
}
