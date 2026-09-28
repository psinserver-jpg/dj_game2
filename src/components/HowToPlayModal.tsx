import React from 'react';
import { X, Play, Clock, Sparkles } from 'lucide-react';

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyBindings: [string, string, string, string];
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  isOpen,
  onClose,
  keyBindings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 className="text-xl font-bold font-display text-white">게임 가이드 & 조작법</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Basic Key Controls */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
            1. 키보드 & 터치 조작
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            하단 판정선(Receptor)에 노트가 정확히 닿는 순간 해당하는 키를 누릅니다.
          </p>

          <div className="grid grid-cols-4 gap-2 pt-1 text-center">
            {keyBindings.map((key, lane) => (
              <div
                key={lane}
                className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex flex-col items-center"
              >
                <span className="text-[10px] text-slate-500 font-mono">LANE {lane + 1}</span>
                <span className="text-xl font-extrabold text-cyan-400 font-mono uppercase mt-1">
                  {key}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            * 모바일이나 태블릿에서는 화면 하단 레인을 직접 터치하여 플레이할 수 있습니다.
          </p>
        </div>

        {/* 2. Note Types */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <h3 className="text-xs font-bold text-pink-400 uppercase tracking-wider">
            2. 노트 종류
          </h3>

          <div className="space-y-2">
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-start gap-3">
              <div className="w-8 h-4 rounded-full bg-cyan-400 mt-1 shrink-0 shadow-[0_0_8px_#06b6d4]" />
              <div>
                <div className="text-xs font-bold text-white">단타 노트 (Tap Note)</div>
                <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                  판정선에 겹치는 타이밍에 키를 한 번 정확히 탭합니다.
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800/80 flex items-start gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-b from-pink-500 to-cyan-400 mt-1 shrink-0 shadow-[0_0_8px_#ec4899]" />
              <div>
                <div className="text-xs font-bold text-white">롱 노트 (Hold Note)</div>
                <div className="text-xs text-slate-400 leading-relaxed mt-0.5">
                  노트의 꼬리가 완전히 지나갈 때까지 키를 누르고 유지합니다.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Judgments & Score */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
            3. 판정 기준
          </h3>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-cyan-400">PERFECT</span>
              <span className="text-slate-400 ml-1.5">(±45ms) · 300점</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-emerald-400">GREAT</span>
              <span className="text-slate-400 ml-1.5">(±85ms) · 200점</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-amber-400">GOOD</span>
              <span className="text-slate-400 ml-1.5">(±130ms) · 100점</span>
            </div>
            <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
              <span className="font-bold text-rose-500">MISS</span>
              <span className="text-slate-400 ml-1.5">(빗나감) · 콤보 초기화</span>
            </div>
          </div>
        </div>

        {/* Pro-Tips */}
        <div className="p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-xs space-y-1 text-slate-300">
          <div className="font-bold text-cyan-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>플레이 팁</span>
          </div>
          <p>
            - 노트가 너무 빽빽하게 보인다면 곡 선택 화면에서 <strong>노트 속도(2.5x~3.5x)</strong>를 높여보세요.
          </p>
          <p>
            - 이어폰 소리와 판정이 안 맞을 경우 설정에서 <strong>싱크 오프셋</strong>을 보정할 수 있습니다.
          </p>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
