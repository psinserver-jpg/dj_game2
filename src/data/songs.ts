import { SongMetadata, Beatmap, Note, DifficultyLevel } from '../types/game';

// Helper to generate musically synchronized rhythm charts
function generateBeatmap(
  bpm: number,
  totalDuration: number,
  difficulty: DifficultyLevel,
  patternStyle: 'dnb' | 'synthwave' | 'chiptune' | 'lofi'
): Beatmap {
  const notes: Note[] = [];
  const beatSec = 60 / bpm;
  const startSec = 2.5; // Lead-in time for player readiness
  const endSec = totalDuration - 2.5;

  let noteId = 0;
  const addNote = (lane: number, time: number, duration?: number) => {
    notes.push({
      id: `n_${difficulty}_${noteId++}`,
      lane: Math.min(3, Math.max(0, Math.floor(lane))),
      time: Number(time.toFixed(3)),
      duration: duration ? Number(duration.toFixed(3)) : undefined,
    });
  };

  const difficultyLevels: Record<DifficultyLevel, number> = {
    EASY: patternStyle === 'lofi' ? 2 : patternStyle === 'synthwave' ? 3 : 4,
    NORMAL: patternStyle === 'lofi' ? 5 : patternStyle === 'synthwave' ? 6 : 7,
    HARD: patternStyle === 'lofi' ? 8 : patternStyle === 'synthwave' ? 9 : 10,
    EXPERT: patternStyle === 'lofi' ? 10 : patternStyle === 'synthwave' ? 12 : 14,
  };

  // Generate pattern loop
  let currentSec = startSec;
  let beatIndex = 0;

  while (currentSec < endSec) {
    const bar = Math.floor(beatIndex / 4);
    const beatInBar = beatIndex % 4;

    if (difficulty === 'EASY') {
      // Main beats only (quarter notes or half notes)
      if (beatInBar === 0 || beatInBar === 2) {
        const lane = (bar * 2 + beatInBar / 2) % 4;
        // Occasional hold on bar start
        if (bar % 4 === 3 && beatInBar === 0) {
          addNote(lane, currentSec, beatSec * 1.5);
        } else {
          addNote(lane, currentSec);
        }
      }
    } else if (difficulty === 'NORMAL') {
      // 8th note rhythms and syncopations
      const lane = (beatIndex * 3) % 4;
      addNote(lane, currentSec);

      // Offbeat note on select beats
      if (beatInBar === 1 || beatInBar === 3) {
        const offLane = (lane + 2) % 4;
        addNote(offLane, currentSec + beatSec * 0.5);
      }

      // Occasional hold notes
      if (beatInBar === 2 && bar % 2 === 1) {
        addNote((lane + 1) % 4, currentSec + beatSec * 0.5, beatSec * 1.2);
      }
    } else if (difficulty === 'HARD') {
      // 8th notes + 16th stream bursts + simultaneous chords
      const baseLane = beatIndex % 4;

      if (beatInBar === 0) {
        // Double tap on downbeat!
        addNote(0, currentSec);
        addNote(3, currentSec);
      } else {
        addNote(baseLane, currentSec);
      }

      // Syncopated 8th note
      addNote((baseLane + 1) % 4, currentSec + beatSec * 0.5);

      // 16th note rolls on climax sections (every 2nd bar)
      if (bar % 2 === 1 && (beatInBar === 2 || beatInBar === 3)) {
        addNote((baseLane + 2) % 4, currentSec + beatSec * 0.25);
        addNote((baseLane + 3) % 4, currentSec + beatSec * 0.75);
      }

      // Sustained hold note with crossover tap
      if (bar % 4 === 2 && beatInBar === 1) {
        addNote(1, currentSec, beatSec * 1.8);
      }
    } else if (difficulty === 'EXPERT') {
      // High density streams, multi-finger chords, fast polyrhythmic stairs
      const stepLane = (beatIndex * 2) % 4;

      // Double notes on beat 0 and 2
      if (beatInBar === 0) {
        addNote(0, currentSec);
        addNote(2, currentSec);
      } else if (beatInBar === 2) {
        addNote(1, currentSec);
        addNote(3, currentSec);
      } else {
        addNote(stepLane, currentSec);
      }

      // Fast 16th streams
      const stairLanes = [0, 1, 2, 3, 2, 1];
      const s1 = stairLanes[(beatIndex * 4) % stairLanes.length];
      const s2 = stairLanes[(beatIndex * 4 + 1) % stairLanes.length];
      const s3 = stairLanes[(beatIndex * 4 + 2) % stairLanes.length];

      addNote(s1, currentSec + beatSec * 0.25);
      addNote(s2, currentSec + beatSec * 0.5);
      addNote(s3, currentSec + beatSec * 0.75);

      // Long hold note along with stream
      if (bar % 3 === 0 && beatInBar === 3) {
        addNote((stepLane + 1) % 4, currentSec, beatSec * 1.6);
      }
    }

    currentSec += beatSec;
    beatIndex++;
  }

  // Sort notes by time ascending
  notes.sort((a, b) => a.time - b.time);

  return {
    difficulty,
    level: difficultyLevels[difficulty],
    notes,
    noteCount: notes.length,
  };
}

export const INITIAL_SONGS: SongMetadata[] = [
  {
    id: 'neon-velocity',
    title: 'Neon Velocity',
    artist: 'CYBER-STORM',
    bpm: 140,
    genre: 'Cyberpunk Drum & Bass',
    duration: 68,
    coverUrl: '/src/assets/images/album_neon_velocity_1790586535950.jpg',
    previewStart: 12,
    previewDuration: 10,
    musicPatternId: 'neon_velocity',
    difficulties: {
      EASY: generateBeatmap(140, 68, 'EASY', 'dnb'),
      NORMAL: generateBeatmap(140, 68, 'NORMAL', 'dnb'),
      HARD: generateBeatmap(140, 68, 'HARD', 'dnb'),
      EXPERT: generateBeatmap(140, 68, 'EXPERT', 'dnb'),
    },
  },
  {
    id: 'midnight-tokyo',
    title: 'Midnight Tokyo',
    artist: 'Shibuya Neon Club',
    bpm: 115,
    genre: 'Synthwave / City Pop',
    duration: 72,
    coverUrl: '/src/assets/images/album_midnight_tokyo_1790586550695.jpg',
    previewStart: 16,
    previewDuration: 10,
    musicPatternId: 'midnight_tokyo',
    difficulties: {
      EASY: generateBeatmap(115, 72, 'EASY', 'synthwave'),
      NORMAL: generateBeatmap(115, 72, 'NORMAL', 'synthwave'),
      HARD: generateBeatmap(115, 72, 'HARD', 'synthwave'),
      EXPERT: generateBeatmap(115, 72, 'EXPERT', 'synthwave'),
    },
  },
  {
    id: 'solar-overdrive',
    title: 'Solar Overdrive',
    artist: 'PULSECORE',
    bpm: 160,
    genre: 'Arcade Speedcore',
    duration: 64,
    coverUrl: '/src/assets/images/album_solar_overdrive_1790586564734.jpg',
    previewStart: 15,
    previewDuration: 10,
    musicPatternId: 'solar_overdrive',
    difficulties: {
      EASY: generateBeatmap(160, 64, 'EASY', 'chiptune'),
      NORMAL: generateBeatmap(160, 64, 'NORMAL', 'chiptune'),
      HARD: generateBeatmap(160, 64, 'HARD', 'chiptune'),
      EXPERT: generateBeatmap(160, 64, 'EXPERT', 'chiptune'),
    },
  },
  {
    id: 'starlight-lullaby',
    title: 'Starlight Lullaby',
    artist: 'Aura Chill',
    bpm: 95,
    genre: 'Melodic Lo-Fi Future',
    duration: 70,
    coverUrl: '/src/assets/images/album_starlight_lullaby_1790586576394.jpg',
    previewStart: 14,
    previewDuration: 10,
    musicPatternId: 'starlight_lullaby',
    difficulties: {
      EASY: generateBeatmap(95, 70, 'EASY', 'lofi'),
      NORMAL: generateBeatmap(95, 70, 'NORMAL', 'lofi'),
      HARD: generateBeatmap(95, 70, 'HARD', 'lofi'),
      EXPERT: generateBeatmap(95, 70, 'EXPERT', 'lofi'),
    },
  },
];
