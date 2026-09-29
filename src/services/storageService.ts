import { GameScore, GameSettings, SongMetadata } from '../types/game';
import { IMAGES } from '../data/assets';
import { userService } from './userService';

export interface LeaderboardEntry {
  rank: number;
  userKey: string;
  name: string;
  score: GameScore;
}

export interface OverallRankingEntry {
  rank: number;
  userKey: string;
  name: string;
  totalScore: number;
  chartsPlayed: number;
  sRankCount: number;
  fullComboCount: number;
  playCount: number;
}

const SETTINGS_KEY = 'pulsebeat_settings_v1';
const LEGACY_SCORES_KEY = 'pulsebeat_scores_v1'; // single-player scores from before accounts
const SCORES_KEY = 'pulsebeat_scores_v2'; // { [userKey]: { [songId_difficulty]: GameScore } }
const GUEST_KEY = '__guest__';
const CUSTOM_SONGS_KEY = 'pulsebeat_custom_songs_v1';

type ScoreBook = Record<string, Record<string, GameScore>>;

const chartKey = (songId: string, difficulty: string) => `${songId}_${difficulty}`;
const currentUserKey = () => userService.getCurrentUser()?.key ?? GUEST_KEY;

function readAllScores(): ScoreBook {
  try {
    const data = localStorage.getItem(SCORES_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Ignore
  }
  return {};
}

export const DEFAULT_SETTINGS: GameSettings = {
  keyBindings: ['d', 'f', 'j', 'k'],
  scrollSpeed: 2.5,
  audioOffsetMs: 0,
  musicVolume: 0.75,
  sfxVolume: 0.85,
  backgroundDim: 0.35,
  perspectiveMode: '3D',
  noteSkin: 'neon',
  showFastSlow: true,
  hitsoundEnabled: true,
};

export const storageService = {
  getSettings(): GameSettings {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SETTINGS;
  },

  saveSettings(settings: GameSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  },

  /** Best score of the logged-in player (or the given player) for one chart */
  getScore(songId: string, difficulty: string, userKey = currentUserKey()): GameScore | null {
    return readAllScores()[userKey]?.[chartKey(songId, difficulty)] ?? null;
  },

  /** Saves the play under the logged-in player; returns true when it beats their best */
  saveScore(songId: string, difficulty: string, newScore: GameScore): boolean {
    try {
      const all = readAllScores();
      const userKey = currentUserKey();
      const scores = (all[userKey] ??= {});
      const key = chartKey(songId, difficulty);
      const existing = scores[key];

      let isNewRecord = false;
      if (!existing || newScore.score > existing.score) {
        scores[key] = newScore;
        isNewRecord = true;
      } else if (newScore.maxCombo > existing.maxCombo) {
        // Keep highest max combo even when the score did not improve
        existing.maxCombo = newScore.maxCombo;
      }

      localStorage.setItem(SCORES_KEY, JSON.stringify(all));
      return isNewRecord;
    } catch {
      return false;
    }
  },

  /** Every registered player's best on one chart, highest first */
  getLeaderboard(songId: string, difficulty: string): LeaderboardEntry[] {
    const all = readAllScores();
    const users = userService.getUsers();
    const key = chartKey(songId, difficulty);
    return Object.entries(all)
      .filter(([userKey]) => users[userKey])
      .flatMap(([userKey, scores]) =>
        scores[key] ? [{ userKey, name: users[userKey].name, score: scores[key] }] : []
      )
      .sort((a, b) => b.score.score - a.score.score || a.score.timestamp - b.score.timestamp)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  },

  /** Players ranked by the sum of their best scores over all charts */
  getOverallRanking(): OverallRankingEntry[] {
    const all = readAllScores();
    return Object.values(userService.getUsers())
      .map((user) => {
        const bests = Object.values(all[user.key] ?? {});
        return {
          userKey: user.key,
          name: user.name,
          totalScore: bests.reduce((sum, s) => sum + s.score, 0),
          chartsPlayed: bests.length,
          sRankCount: bests.filter((s) => ['SSS', 'SS', 'S'].includes(s.grade)).length,
          fullComboCount: bests.filter((s) => s.isFullCombo).length,
          playCount: user.playCount,
        };
      })
      .filter((entry) => entry.chartsPlayed > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));
  },

  /**
   * Scores saved before accounts existed (v1) belong to whoever played on this device,
   * so they move to the first account created here.
   */
  adoptLegacyScores(userKey: string) {
    try {
      const legacy = localStorage.getItem(LEGACY_SCORES_KEY);
      if (!legacy) return;
      const all = readAllScores();
      all[userKey] = { ...JSON.parse(legacy), ...(all[userKey] ?? {}) };
      localStorage.setItem(SCORES_KEY, JSON.stringify(all));
      localStorage.removeItem(LEGACY_SCORES_KEY);
    } catch {
      // Ignore
    }
  },

  getCustomSongs(): SongMetadata[] {
    try {
      const data = localStorage.getItem(CUSTOM_SONGS_KEY);
      if (data) {
        // Older saves point at /src/assets/..., which does not exist in production builds.
        return (JSON.parse(data) as SongMetadata[]).map((song) =>
          song.coverUrl?.startsWith('/src/') ? { ...song, coverUrl: IMAGES.customCover } : song
        );
      }
    } catch {
      // Ignore
    }
    return [];
  },

  saveCustomSong(song: SongMetadata) {
    try {
      const current = this.getCustomSongs();
      const filtered = current.filter(s => s.id !== song.id);
      filtered.unshift(song);
      localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(filtered));
    } catch {
      // Ignore
    }
  },

  deleteCustomSong(id: string) {
    try {
      const current = this.getCustomSongs();
      const filtered = current.filter(s => s.id !== id);
      localStorage.setItem(CUSTOM_SONGS_KEY, JSON.stringify(filtered));
    } catch {
      // Ignore
    }
  }
};
