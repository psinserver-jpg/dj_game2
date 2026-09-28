import React, { useState } from 'react';
import { Crosshair, Check } from 'lucide-react';
import type { TimingStats } from '../types/game';
import { HISTOGRAM_BIN_MS, HISTOGRAM_MIN_MS, WINDOWS_MS, suggestedOffset } from '../services/timing';

interface TimingAnalysisProps {
  timing: TimingStats;
  currentOffsetMs: number;
  onApplyOffset?: (offsetMs: number) => void;
}

const binColor = (centerMs: number) => {
  const a = Math.abs(centerMs);
  if (a <= WINDOWS_MS.PERFECT) return 'bg-sky-400';
  if (a <= WINDOWS_MS.GREAT) return 'bg-emerald-400';
  return 'bg-amber-400';
};

/** Result-screen card: average offset, consistency, histogram and a one-click offset fix. */
export const TimingAnalysis: React.FC<TimingAnalysisProps> = ({ timing, currentOffsetMs, onApplyOffset }) => {
  const [applied, setApplied] = useState(false);
  const suggestion = suggestedOffset(timing);
  const peak = Math.max(1, ...timing.histogram);
  const mean = timing.meanMs;
  const tendency = Math.abs(mean) < 5 ? '박자에 잘 맞췄어요' : mean < 0 ? '전체적으로 빠르게 눌렀어요' : '전체적으로 늦게 눌렀어요';
  const steadiness = timing.stdMs <= 20 ? '매우 안정적' : timing.stdMs <= 35 ? '안정적' : timing.stdMs <= 55 ? '보통' : '들쭉날쭉';

  if (!timing.hits) return null;

  return (
    <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
          타이밍 분석
        </div>
        <div className="text-[11px] text-slate-500">{timing.hits}회 입력 기준</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] text-slate-400">평균 오차</div>
          <div className={`text-lg font-mono font-bold ${Math.abs(mean) < 5 ? 'text-emerald-400' : mean < 0 ? 'text-sky-400' : 'text-orange-400'}`}>
            {mean > 0 ? '+' : ''}
            {mean.toFixed(1)}ms
          </div>
          <div className="text-[11px] text-slate-500">{tendency}</div>
        </div>
        <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
          <div className="text-[11px] text-slate-400">편차 (일관성)</div>
          <div className="text-lg font-mono font-bold text-white">±{timing.stdMs.toFixed(1)}ms</div>
          <div className="text-[11px] text-slate-500">{steadiness}</div>
        </div>
      </div>

      {/* Histogram: left = early, right = late */}
      <div>
        <div className="relative h-16 flex items-end gap-px">
          {timing.histogram.map((count, i) => {
            const center = HISTOGRAM_MIN_MS + (i + 0.5) * HISTOGRAM_BIN_MS;
            return (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${binColor(center)} ${count ? 'opacity-90' : 'opacity-15'}`}
                style={{ height: `${Math.max(4, (count / peak) * 100)}%` }}
                title={`${center - 5}~${center + 5}ms: ${count}회`}
              />
            );
          })}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/70" />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
          <span>빠름 -140ms</span>
          <span>0</span>
          <span>+140ms 느림</span>
        </div>
      </div>

      {suggestion !== null && onApplyOffset && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded bg-cyan-500/10 border border-cyan-500/30">
          <div className="text-xs text-slate-300">
            오디오 싱크 오프셋을 <span className="font-mono text-slate-400">{currentOffsetMs}ms</span> →{' '}
            <span className="font-mono font-bold text-cyan-300">{suggestion}ms</span>로 바꾸면 노트가 내 박자에 더 잘 맞아요.
          </div>
          <button
            onClick={() => {
              onApplyOffset(suggestion);
              setApplied(true);
            }}
            disabled={applied}
            className="shrink-0 px-3 py-1.5 rounded bg-cyan-400 hover:bg-cyan-300 disabled:bg-emerald-500/30 disabled:text-emerald-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
          >
            {applied ? (
              <>
                <Check className="w-3.5 h-3.5" /> 적용됨
              </>
            ) : (
              '추천 오프셋 적용'
            )}
          </button>
        </div>
      )}
    </div>
  );
};
