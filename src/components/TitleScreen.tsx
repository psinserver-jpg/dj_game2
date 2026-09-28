import React, { useEffect, useState } from 'react';
import { Play, Sparkles, Sliders, Music, Zap, FileDown, Volume2, VolumeX } from 'lucide-react';
import { soundEngine } from '../services/soundEngine';
import { IMAGES, DOCS } from '../data/assets';

const TITLE_THEME_URL = '/music/title-theme.mp3';
const BGM_MUTED_KEY = 'pulsebeat_title_bgm_muted';

interface TitleScreenProps {
  onStart: () => void;
  onOpenSettings: () => void;
  onOpenHowToPlay: () => void;
  keyboardEnabled?: boolean; // false while a modal is open
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenSettings,
  onOpenHowToPlay,
  keyboardEnabled = true,
}) => {
  // Title music: starts right away; browsers keep it silent until the first click / key press
  const [bgmMuted, setBgmMuted] = useState(() => {
    try {
      return localStorage.getItem(BGM_MUTED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [audioReady, setAudioReady] = useState(() => soundEngine.isAudioRunning());

  useEffect(() => {
    if (!bgmMuted) soundEngine.startBgm(TITLE_THEME_URL);
    else soundEngine.stopBgm(0.3);
  }, [bgmMuted]);
  useEffect(() => () => soundEngine.stopBgm(0.8), []);

  useEffect(() => {
    if (audioReady) return;
    const check = () => window.setTimeout(() => setAudioReady(soundEngine.isAudioRunning()), 100);
    window.addEventListener('pointerdown', check);
    window.addEventListener('keydown', check);
    return () => {
      window.removeEventListener('pointerdown', check);
      window.removeEventListener('keydown', check);
    };
  }, [audioReady]);

  const toggleBgm = () => {
    setBgmMuted((m) => {
      try {
        localStorage.setItem(BGM_MUTED_KEY, m ? '0' : '1');
      } catch {
        // storage unavailable
      }
      return !m;
    });
  };

  // Enter / Space start the game; other keys only wake the audio so the music can be heard
  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      soundEngine.init();
      onStart();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart, keyboardEnabled]);

  const handleStartClick = () => {
    soundEngine.init();
    onStart();
  };

  return (
    <div className="relative flex-1 flex flex-col justify-center items-center px-4 overflow-hidden">
      {/* Music toggle + autoplay hint */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {!bgmMuted && !audioReady && (
          <span className="hidden sm:inline text-[11px] text-slate-300 bg-slate-950/60 border border-slate-700/60 rounded-full px-2.5 py-1 animate-pulse">
            화면을 누르면 음악이 재생돼요
          </span>
        )}
        <button
          onClick={toggleBgm}
          className="glass-panel rounded-full p-2.5 text-slate-200 hover:text-cyan-300 transition-colors cursor-pointer"
          title={bgmMuted ? '배경음악 켜기' : '배경음악 끄기'}
          aria-label={bgmMuted ? '배경음악 켜기' : '배경음악 끄기'}
        >
          {bgmMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Key visual background */}
      <img
        src={IMAGES.titleBackground}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none animate-title-zoom"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#080b12]/70 via-[#080b12]/55 to-[#080b12] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#080b12_85%)] pointer-events-none" />

      {/* Cyber Grid Lines */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 max-w-2xl text-center space-y-6 sm:space-y-8 py-6 sm:py-10">
        {/* Main Title Lockup */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest text-cyan-400 font-semibold">
            <Zap className="w-3.5 h-3.5" />
            <span>High-Speed 4-Key Rhythm Arcade</span>
          </div>

          <h1 className="flex justify-center">
            <img
              src={IMAGES.logo}
              alt="PULSEBEAT"
              className="w-full max-w-[560px] drop-shadow-[0_0_24px_rgba(6,182,212,0.35)] animate-float-gentle"
            />
          </h1>

          <p className="text-slate-300 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            짜릿한 타격감과 Lyria로 만든 오리지널 사운드트랙.
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
            <span>
              게임 시작 <span className="pointer-coarse:hidden">(PRESS ENTER)</span>
            </span>
          </button>

          <span className="text-xs text-slate-500 tracking-wider">
            키보드 D · F · J · K 또는 화면 아래쪽 터치로 플레이
          </span>
        </div>

        {/* Feature highlight items */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-slate-800/80 text-left">
          <div className="p-3.5 rounded bg-slate-950/60 backdrop-blur-sm border border-slate-700/60">
            <div className="text-xs font-bold text-cyan-400 mb-1 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5" />
              <span>Lyria 3 Pro 오리지널 곡</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              일본어 보컬곡과 연주곡, 음원을 분석해 박자에 맞춘 채보
            </p>
          </div>

          <div className="p-3.5 rounded bg-slate-950/60 backdrop-blur-sm border border-slate-700/60">
            <div className="text-xs font-bold text-pink-400 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>4단계 난이도 & 3D 뷰</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              EASY부터 EXPERT까지, 그리고 3D 고속도로 원근감 시점 완벽 지원
            </p>
          </div>

          <div className="p-3.5 rounded bg-slate-950/60 backdrop-blur-sm border border-slate-700/60">
            <div className="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>정확도 분석 & 싱크 보정</span>
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              ms 단위 타이밍 막대와 결과 분석, 추천 오프셋 원클릭 적용
            </p>
          </div>
        </div>

        {/* Secondary options */}
        <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 text-xs text-slate-400 pt-2">
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
          <span>·</span>
          <a
            href={DOCS.plan.url}
            download={DOCS.plan.fileName}
            className="flex items-center gap-1 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            계획서 다운로드
          </a>
        </div>
      </div>
    </div>
  );
};
