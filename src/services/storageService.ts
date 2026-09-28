import { GameScore, GameSettings, SongMetadata } from '../types/game';
import { IMAGES } from '../data/assets';

const SETTINGS_KEY = 'pulsebeat_settings_v1';
const SCORES_KEY = 'pulsebeat_scores_v1';
const CUSTOM_SONGS_KEY = 'pulsebeat_custom_songs_v1';

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

  getScore(songId: string, difficulty: string): GameScore | null {
    try {
      const data = localStorage.getItem(SCORES_KEY);
      if (data) {
        const scores = JSON.parse(data);
        return scores[`${songId}_${difficulty}`] || null;
      }
    } catch {
      // Ignore
    }
    return null;
  },

  saveScore(songId: string, difficulty: string, newScore: GameScore): boolean {
    try {
      const data = localStorage.getItem(SCORES_KEY);
      const scores = data ? JSON.parse(data) : {};
      const key = `${songId}_${difficulty}`;
      const existing = scores[key] as GameScore | undefined;

      let isNewRecord = false;
      if (!existing || newScore.score > existing.score) {
        scores[key] = newScore;
        isNewRecord = true;
      } else {
        // Keep highest max combo or accuracy if tied
        if (newScore.maxCombo > existing.maxCombo) {
          existing.maxCombo = newScore.maxCombo;
        }
      }

      localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
      return isNewRecord;
    } catch {
      return false;
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
