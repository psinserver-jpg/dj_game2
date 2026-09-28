import React from 'react';
import { DifficultyLevel } from '../types/game';
import { Pause } from 'lucide-react';

interface GameHUDProps {
  songTitle: string;
  difficulty: DifficultyLevel;
  score: number;
  accuracy: number;
  counts: { perfect: number; great: number; good: number; miss: number };
  meanOffsetMs: number | null; // average hit offset so far (negative = early)
  grooveGauge: number; // 0 to 100
  progress: number; // 0..1 song position
  onPause: () => void;
}

const DIFF_COLORS: Record<DifficultyLevel, string> = {
  EASY: 'text-cyan-300 bg-cyan-500/15 border-cyan-400/40',
  NORMAL: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/40',
  HARD: 'text-amber-300 bg-amber-500/15 border-amber-400/40',
  EXPERT: 'text-rose-300 bg-rose-500/15 border-rose-400/40',
};

const COUNTERS = [
  { key: 'perfect', label: 'PF', className: 'text-sky-300', dot: 'bg-sky-400' },
  { key: 'great', label: 'GR', className: 'text-emerald-300', dot: 'bg-emerald-400' },
  { key: 'good', label: 'GD', className: 'text-amber-300', dot: 'bg-amber-400' },
  { key: 'miss', label: 'MS', className: 'text-rose-300', dot: 'bg-rose-400' },
] as const;

export const GameHUD: React.FC<GameHUDProps> = ({
  songTitle,
  difficulty,
  score,
  accuracy,
  counts,
  meanOffsetMs,
  grooveGauge,
  progress,
  onPause,
}) => {
  // Pad score to 7 digits like classic arcade rhythm games
  const formattedScore = String(score).padStart(7, '0');
  const gaugeClass =
    grooveGauge > 70
      ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 shadow-[0_0_10px_#34d399]'
      : grooveGauge > 30
        ? 'bg-gradient-to-r from-amber-400 to-cyan-400'
        : 'bg-rose-500 shadow-[0_0_10px_#f43f5e]';

  return (
    <div className="absolute inset-x-0 top-0 pointer-events-none z-20">
      {/* Song progress */}
      <div className="h-1 w-full bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-pink-500 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>

      <div className="flex items-start justify-between gap-2 p-2 sm:p-3">
        {/* Left: pause + song */}
        <div className="glass-panel rounded-xl flex items-center gap-2 sm:gap-3 pl-1.5 pr-3 py-1.5 pointer-events-auto min-w-0">
          <button
            onClick={onPause}
            className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="일시 정지 (ESC)"
            aria-label="일시 정지"
          >
            <Pause className="w-4 h-4 fill-current" />
          </button>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-bold text-white truncate max-w-[34vw] sm:max-w-xs font-display">
              {songTitle}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`px-1.5 rounded border text-[10px] font-bold font-mono leading-4 ${DIFF_COLORS[difficulty]}`}>
                {difficulty}
              </span>
              <span className="text-[11px] text-slate-400">정확도</span>
              <span className="text-[11px] sm:text-xs text-white font-mono font-bold tabular-nums">
                {accuracy.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Center: groove gauge (desktop) */}
        <div className="hidden md:flex glass-panel rounded-xl flex-col gap-1 w-64 px-3 py-2">
          <div className="flex justify-between text-[10px] font-mono tracking-widest text-slate-400">
            <span>GROOVE</span>
            <span className="text-slate-200">{Math.round(grooveGauge)}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-950/80 overflow-hidden">
            <div className={`h-full transition-all duration-100 ${gaugeClass}`} style={{ width: `${grooveGauge}%` }} />
          </div>
        </div>

        {/* Right: score, judgment counters, timing */}
        <div className="glass-panel rounded-xl px-3 py-1.5 text-right shrink-0">
          <div className="text-xl sm:text-3xl font-black font-mono tracking-wider text-white leading-tight tabular-nums">
            {formattedScore}
          </div>
          <div className="mt-0.5 flex justify-end gap-2 text-[10px] sm:text-[11px] font-mono font-bold tabular-nums">
            {COUNTERS.map((c) => (
              <span key={c.key} className={`flex items-center gap-1 ${c.className}`} title={c.key.toUpperCase()}>
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                <span className="hidden sm:inline opacity-70">{c.label}</span>
                {counts[c.key]}
              </span>
            ))}
          </div>
          {meanOffsetMs !== null && (
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
              평균{' '}
              <span
                className={`font-mono font-bold ${
                  Math.abs(meanOffsetMs) < 10 ? 'text-emerald-300' : meanOffsetMs < 0 ? 'text-sky-300' : 'text-orange-300'
                }`}
              >
                {meanOffsetMs > 0 ? '+' : ''}
                {meanOffsetMs.toFixed(0)}ms
              </span>{' '}
              {Math.abs(meanOffsetMs) < 10 ? '정확' : meanOffsetMs < 0 ? '빠름' : '느림'}
            </div>
          )}
        </div>
      </div>

      {/* Groove gauge (mobile): thin bar under the top panels */}
      <div className="md:hidden mx-2 h-1 rounded-full bg-slate-950/70 overflow-hidden">
        <div className={`h-full transition-all duration-100 ${gaugeClass}`} style={{ width: `${grooveGauge}%` }} />
      </div>
    </div>
  );
};
