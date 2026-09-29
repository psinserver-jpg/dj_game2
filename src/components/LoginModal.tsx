import React, { useEffect, useRef, useState } from 'react';
import { X, LogIn, User, Lock, Play } from 'lucide-react';
import { userService, UserAccount, PASSWORD_MAX } from '../services/userService';

interface LoginModalProps {
  isOpen: boolean;
  currentUser: UserAccount | null;
  onLogin: (user: UserAccount, created: boolean) => void;
  onContinue: () => void; // play on with the player who is already logged in
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, currentUser, onLogin, onContinue, onClose }) => {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false); // logged in, but entering a different ID
  const idRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const showForm = !currentUser || switching;
  const recentIds = isOpen ? userService.getRecentIds() : [];
  const isKnownId = recentIds.some((name) => name.toLowerCase() === id.trim().toLowerCase());

  useEffect(() => {
    if (!isOpen) return;
    setId('');
    setPassword('');
    setError('');
    setSwitching(false);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && showForm) window.setTimeout(() => idRef.current?.focus(), 30);
  }, [isOpen, showForm]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'Enter' && !showForm) {
        e.preventDefault();
        onContinue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, showForm, onClose, onContinue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = userService.login(id, password);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onLogin(result.user, result.created);
  };

  const pickRecent = (name: string) => {
    setId(name);
    setError('');
    passwordRef.current?.focus();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm glass-panel rounded-2xl p-5 sm:p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 id="login-title" className="text-lg font-bold font-display text-white flex items-center gap-2">
            <LogIn className="w-5 h-5 text-cyan-400" />
            플레이어 입장
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!showForm && currentUser ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              <span className="font-bold text-cyan-300">{currentUser.name}</span> 님으로 입장해 있습니다.
            </p>
            <button
              onClick={onContinue}
              className="btn-neon w-full py-3 font-extrabold text-sm tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              {currentUser.name} (으)로 계속하기
            </button>
            <button
              onClick={() => setSwitching(true)}
              className="w-full py-2.5 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700 transition-colors cursor-pointer"
            >
              다른 아이디로 입장
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            <p className="text-xs text-slate-400 leading-relaxed">
              회원가입 없이 아이디와 간단한 비밀번호만 입력하세요.
              <br />
              처음 쓰는 아이디는 자동으로 등록되고, 기록과 랭킹이 이 아이디로 저장됩니다.
            </p>

            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">아이디</span>
              <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 focus-within:border-cyan-500">
                <User className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  ref={idRef}
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setError('');
                  }}
                  maxLength={12}
                  autoComplete="username"
                  placeholder="2~12자 (한글·영문·숫자)"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold text-slate-400">비밀번호</span>
              <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 focus-within:border-cyan-500">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  maxLength={PASSWORD_MAX}
                  autoComplete={isKnownId ? 'current-password' : 'new-password'}
                  placeholder="4자 이상 (숫자 4자리도 OK)"
                  className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                />
              </div>
            </label>

            {error && <p className="text-xs text-rose-400 leading-relaxed" role="alert">{error}</p>}

            <button
              type="submit"
              className="btn-neon w-full py-3 font-extrabold text-sm tracking-wider rounded-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              {id.trim() && !isKnownId ? '새 아이디로 시작' : '입장하기'}
            </button>

            {recentIds.length > 0 && (
              <div className="pt-1">
                <div className="text-[11px] text-slate-500 mb-1.5">이 기기에서 플레이한 아이디</div>
                <div className="flex flex-wrap gap-1.5">
                  {recentIds.map((name) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() => pickRecent(name)}
                      className="px-2.5 py-1 text-xs rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-cyan-300 hover:border-cyan-600 transition-colors cursor-pointer"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-slate-600 leading-relaxed">
              기록은 이 브라우저에만 저장됩니다. 비밀번호는 찾을 수 없으니 기억하기 쉬운 것으로 정하세요.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};
