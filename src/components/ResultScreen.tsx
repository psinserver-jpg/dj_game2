import React, { useEffect, useState } from 'react';
import { GameScore, SongMetadata, DifficultyLevel } from '../types/game';
import confetti from 'canvas-confetti';
import { getStageUrl, handleCoverError } from '../data/assets';
import { StageBackdrop } from './StageBackdrop';
import { TimingAnalysis } from './TimingAnalysis';
import { RotateCcw, ListMusic, Share2, Check, Sparkles, Award } from 'lucide-react';

interface ResultScreenProps {
  score: GameScore;
  song: SongMetadata;
  difficulty: DifficultyLevel;
  isNewRecord: boolean;
  onRetry: () => void;
  onSongSelect: () => void;
  audioOffsetMs: number;
  onApplyOffset: (offsetMs: number) => void;
}

const GRADE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  SSS: { text: 'text-amber-300', bg: 'bg-amber-400/10', border: 'border-amber-400/60' },
  SS: { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/40' },
  S: { text: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/40' },
  A: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/40' },
  B: { text: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/40' },
  C: { text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/40' },
  D: { text: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-400/40' },
  F: { text: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/40' },
};

export const ResultScreen: React.FC<ResultScreenProps> = ({
  score,
  song,
  difficulty,
  isNewRecord,
  onRetry,
  onSongSelect,
  audioOffsetMs,
  onApplyOffset,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Launch celebratory confetti on good ranks
    if (['SSS', 'SS', 'S'].includes(score.grade) || score.isFullCombo) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#06b6d4', '#ec4899', '#f59e0b', '#10b981'],
      });
    }
  }, [score]);

  const handleShare = () => {
    const text = `🎮 [PulseBeat 리듬게임]\n🎵 ${song.title} (${difficulty})\n🏆 Rank: ${score.grade} | 점수: ${score.score.toLocaleString()}점\n🎯 정확도: ${score.accuracy.toFixed(1)}% | Max Combo: ${score.maxCombo}\n${score.isAllPerfect ? '✨ ALL PERFECT! ✨' : score.isFullCombo ? '🔥 FULL COMBO! 🔥' : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const gradeStyle = GRADE_COLORS[score.grade] || GRADE_COLORS.D;

  return (
    <>
    <StageBackdrop imageUrl={getStageUrl(song)} />
    <div className="relative z-10 w-full max-w-3xl mx-auto px-4 py-6 flex-1 flex flex-col justify-center items-center">
      <div className="w-full glass-panel rounded-2xl p-4 sm:p-8 space-y-4 sm:space-y-6">
        {/* Header Title & Stage */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-800">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <img
              src={song.coverUrl}
              alt={song.title}
              referrerPolicy="no-referrer"
              onError={handleCoverError}
              className="w-16 h-16 rounded-lg object-cover border border-slate-700 shadow-md shrink-0"
            />
            <div>
              <div className="flex items-center gap-2 justify-center sm:justify-start">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono">
                  {difficulty}
                </span>
                {isNewRecord && (
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    NEW RECORD
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black font-display text-white mt-1">
                {song.title}
              </h2>
              <p className="text-xs text-slate-400">{song.artist}</p>
            </div>
          </div>

          {/* Special Clear Badges */}
          <div className="text-center sm:text-right">
            {score.isAllPerfect ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-amber-400/20 text-amber-300 font-bold text-xs tracking-wider border border-amber-400/50 animate-pulse">
                <Sparkles className="w-3.5 h-3.5" />
                ALL PERFECT
              </div>
            ) : score.isFullCombo ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-cyan-400/20 text-cyan-300 font-bold text-xs tracking-wider border border-cyan-400/50">
                FULL COMBO
              </div>
            ) : score.score >= 700000 ? (
              <div className="text-xs font-bold text-emerald-400 tracking-wider">STAGE CLEAR</div>
            ) : (
              <div className="text-xs font-bold text-rose-500 tracking-wider">STAGE FAILED</div>
            )}
          </div>
        </div>

        {/* Center: Grade Stamp & Score Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
          {/* Grade Badge */}
          <div className="sm:col-span-4 flex flex-col items-center justify-center p-3 sm:p-6 rounded-xl bg-slate-950/70 border border-slate-800 text-center">
            <span className="text-xs font-mono tracking-widest text-slate-400 uppercase mb-1">
              RANK
            </span>
            <div
              className={`text-6xl sm:text-8xl font-black font-display tracking-wider ${['SSS', 'SS', 'S'].includes(score.grade) ? 'text-neon' : gradeStyle.text} drop-shadow-md`}
            >
              {score.grade}
            </div>
          </div>

          {/* Total Score & Accuracy Metrics */}
          <div className="sm:col-span-8 space-y-4">
            <div>
              <div className="text-xs font-mono text-slate-400 uppercase">TOTAL SCORE</div>
              <div className="text-4xl sm:text-5xl font-black font-mono tracking-wider text-white">
                {score.score.toLocaleString()}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
              <div>
                <div className="text-[11px] font-mono text-slate-400">ACCURACY</div>
                <div className="text-xl font-bold font-mono text-cyan-400">
                  {score.accuracy.toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono text-slate-400">MAX COMBO</div>
                <div className="text-xl font-bold font-mono text-amber-400">{score.maxCombo}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Judgment Breakdown Table */}
        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1">
            판정 상세
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-xs font-bold text-cyan-400">PERFECT</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">
                {score.counts.perfect}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-xs font-bold text-emerald-400">GREAT</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">
                {score.counts.great}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-xs font-bold text-amber-400">GOOD</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">
                {score.counts.good}
              </div>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
              <div className="text-xs font-bold text-rose-500">MISS</div>
              <div className="text-lg font-mono font-bold text-white mt-0.5">
                {score.counts.miss}
              </div>
            </div>
          </div>

          {/* Timing Fast / Slow offset count */}
          <div className="flex justify-end gap-4 text-xs font-mono text-slate-400 pt-1">
            <span>
              FAST: <strong className="text-blue-400">{score.timingDistribution.fast}</strong>
            </span>
            <span>
              SLOW: <strong className="text-orange-400">{score.timingDistribution.slow}</strong>
            </span>
          </div>
        </div>

        {score.timing && (
          <TimingAnalysis timing={score.timing} currentOffsetMs={audioOffsetMs} onApplyOffset={onApplyOffset} />
        )}

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            onClick={handleShare}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>클립보드 복사 완료!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>기록 공유하기</span>
              </>
            )}
          </button>

          <div className="w-full sm:w-auto flex items-center gap-3">
            <button
              onClick={onSongSelect}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>곡 목록</span>
            </button>

            <button
              onClick={onRetry}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>다시 플레이</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
