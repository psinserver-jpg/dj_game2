import { SongMetadata } from '../types/game';
import { buildBeatmaps, freqToBand, type Onset } from './chartBuilder';
import { getPatternEvents, type SynthPatternId } from './patterns';
import { cover, stage } from './assets';

// Charts for the built-in synth songs are generated from the same arrangement data the
// sound engine plays (data/patterns.ts), so notes sit on real kicks, snares, melody and chords.
function onsetsFromPattern(patternId: SynthPatternId, bpm: number, duration: number): Onset[] {
  const stepSec = 60 / bpm / 4;
  const onsets: Onset[] = [];

  for (let step = 0; step * stepSec < duration; step++) {
    const events = getPatternEvents(patternId, step);
    if (events.length === 0) continue;

    let strength = 0;
    let extra = 0;
    let drumBand = 0.5;
    let pitchBand: number | null = null;
    let sustainSteps = 0;
    const add = (v: number) => {
      extra += Math.min(v, strength);
      strength = Math.max(strength, v);
    };

    for (const ev of events) {
      switch (ev.inst) {
        case 'kick':
          add(0.95 * ev.accent);
          drumBand = 0.2;
          break;
        case 'snare':
          add(0.9 * ev.accent);
          drumBand = 0.6;
          break;
        case 'hat':
          add(ev.open ? 0.22 : 0.12);
          if (drumBand === 0.5) drumBand = 0.85;
          break;
        case 'bass':
          add(0.3);
          if (ev.steps >= 2) sustainSteps = Math.max(sustainSteps, ev.steps);
          break;
        case 'lead':
          // A lead on every 16th (chiptune) would drown everything else out
          add(ev.steps >= 1 ? 0.62 : 0.45);
          pitchBand = freqToBand(ev.freq);
          if (ev.steps >= 2) sustainSteps = Math.max(sustainSteps, ev.steps);
          break;
        case 'chord':
          add(0.75);
          pitchBand ??= freqToBand(ev.freqs.reduce((a, b) => a + b, 0) / ev.freqs.length);
          sustainSteps = Math.max(sustainSteps, ev.steps);
          break;
      }
    }

    onsets.push({
      time: step * stepSec,
      strength: Math.min(1.2, strength + extra * 0.15),
      band: pitchBand === null ? drumBand : pitchBand * 0.7 + drumBand * 0.3,
      sustain: sustainSteps * stepSec,
    });
  }
  return onsets;
}

function synthCharts(patternId: SynthPatternId, bpm: number, duration: number) {
  return buildBeatmaps({
    onsets: onsetsFromPattern(patternId, bpm, duration),
    bpm,
    duration,
    seed: patternId,
    leadIn: 2.5,
    tailOut: 2.5,
  });
}

export const INITIAL_SONGS: SongMetadata[] = [
  {
    id: 'neon-velocity',
    title: 'Neon Velocity',
    artist: 'CYBER-STORM',
    bpm: 140,
    genre: 'Cyberpunk Drum & Bass',
    duration: 68,
    coverUrl: cover('neon-velocity'),
    stageUrl: stage('neon-velocity'),
    previewStart: 12,
    previewDuration: 10,
    musicPatternId: 'neon_velocity',
    difficulties: synthCharts('neon_velocity', 140, 68),
  },
  {
    id: 'midnight-tokyo',
    title: 'Midnight Tokyo',
    artist: 'Shibuya Neon Club',
    bpm: 115,
    genre: 'Synthwave / City Pop',
    duration: 72,
    coverUrl: cover('midnight-tokyo'),
    stageUrl: stage('midnight-tokyo'),
    previewStart: 16,
    previewDuration: 10,
    musicPatternId: 'midnight_tokyo',
    difficulties: synthCharts('midnight_tokyo', 115, 72),
  },
  {
    id: 'solar-overdrive',
    title: 'Solar Overdrive',
    artist: 'PULSECORE',
    bpm: 160,
    genre: 'Arcade Speedcore',
    duration: 64,
    coverUrl: cover('solar-overdrive'),
    stageUrl: stage('solar-overdrive'),
    previewStart: 15,
    previewDuration: 10,
    musicPatternId: 'solar_overdrive',
    difficulties: synthCharts('solar_overdrive', 160, 64),
  },
  {
    id: 'starlight-lullaby',
    title: 'Starlight Lullaby',
    artist: 'Aura Chill',
    bpm: 95,
    genre: 'Melodic Lo-Fi Future',
    duration: 70,
    coverUrl: cover('starlight-lullaby'),
    stageUrl: stage('starlight-lullaby'),
    previewStart: 14,
    previewDuration: 10,
    musicPatternId: 'starlight_lullaby',
    difficulties: synthCharts('starlight_lullaby', 95, 70),
  },
];
