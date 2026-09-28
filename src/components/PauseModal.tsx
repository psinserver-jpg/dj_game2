import React from 'react';
import { Play, RotateCcw, ListMusic, FastForward, Clock } from 'lucide-react';
import { GameSettings } from '../types/game';

interface PauseModalProps {
  onResume: () => void;
  onRetry: () => void;
  onExit: () => void;
  settings: GameSettings;
  onUpdateSpeed: (speed: number) => void;
  onUpdateOffset: (offset: number) => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRetry,
  onExit,
  settings,
  onUpdateSpeed,
  onUpdateOffset,
}) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-700/80 rounded-xl p-6 shadow-2xl space-y-6">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-black font-display text-white uppercase tracking-wider">
            일시 정지
          </h2>
          <p className="text-xs text-slate-400">ESC를 누르면 게임이 재개됩니다</p>
        </div>

        {/* Quick adjustments in pause screen */}
        <div className="space-y-4 bg-slate-950/60 p-4 rounded-lg border border-slate-800">
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <FastForward className="w-3.5 h-3.5 text-cyan-400" />
                노트 속도
              </span>
              <span className="font-mono text-cyan-400">{settings.scrollSpeed.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="4.0"
              step="0.25"
              value={settings.scrollSpeed}
              onChange={(e) => onUpdateSpeed(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                싱크 오프셋
              </span>
              <span className="font-mono text-amber-400">
                {settings.audioOffsetMs > 0 ? `+${settings.audioOffsetMs}` : settings.audioOffsetMs} ms
              </span>
            </div>
            <input
              type="range"
              min="-150"
              max="150"
              step="5"
              value={settings.audioOffsetMs}
              onChange={(e) => onUpdateOffset(parseInt(e.target.value, 10))}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={onResume}
            className="w-full py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>이어하기 (RESUME)</span>
          </button>

          <button
            onClick={onRetry}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>다시 시작 (RETRY)</span>
          </button>

          <button
            onClick={onExit}
            className="w-full py-2.5 text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span>곡 선택으로 돌아가기</span>
          </button>
        </div>
      </div>
    </div>
  );
};
