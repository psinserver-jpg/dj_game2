/**
 * Rhythm Game Data Types & Definitions
 */

export type DifficultyLevel = 'EASY' | 'NORMAL' | 'HARD' | 'EXPERT';

export type JudgmentType = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface Note {
  id: string;
  lane: number; // 0, 1, 2, 3
  time: number; // in seconds from song start
  duration?: number; // > 0 for hold notes
  hit?: boolean;
  holding?: boolean;
  holdProgress?: number; // 0 to 1
  judged?: boolean;
  judgment?: JudgmentType;
}

export interface Beatmap {
  difficulty: DifficultyLevel;
  level: number; // e.g. 3, 6, 9, 12
  notes: Note[];
  noteCount: number;
}

// Built-in synth arrangements, 'custom' (user upload/recording) or 'audio' (generated track at audioUrl)
export type MusicPatternId =
  | 'neon_velocity'
  | 'midnight_tokyo'
  | 'solar_overdrive'
  | 'starlight_lullaby'
  | 'custom'
  | 'audio';

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  genre: string;
  duration: number; // in seconds
  coverUrl: string;
  stageUrl?: string; // in-game backdrop; derived from musicPatternId when omitted
  previewStart: number;
  previewDuration: number;
  difficulties: Record<DifficultyLevel, Beatmap>;
  musicPatternId: MusicPatternId;
  audioUrl?: string; // generated track (musicPatternId 'audio'), see public/music/manifest.json
  vocal?: 'ja' | 'none';
  lyrics?: string;
}

/** A judged hit: signed offset in ms (negative = early, positive = late). */
export interface HitSample {
  offsetMs: number;
  judgment: JudgmentType;
  at: number; // performance.now() when judged
}

export interface TimingStats {
  hits: number;
  meanMs: number; // average offset: negative = hitting early, positive = late
  stdMs: number; // spread (consistency); lower is steadier
  histogram: number[]; // 10 ms bins from -140 to +140 ms
  audioOffsetMs: number; // the offset setting used in this play
}

export interface GameScore {
  score: number; // 0 ~ 1,000,000
  accuracy: number; // 0.0 ~ 100.0%
  maxCombo: number;
  counts: {
    perfect: number;
    great: number;
    good: number;
    miss: number;
  };
  timingDistribution: {
    fast: number;
    slow: number;
  };
  timing?: TimingStats; // per-hit timing analysis (older saved scores don't have it)
  grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  isFullCombo: boolean;
  isAllPerfect: boolean;
  timestamp: number;
}

export interface GameSettings {
  keyBindings: [string, string, string, string]; // e.g. ['d', 'f', 'j', 'k']
  scrollSpeed: number; // 1.0 to 4.0 (multiplier)
  audioOffsetMs: number; // latency compensation (-200 to +200 ms)
  musicVolume: number; // 0 to 1
  sfxVolume: number; // 0 to 1
  backgroundDim: number; // 0.2 to 0.9
  perspectiveMode: '3D' | '2D';
  noteSkin: 'neon' | 'cyber' | 'minimal';
  showFastSlow: boolean;
  hitsoundEnabled: boolean;
}

export type GameView = 'TITLE' | 'SONG_SELECT' | 'PLAYING' | 'RESULT' | 'SETTINGS' | 'BEATMAP_EDITOR';
