import React, { useEffect } from 'react';
import { Play, Sparkles, Sliders, Music, Zap } from 'lucide-react';
import { soundEngine } from '../services/soundEngine';

interface TitleScreenProps {
  onStart: () => void;
  onOpenSettings: () => void;
  onOpenHowToPlay: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenSettings,
  onOpenHowToPlay,
}) => {
  // Listen for any key press to start
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') return;
      soundEngine.init();
      onStart();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart]);

  const handleStartClick = () => {
    soundEngine.init();
    onStart();
  };

  return (
    <div className="relative min-h-[calc(100vh-60px)] flex flex-col justify-center items-center px-4 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[300px] bg-pink-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Cyber Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 max-w-2xl text-center space-y-8 py-10">
        {/* Main Title Lockup */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-cyan-400 font-semibold">
            <Zap className="w-3.5 h-3.5" />
            <span>High-Speed 4-Key Rhythm Arcade</span>
          </div>

          <h1 className="text-5xl sm:text-7xl font-black font-display tracking-tight text-white uppercase drop-shadow-md">
            PULSE<span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500">BEAT</span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            짜릿한 타격감과 역동적인 신디사이저 사운드트랙.
            <br />
            비트에 맞춰 완벽한 타이밍을 포착하세요.
          </p>
        </div>

        {/* Start Game Action */}
        <div className="pt-4 flex flex-col items-center gap-4">
          <button
            onClick={handleStartClick}
            className="group relative px-8 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-sm tracking-wider uppercase rounded transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>게임 시작 (PRESS ENTER)</span>
          </button>

          <span className="text-xs text-slate-500 tracking-wider">
            키보드 D · F · J · K 또는 모바일 터치 지원
          </span>
        </div>

        {/* Feature highlight items */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-slate-800/80 text-left">
          <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800/60">
            <div className="text-xs font-bold text-cyan-400 mb-1 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              <span>실시간 오디오 합성</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              네트워크 지연 없이 0ms 정밀도로 동기화되는 Web Audio 신스 엔진
            </p>
          </div>

          <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800/60">
            <div className="text-xs font-bold text-pink-400 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>4단계 난이도 & 3D 뷰</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              EASY부터 EXPERT까지, 그리고 3D 고속도로 원근감 시점 완벽 지원
            </p>
          </div>

          <div className="p-3.5 rounded bg-slate-900/40 border border-slate-800/60">
            <div className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>커스텀 에디터 & 보정</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              키 매핑, 오디오 싱크 지연 오프셋 조정, 나만의 패턴 제작
            </p>
          </div>
        </div>

        {/* Secondary options */}
        <div className="flex justify-center items-center gap-6 text-xs text-slate-400 pt-2">
          <button
            onClick={onOpenHowToPlay}
            className="hover:text-slate-200 transition-colors cursor-pointer"
          >
            플레이 방법
          </button>
          <span>·</span>
          <button
            onClick={onOpenSettings}
            className="hover:text-slate-200 transition-colors cursor-pointer"
          >
            환경 설정
          </button>
        </div>
      </div>
    </div>
  );
};
