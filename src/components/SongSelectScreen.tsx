import React, { useState, useEffect, useRef } from 'react';
import { SongMetadata, DifficultyLevel, GameSettings } from '../types/game';
import { soundEngine } from '../services/soundEngine';
import { storageService } from '../services/storageService';
import { getStageUrl, handleCoverError } from '../data/assets';
import { StageBackdrop } from './StageBackdrop';
import { RankIcon } from './RankingModal';
import { Play, Volume2, VolumeX, FastForward, Award, Plus, Trash2, Loader2, Trophy, ChevronRight } from 'lucide-react';

interface SongSelectScreenProps {
  songs: SongMetadata[];
  selectedSong: SongMetadata;
  selectedDifficulty: DifficultyLevel;
  settings: GameSettings;
  onSelectSong: (song: SongMetadata) => void;
  onSelectDifficulty: (diff: DifficultyLevel) => void;
  onChangeSpeed: (speed: number) => void;
  onStartGame: () => void;
  onOpenEditor: () => void;
  onDeleteCustomSong?: (id: string) => void;
  onOpenRanking: () => void;
  currentUserKey: string | null;
  keyboardEnabled?: boolean; // false while a modal is open
  isLoading?: boolean; // the selected song's audio is still being fetched/decoded
}

// Where the music comes from: generated vocal / instrumental track, user upload, or built-in synth
const SOURCE_BADGES = {
  vocal: { label: '보컬 · 일본어', className: 'text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10' },
  inst: { label: '연주곡', className: 'text-sky-300 border-sky-500/40 bg-sky-500/10' },
  custom: { label: '커스텀', className: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
  synth: { label: '신스', className: 'text-slate-300 border-slate-600/60 bg-slate-800/60' },
} as const;

// User-made songs: uploads ('custom') and recordings over a stock synth pattern (id custom_*)
const isCustomSong = (song: SongMetadata) => song.musicPatternId === 'custom' || song.id.startsWith('custom_');

function getSourceBadge(song: SongMetadata) {
  if (song.audioUrl) return song.vocal === 'ja' ? SOURCE_BADGES.vocal : SOURCE_BADGES.inst;
  if (isCustomSong(song)) return SOURCE_BADGES.custom;
  return SOURCE_BADGES.synth;
}

const SourceBadge: React.FC<{ song: SongMetadata }> = ({ song }) => {
  const badge = getSourceBadge(song);
  return (
    <span
      className={`inline-flex items-center shrink-0 px-1.5 rounded border text-[10px] leading-4 font-semibold whitespace-nowrap ${badge.className}`}
    >
      {badge.label}
    </span>
  );
};

/** 125.4 -> "2:05" */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Detected tempos carry decimals (e.g. 127.98); show them as whole BPM
const formatBpm = (bpm: number) => Math.round(bpm);

const AUDIO_PREVIEW_DELAY_MS = 200;

/**
 * Start the right preview for a song; generated tracks may still be loading.
 * onStopped runs when the preview ends by itself or cannot play (not when it is stopped).
 */
function startPreview(song: SongMetadata, onStopped: () => void): boolean {
  if (song.audioUrl) {
    soundEngine
      .playAudioPreview(song.audioUrl, song.previewStart, song.previewDuration, onStopped)
      .then(
        (result) => {
          if (result === 'failed') onStopped();
        },
        () => onStopped()
      );
    return true;
  }
  if (song.musicPatternId !== 'custom' && song.musicPatternId !== 'audio') {
    soundEngine.playPreview(song.musicPatternId, song.bpm, song.previewStart, song.previewDuration, onStopped);
    return true;
  }
  soundEngine.stopPreview();
  return false;
}

const DIFFICULTY_CONFIG: Record<
  DifficultyLevel,
  { label: string; color: string; border: string; bg: string; text: string }
> = {
  EASY: {
    label: 'EASY',
    color: '#06B6D4',
    border: 'border-cyan-500/50',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
  },
  NORMAL: {
    label: 'NORMAL',
    color: '#10B981',
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
  },
  HARD: {
    label: 'HARD',
    color: '#F59E0B',
    border: 'border-amber-500/50',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
  },
  EXPERT: {
    label: 'EXPERT',
    color: '#F43F5E',
    border: 'border-rose-500/50',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
  },
};

export const SongSelectScreen: React.FC<SongSelectScreenProps> = ({
  songs,
  selectedSong,
  selectedDifficulty,
  settings,
  onSelectSong,
  onSelectDifficulty,
  onChangeSpeed,
  onStartGame,
  onOpenEditor,
  onDeleteCustomSong,
  onOpenRanking,
  currentUserKey,
  keyboardEnabled = true,
  isLoading = false,
}) => {
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewDelayRef = useRef<number | null>(null);

  const stopPreview = () => {
    if (previewDelayRef.current !== null) {
      window.clearTimeout(previewDelayRef.current);
      previewDelayRef.current = null;
    }
    soundEngine.stopPreview();
  };

  // Play preview when selected song changes
  useEffect(() => {
    const onStopped = () => setIsPlayingPreview(false);
    if (!selectedSong.audioUrl) {
      setIsPlayingPreview(startPreview(selectedSong, onStopped));
    } else {
      // Generated tracks are fetched + decoded first, so wait until the player settles on a song
      soundEngine.stopPreview();
      setIsPlayingPreview(true);
      previewDelayRef.current = window.setTimeout(() => {
        previewDelayRef.current = null;
        startPreview(selectedSong, onStopped);
      }, AUDIO_PREVIEW_DELAY_MS);
    }

    return stopPreview;
  }, [selectedSong]);

  const togglePreview = () => {
    if (isPlayingPreview) {
      stopPreview();
      setIsPlayingPreview(false);
    } else if (startPreview(selectedSong, () => setIsPlayingPreview(false))) {
      setIsPlayingPreview(true);
    }
  };


  const currentBeatmap = selectedSong.difficulties[selectedDifficulty];
  const currentRecord = storageService.getScore(selectedSong.id, selectedDifficulty);
  const leaderboard = storageService.getLeaderboard(selectedSong.id, selectedDifficulty);
  const myRank = leaderboard.find((e) => e.userKey === currentUserKey)?.rank;

  const speedOptions = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
  const difficulties: DifficultyLevel[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];

  const handleStart = () => {
    if (isLoading) return;
    stopPreview();
    setIsPlayingPreview(false); // stays accurate if the start fails or is abandoned
    onStartGame();
  };

  // Keyboard: Enter/Space = start, ↑↓ = song, ←→ = difficulty
  // Selection tick when the song or difficulty changes (not when the screen first opens)
  const lastPickRef = useRef<string | null>(null);
  useEffect(() => {
    const pick = `${selectedSong.id}:${selectedDifficulty}`;
    if (lastPickRef.current !== null && lastPickRef.current !== pick) soundEngine.playSelectSound();
    lastPickRef.current = pick;
  }, [selectedSong.id, selectedDifficulty]);

  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const songIndex = songs.findIndex((s) => s.id === selectedSong.id);
      const diffIndex = difficulties.indexOf(selectedDifficulty);

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleStart();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (songIndex + (e.key === 'ArrowDown' ? 1 : -1) + songs.length) % songs.length;
        onSelectSong(songs[next]);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = Math.min(3, Math.max(0, diffIndex + (e.key === 'ArrowRight' ? 1 : -1)));
        onSelectDifficulty(difficulties[next]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Keep the highlighted song visible when changing it with the keyboard
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-song-id="${CSS.escape(selectedSong.id)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedSong.id]);

  const startButton = (
    <button
      onClick={handleStart}
      disabled={isLoading}
      aria-busy={isLoading}
      className={`btn-neon w-full py-3.5 font-extrabold text-base tracking-widest uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${
        isLoading ? 'opacity-70 cursor-wait' : 'transform hover:scale-[1.01] active:scale-[0.98] cursor-pointer'
      }`}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="normal-case tracking-normal">음원 불러오는 중...</span>
        </>
      ) : (
        <>
          <Play className="w-5 h-5 fill-current" />
          <span>게임 시작</span>
          <span className="hidden sm:inline text-xs font-bold opacity-70 tracking-wider">(ENTER)</span>
        </>
      )}
    </button>
  );

  return (
    <>
    <StageBackdrop imageUrl={getStageUrl(selectedSong)} />
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 md:pb-4 flex-1 md:min-h-0 flex flex-col">
      <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-[minmax(0,1fr)] gap-4 md:gap-6 md:flex-1 md:min-h-0">
        {/* Left: Song List Column */}
        <div className="md:col-span-7 flex flex-col min-h-0 gap-2 order-2 md:order-1">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              곡 선택 ({songs.length})
              <span className="hidden md:inline ml-2 normal-case tracking-normal font-normal text-slate-500">
                ↑↓ 곡 · ←→ 난이도 · Enter 시작
              </span>
            </h2>
            <button
              onClick={onOpenEditor}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>커스텀 곡 추가 / 에디터</span>
            </button>
          </div>

          <div ref={listRef} className="space-y-2 md:flex-1 md:min-h-0 md:overflow-y-auto pr-1">
            {songs.map((song) => {
              const isSelected = song.id === selectedSong.id;
              const savedRecord = storageService.getScore(song.id, selectedDifficulty);

              return (
                <div
                  key={song.id}
                  data-song-id={song.id}
                  onClick={() => onSelectSong(song)}
                  onDoubleClick={() => {
                    onSelectSong(song);
                    handleStart();
                  }}
                  className={`group relative p-2.5 rounded-lg border transition-all duration-150 cursor-pointer flex items-center justify-between gap-4 backdrop-blur-sm ${
                    isSelected
                      ? 'glass-panel neon-ring translate-x-1'
                      : 'bg-slate-900/45 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-600 hover:translate-x-0.5'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Album Thumbnail */}
                    <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded overflow-hidden shrink-0 bg-slate-800">
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        referrerPolicy="no-referrer"
                        onError={handleCoverError}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      {isSelected && isPlayingPreview && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-white truncate group-hover:text-cyan-400 transition-colors">
                          {song.title}
                        </span>
                        <SourceBadge song={song} />
                      </div>
                      <div className="text-xs text-slate-400 truncate">{song.artist}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 truncate">
                        <span className="truncate">{song.genre}</span>
                        <span>·</span>
                        <span className="font-mono shrink-0">{formatBpm(song.bpm)} BPM</span>
                        <span className="hidden sm:inline">·</span>
                        <span className="hidden sm:inline font-mono">{formatDuration(song.duration)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Record info */}
                  <div className="shrink-0 text-right flex items-center gap-3">
                    {savedRecord ? (
                      <div className="text-right">
                        <div className="text-xs font-bold text-cyan-400 font-mono">
                          {savedRecord.grade}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {savedRecord.score.toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-600 font-mono">NO RECORD</div>
                    )}

                    {isCustomSong(song) && onDeleteCustomSong && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`'${song.title}' 커스텀 곡을 삭제하시겠습니까?`)) {
                            onDeleteCustomSong(song.id);
                          }
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="곡 삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Song Stage Deck — the start button always stays on screen */}
        <div className="md:col-span-5 flex flex-col min-h-0 gap-3 glass-panel rounded-2xl p-3 sm:p-4 order-1 md:order-2">
          {/* Album Artwork: shrinks to whatever height is left */}
          <div className="relative w-full aspect-[16/9] sm:aspect-[21/9] max-h-[34dvh] md:max-h-none md:aspect-auto md:flex-1 md:min-h-[120px] rounded-lg overflow-hidden border border-slate-700/80 shadow-inner">
            <img
              src={selectedSong.coverUrl}
              alt={selectedSong.title}
              referrerPolicy="no-referrer"
              onError={handleCoverError}
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-extrabold text-white font-display truncate">
                    {selectedSong.title}
                  </h3>
                  <p className="text-xs text-slate-300 truncate">{selectedSong.artist}</p>
                </div>
                <button
                  onClick={togglePreview}
                  className="shrink-0 p-2.5 rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-cyan-400 hover:border-cyan-500 transition-all cursor-pointer"
                  title="미리듣기 재생/정지"
                >
                  {isPlayingPreview ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 font-mono min-w-0">
                <SourceBadge song={selectedSong} />
                <span className="truncate">{selectedSong.genre}</span>
                <span>·</span>
                <span className="shrink-0">{formatBpm(selectedSong.bpm)} BPM</span>
                <span>·</span>
                <span className="shrink-0">{formatDuration(selectedSong.duration)}</span>
              </div>
            </div>
          </div>

          {/* Difficulty Selector Tabs */}
          <div className="grid grid-cols-4 gap-2 shrink-0">
            {difficulties.map((diff) => {
              const config = DIFFICULTY_CONFIG[diff];
              const map = selectedSong.difficulties[diff];
              const isCurrent = selectedDifficulty === diff;

              return (
                <button
                  key={diff}
                  onClick={() => onSelectDifficulty(diff)}
                  className={`relative py-2 px-1 text-center rounded-lg border transition-all cursor-pointer overflow-hidden ${
                    isCurrent
                      ? `${config.bg} ${config.border} ring-1 ring-white/25`
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                  style={isCurrent ? { boxShadow: `0 0 22px -8px ${config.color}` } : undefined}
                >
                  {isCurrent && <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: config.color }} />}
                  <div className={`text-[10px] sm:text-[11px] font-bold tracking-wider ${isCurrent ? config.text : 'text-slate-400'}`}>
                    {config.label}
                  </div>
                  <div className={`text-base font-mono font-black leading-tight ${isCurrent ? 'text-white' : 'text-slate-300'}`}>
                    {map?.level || 1}
                  </div>
                </button>
              );
            })}
          </div>

          {/* High Score + Note count */}
          <div className="shrink-0 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium">
                  내 최고 기록{myRank ? <span className="ml-1 text-cyan-400">· {myRank}위</span> : null}
                </div>
                <div className="text-sm font-bold text-white font-mono truncate">
                  {currentRecord
                    ? `${currentRecord.score.toLocaleString()} · ${currentRecord.grade}`
                    : '---'}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-400 font-mono text-right shrink-0">
              노트 <span className="text-white font-bold">{currentBeatmap?.noteCount || 0}</span>
              {currentRecord && (
                <div className="text-[11px]">
                  {currentRecord.accuracy.toFixed(1)}% · {currentRecord.maxCombo} MAX
                </div>
              )}
            </div>
          </div>

          {/* Chart leaderboard (top 3) */}
          <div className="shrink-0 bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                이 곡 랭킹 ({leaderboard.length}명)
              </span>
              <button
                onClick={onOpenRanking}
                className="flex items-center text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
              >
                전체 보기
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
            {leaderboard.length === 0 ? (
              <div className="text-[11px] text-slate-600 py-0.5">아직 기록이 없습니다</div>
            ) : (
              <ol className="space-y-0.5">
                {leaderboard.slice(0, 3).map((e) => (
                  <li
                    key={e.userKey}
                    className={`flex items-center gap-2 text-xs ${e.userKey === currentUserKey ? 'text-cyan-200' : 'text-slate-300'}`}
                  >
                    <span className="w-5 flex justify-center shrink-0"><RankIcon rank={e.rank} /></span>
                    <span className="truncate flex-1 font-semibold">{e.name}</span>
                    <span className="font-mono text-slate-400">{e.score.grade}</span>
                    <span className="font-mono w-20 text-right">{e.score.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Speed Modifier */}
          <div className="shrink-0 flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <FastForward className="w-3.5 h-3.5 text-cyan-400" />
            <span>노트 속도</span>
            <div className="flex items-center gap-1 flex-wrap">
              {speedOptions.map((speed) => (
                <button
                  key={speed}
                  onClick={() => onChangeSpeed(speed)}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-colors cursor-pointer ${
                    settings.scrollSpeed === speed
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {speed.toFixed(1)}x
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Button (desktop: inside the deck) */}
          <div className="hidden md:block shrink-0">{startButton}</div>
        </div>
      </div>

      {/* Mobile / tablet: start button pinned to the bottom of the screen */}
      <div className="md:hidden sticky bottom-0 z-20 -mx-4 sm:-mx-6 mt-4 px-4 sm:px-6 pt-6 pb-4 bg-gradient-to-t from-[#080b12] via-[#080b12]/95 to-transparent">
        {startButton}
      </div>
    </div>
    </>
  );
};
