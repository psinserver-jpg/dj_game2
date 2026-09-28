import React from 'react';
import { DifficultyLevel } from '../types/game';
import { Pause } from 'lucide-react';

interface GameHUDProps {
  songTitle: string;
  difficulty: DifficultyLevel;
  score: number;
  accuracy: number;
  grooveGauge: number; // 0 to 100
  keyBindings: [string, string, string, string];
  activeLanes: boolean[];
  onPause: () => void;
  onLanePress: (lane: number) => void;
  onLaneRelease: (lane: number) => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  songTitle,
  difficulty,
  score,
  accuracy,
  grooveGauge,
  keyBindings,
  activeLanes,
  onPause,
  onLanePress,
  onLaneRelease,
}) => {
  // Pad score to 7 digits like classic arcade rhythm games
  const formattedScore = String(score).padStart(7, '0');

  const diffColors: Record<DifficultyLevel, string> = {
    EASY: 'text-cyan-400 border-cyan-500/50',
    NORMAL: 'text-emerald-400 border-emerald-500/50',
    HARD: 'text-amber-400 border-amber-500/50',
    EXPERT: 'text-rose-400 border-rose-500/50',
  };

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4 z-20">
      {/* Top HUD Bar */}
      <div className="flex items-center justify-between pointer-events-auto">
        {/* Left: Song Info & Pause */}
        <div className="flex items-center gap-3">
          <button
            onClick={onPause}
            className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="일시 정지 (ESC)"
          >
            <Pause className="w-4 h-4 fill-current" />
          </button>
          <div>
            <div className="text-sm font-bold text-white truncate max-w-[180px] sm:max-w-xs font-display">
              {songTitle}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`font-bold font-mono ${diffColors[difficulty]}`}>{difficulty}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400 font-mono">ACC: {accuracy.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Center: Groove Gauge Bar */}
        <div className="hidden sm:flex flex-col items-center gap-1 w-64 max-w-xs">
          <div className="w-full flex justify-between text-[11px] font-mono text-slate-400">
            <span>GROOVE</span>
            <span>{Math.round(grooveGauge)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-950/80 border border-slate-800 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-100 ${
                grooveGauge > 70
                  ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 shadow-[0_0_8px_#34d399]'
                  : grooveGauge > 30
                  ? 'bg-gradient-to-r from-amber-400 to-cyan-400'
                  : 'bg-rose-500'
              }`}
              style={{ width: `${grooveGauge}%` }}
            />
          </div>
        </div>

        {/* Right: Score Counter */}
        <div className="text-right">
          <div className="text-[10px] uppercase font-mono tracking-widest text-slate-400">SCORE</div>
          <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-white">
            {formattedScore}
          </div>
        </div>
      </div>

      {/* Bottom Mobile On-Screen Touch Buttons (Accessible on mobile / touch devices) */}
      <div className="w-full max-w-md mx-auto grid grid-cols-4 gap-2 pb-2 pointer-events-auto sm:hidden">
        {[0, 1, 2, 3].map((lane) => (
          <button
            key={lane}
            onTouchStart={(e) => {
              e.preventDefault();
              onLanePress(lane);
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              onLaneRelease(lane);
            }}
            onMouseDown={() => onLanePress(lane)}
            onMouseUp={() => onLaneRelease(lane)}
            className={`py-5 rounded-lg border text-center font-mono font-bold text-sm select-none transition-all active:scale-95 ${
              activeLanes[lane]
                ? 'bg-cyan-500 text-slate-950 border-white shadow-lg shadow-cyan-500/50'
                : 'bg-slate-900/80 border-slate-700 text-slate-300'
            }`}
          >
            {keyBindings[lane].toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
};
