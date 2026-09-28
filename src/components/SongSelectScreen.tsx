import React, { useState, useEffect } from 'react';
import { SongMetadata, DifficultyLevel, GameSettings } from '../types/game';
import { soundEngine } from '../services/soundEngine';
import { storageService } from '../services/storageService';
import { getStageUrl } from '../data/assets';
import { StageBackdrop } from './StageBackdrop';
import { Play, Volume2, VolumeX, FastForward, Award, Plus, Trash2 } from 'lucide-react';

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
}) => {
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Play preview when selected song changes
  useEffect(() => {
    if (selectedSong.musicPatternId !== 'custom') {
      soundEngine.playPreview(
        selectedSong.musicPatternId,
        selectedSong.bpm,
        selectedSong.previewStart,
        selectedSong.previewDuration
      );
      setIsPlayingPreview(true);
    } else {
      soundEngine.stopPreview();
      setIsPlayingPreview(false);
    }

    return () => {
      soundEngine.stopPreview();
    };
  }, [selectedSong]);

  const togglePreview = () => {
    if (isPlayingPreview) {
      soundEngine.stopPreview();
      setIsPlayingPreview(false);
    } else {
      if (selectedSong.musicPatternId !== 'custom') {
        soundEngine.playPreview(
          selectedSong.musicPatternId,
          selectedSong.bpm,
          selectedSong.previewStart,
          selectedSong.previewDuration
        );
        setIsPlayingPreview(true);
      }
    }
  };

  const currentBeatmap = selectedSong.difficulties[selectedDifficulty];
  const currentRecord = storageService.getScore(selectedSong.id, selectedDifficulty);

  const speedOptions = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];

  return (
    <>
    <StageBackdrop imageUrl={getStageUrl(selectedSong)} />
    <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 min-h-[calc(100vh-60px)] flex flex-col justify-between gap-6">
      {/* Top Banner / Selection Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Song List Column */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              곡 선택 ({songs.length})
            </h2>
            <button
              onClick={onOpenEditor}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>커스텀 곡 추가 / 에디터</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-[58vh] overflow-y-auto pr-1">
            {songs.map((song) => {
              const isSelected = song.id === selectedSong.id;
              const savedRecord = storageService.getScore(song.id, selectedDifficulty);

              return (
                <div
                  key={song.id}
                  onClick={() => onSelectSong(song)}
                  className={`group relative p-3 rounded-lg border transition-all duration-150 cursor-pointer flex items-center justify-between gap-4 ${
                    isSelected
                      ? 'bg-slate-900/90 border-cyan-500/80 shadow-md shadow-cyan-950/40'
                      : 'bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/50 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    {/* Album Thumbnail */}
                    <div className="relative w-14 h-14 rounded overflow-hidden shrink-0 bg-slate-800">
                      <img
                        src={song.coverUrl}
                        alt={song.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      {isSelected && isPlayingPreview && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Volume2 className="w-4 h-4 text-cyan-400 animate-pulse" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate group-hover:text-cyan-400 transition-colors">
                          {song.title}
                        </span>
                        {song.musicPatternId === 'custom' && (
                          <span className="text-[10px] text-amber-400 font-mono">CUSTOM</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{song.artist}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{song.genre}</span>
                        <span>·</span>
                        <span className="font-mono">{song.bpm} BPM</span>
                        <span>·</span>
                        <span className="font-mono">{song.duration}s</span>
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

                    {song.musicPatternId === 'custom' && onDeleteCustomSong && (
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

        {/* Right: Selected Song Stage Deck */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-5">
          {/* Large Album Artwork */}
          <div className="relative aspect-square w-full rounded-lg overflow-hidden border border-slate-700/80 shadow-inner group">
            <img
              src={selectedSong.coverUrl}
              alt={selectedSong.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />

            {/* Gradient Scrim */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-extrabold text-white font-display">
                    {selectedSong.title}
                  </h3>
                  <p className="text-xs text-slate-300">{selectedSong.artist}</p>
                </div>
                <button
                  onClick={togglePreview}
                  className="p-2.5 rounded-full bg-slate-900/80 border border-slate-700 text-slate-200 hover:text-cyan-400 hover:border-cyan-500 transition-all cursor-pointer"
                  title="미리듣기 재생/정지"
                >
                  {isPlayingPreview ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 font-mono">
                <span>{selectedSong.genre}</span>
                <span>·</span>
                <span>{selectedSong.bpm} BPM</span>
                <span>·</span>
                <span>{selectedSong.duration}초</span>
              </div>
            </div>
          </div>

          {/* Difficulty Selector Tabs */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              난이도 선택
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(['EASY', 'NORMAL', 'HARD', 'EXPERT'] as DifficultyLevel[]).map((diff) => {
                const config = DIFFICULTY_CONFIG[diff];
                const map = selectedSong.difficulties[diff];
                const isCurrent = selectedDifficulty === diff;

                return (
                  <button
                    key={diff}
                    onClick={() => onSelectDifficulty(diff)}
                    className={`py-2 px-1 text-center rounded border transition-all cursor-pointer ${
                      isCurrent
                        ? `${config.bg} ${config.border} ring-1 ring-white/20`
                        : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div
                      className={`text-[11px] font-bold tracking-wider ${
                        isCurrent ? config.text : 'text-slate-400'
                      }`}
                    >
                      {config.label}
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-300 mt-0.5">
                      Lv.{map?.level || 1}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* High Score Card */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-[11px] text-slate-400 uppercase font-medium">최고 기록</div>
                <div className="text-sm font-bold text-white font-mono">
                  {currentRecord ? currentRecord.score.toLocaleString() : '---'}
                </div>
              </div>
            </div>
            {currentRecord && (
              <div className="text-right">
                <span className="text-lg font-black text-cyan-400 font-mono">
                  {currentRecord.grade}
                </span>
                <div className="text-[11px] text-slate-400 font-mono">
                  {currentRecord.accuracy.toFixed(1)}% · {currentRecord.maxCombo} MAX
                </div>
              </div>
            )}
          </div>

          {/* Speed Modifier & Details */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <FastForward className="w-3.5 h-3.5 text-cyan-400" />
              <span>노트 속도:</span>
              <div className="flex items-center gap-1">
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

            <div className="text-xs text-slate-400 font-mono">
              노트 수: <span className="text-white font-bold">{currentBeatmap?.noteCount || 0}</span>
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={() => {
              soundEngine.stopPreview();
              onStartGame();
            }}
            className="w-full py-4 bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-slate-950 font-extrabold text-base tracking-widest uppercase rounded-lg shadow-lg shadow-cyan-500/25 transition-all transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-5 h-5 fill-current" />
            <span>게임 시작 (START)</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
};
