import React from 'react';
import { GameView } from '../types/game';
import { Sliders, HelpCircle, Music, Play, FileDown } from 'lucide-react';
import { DOCS } from '../data/assets';

interface NavbarProps {
  currentView: GameView;
  onNavigate: (view: GameView) => void;
  onOpenSettings: () => void;
  onOpenHowToPlay: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenSettings,
  onOpenHowToPlay,
}) => {
  // If in active gameplay, show minimal bar or keep lean so focus remains on music
  if (currentView === 'PLAYING') {
    return null;
  }

  return (
    <header className="w-full border-b border-slate-800 bg-[#080b12]/95 backdrop-blur-md z-40 sticky top-0 px-6 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => onNavigate('SONG_SELECT')}
          className="text-lg font-extrabold tracking-wider font-display text-white hover:text-cyan-400 transition-colors uppercase cursor-pointer"
        >
          PulseBeat
        </button>

        {/* Zone 2: 4-6 clean text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <button
            onClick={() => onNavigate('SONG_SELECT')}
            className={`hover:text-cyan-400 transition-colors cursor-pointer ${
              currentView === 'SONG_SELECT' ? 'text-cyan-400' : ''
            }`}
          >
            곡 선택
          </button>
          <button
            onClick={() => onNavigate('BEATMAP_EDITOR')}
            className={`hover:text-cyan-400 transition-colors cursor-pointer ${
              currentView === 'BEATMAP_EDITOR' ? 'text-cyan-400' : ''
            }`}
          >
            노트 에디터
          </button>
          <button
            onClick={onOpenHowToPlay}
            className="hover:text-cyan-400 transition-colors cursor-pointer"
          >
            게임 가이드
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-3">
          <a
            href={DOCS.plan.url}
            download={DOCS.plan.fileName}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded border border-slate-700 hover:border-slate-600 transition-colors whitespace-nowrap cursor-pointer"
            title="작업 계획서 다운로드 (.docx)"
          >
            <FileDown className="w-3.5 h-3.5 text-pink-400" />
            <span className="hidden sm:inline">계획서</span>
          </a>
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded border border-slate-700 hover:border-slate-600 transition-colors whitespace-nowrap cursor-pointer"
            title="환경 설정"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">설정</span>
          </button>
          {currentView !== 'SONG_SELECT' && (
            <button
              onClick={() => onNavigate('SONG_SELECT')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors whitespace-nowrap shadow-sm cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>플레이</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
