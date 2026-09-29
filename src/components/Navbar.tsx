import React from 'react';
import { GameView } from '../types/game';
import { Sliders, HelpCircle, Music, Play, FileDown, Trophy, User, LogOut, LogIn } from 'lucide-react';
import { DOCS, IMAGES } from '../data/assets';
import { UserAccount } from '../services/userService';

interface NavbarProps {
  currentView: GameView;
  onNavigate: (view: GameView) => void;
  onOpenSettings: () => void;
  onOpenHowToPlay: () => void;
  onOpenRanking: () => void;
  currentUser: UserAccount | null;
  onLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenSettings,
  onOpenHowToPlay,
  onOpenRanking,
  currentUser,
  onLogin,
  onLogout,
}) => {
  // If in active gameplay, show minimal bar or keep lean so focus remains on music
  if (currentView === 'PLAYING') {
    return null;
  }

  return (
    <header className="relative w-full bg-[#080b12]/85 backdrop-blur-md z-40 sticky top-0 px-4 sm:px-6 py-2.5 sm:py-3">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => onNavigate('SONG_SELECT')}
          className="shrink-0 cursor-pointer transition-transform hover:scale-[1.03]"
          aria-label="PULSEBEAT 곡 선택"
        >
          <img src={IMAGES.logo} alt="PULSEBEAT" className="h-6 sm:h-7 w-auto drop-shadow-[0_0_10px_rgba(34,211,238,0.35)]" />
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
            onClick={onOpenRanking}
            className="hover:text-cyan-400 transition-colors cursor-pointer"
          >
            랭킹
          </button>
          <button
            onClick={onOpenHowToPlay}
            className="hover:text-cyan-400 transition-colors cursor-pointer"
          >
            게임 가이드
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {currentUser ? (
            <div className="flex items-center rounded border border-cyan-700/60 bg-cyan-500/10 text-xs font-semibold text-cyan-200">
              <span className="flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 max-w-[7rem] sm:max-w-[10rem]" title={`${currentUser.name} 님으로 플레이 중`}>
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{currentUser.name}</span>
              </span>
              <button
                onClick={onLogout}
                className="px-2 py-1.5 border-l border-cyan-700/60 text-cyan-300/80 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer"
                title="로그아웃"
                aria-label="로그아웃"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 rounded border border-cyan-700/60 transition-colors whitespace-nowrap cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>입장</span>
            </button>
          )}
          <button
            onClick={onOpenRanking}
            className="md:hidden flex items-center px-2.5 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded border border-slate-700 transition-colors cursor-pointer"
            title="랭킹"
            aria-label="랭킹"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </button>
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
