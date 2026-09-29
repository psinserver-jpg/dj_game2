import React, { useEffect, useMemo, useState } from 'react';
import { X, Trophy, Crown, Medal } from 'lucide-react';
import { DifficultyLevel, SongMetadata } from '../types/game';
import { storageService } from '../services/storageService';

interface RankingModalProps {
  isOpen: boolean;
  songs: SongMetadata[];
  initialSong: SongMetadata;
  initialDifficulty: DifficultyLevel;
  currentUserKey: string | null;
  onClose: () => void;
}

const DIFFICULTIES: DifficultyLevel[] = ['EASY', 'NORMAL', 'HARD', 'EXPERT'];

export const RankIcon: React.FC<{ rank: number }> = ({ rank }) => {
  if (rank === 1) return <Crown className="w-4 h-4 text-amber-300" aria-label="1위" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-300" aria-label="2위" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-orange-400" aria-label="3위" />;
  return <span className="font-mono text-xs text-slate-400">{rank}</span>;
};

const formatDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export const RankingModal: React.FC<RankingModalProps> = ({
  isOpen,
  songs,
  initialSong,
  initialDifficulty,
  currentUserKey,
  onClose,
}) => {
  const [tab, setTab] = useState<'overall' | 'song'>('song');
  const [songId, setSongId] = useState(initialSong.id);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(initialDifficulty);

  useEffect(() => {
    if (!isOpen) return;
    setSongId(initialSong.id);
    setDifficulty(initialDifficulty);
  }, [isOpen, initialSong.id, initialDifficulty]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const songBoard = useMemo(
    () => (isOpen ? storageService.getLeaderboard(songId, difficulty) : []),
    [isOpen, songId, difficulty]
  );
  const overall = useMemo(() => (isOpen ? storageService.getOverallRanking() : []), [isOpen]);

  if (!isOpen) return null;

  const rowClass = (userKey: string) =>
    `border-b border-slate-800/70 ${userKey === currentUserKey ? 'bg-cyan-500/10 text-cyan-100' : 'text-slate-200'}`;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl glass-panel rounded-2xl p-5 sm:p-6 max-h-[90dvh] overflow-y-auto flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ranking-title"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h2 id="ranking-title" className="text-lg font-bold font-display text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            랭킹
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2" role="tablist">
          {([
            ['song', '곡별 랭킹'],
            ['overall', '종합 랭킹'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                tab === key ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'song' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-700 text-sm text-white outline-none focus:border-cyan-500"
              aria-label="곡 선택"
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-4 gap-1">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-2 py-2 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    difficulty === d ? 'bg-slate-100 text-slate-950' : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-[11rem] flex-1 overflow-y-auto">
          {tab === 'song' ? (
            songBoard.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">아직 이 곡의 기록이 없습니다. 첫 번째 주인공이 되어 보세요!</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-slate-500 border-b border-slate-800">
                    <th className="py-2 w-10 text-center font-semibold">순위</th>
                    <th className="py-2 text-left font-semibold">아이디</th>
                    <th className="py-2 text-right font-semibold">점수</th>
                    <th className="py-2 text-center font-semibold">랭크</th>
                    <th className="py-2 text-right font-semibold hidden sm:table-cell">정확도</th>
                    <th className="py-2 text-right font-semibold hidden sm:table-cell">콤보</th>
                    <th className="py-2 text-right font-semibold hidden sm:table-cell pr-1">날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {songBoard.map((e) => (
                    <tr key={e.userKey} className={rowClass(e.userKey)}>
                      <td className="py-2"><div className="flex justify-center"><RankIcon rank={e.rank} /></div></td>
                      <td className="py-2 font-semibold truncate max-w-[8rem]">
                        {e.name}
                        {e.userKey === currentUserKey && <span className="ml-1 text-[10px] text-cyan-400">(나)</span>}
                      </td>
                      <td className="py-2 text-right font-mono">{e.score.score.toLocaleString()}</td>
                      <td className="py-2 text-center font-bold">{e.score.grade}</td>
                      <td className="py-2 text-right font-mono hidden sm:table-cell">{e.score.accuracy.toFixed(1)}%</td>
                      <td className="py-2 text-right font-mono hidden sm:table-cell">{e.score.maxCombo}</td>
                      <td className="py-2 text-right font-mono text-slate-500 hidden sm:table-cell pr-1">{formatDate(e.score.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : overall.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">아직 기록이 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-500 border-b border-slate-800">
                  <th className="py-2 w-10 text-center font-semibold">순위</th>
                  <th className="py-2 text-left font-semibold">아이디</th>
                  <th className="py-2 text-right font-semibold">총점</th>
                  <th className="py-2 text-right font-semibold">클리어 곡</th>
                  <th className="py-2 text-right font-semibold hidden sm:table-cell">S 이상</th>
                  <th className="py-2 text-right font-semibold hidden sm:table-cell">풀콤보</th>
                  <th className="py-2 text-right font-semibold hidden sm:table-cell pr-1">플레이</th>
                </tr>
              </thead>
              <tbody>
                {overall.map((e) => (
                  <tr key={e.userKey} className={rowClass(e.userKey)}>
                    <td className="py-2"><div className="flex justify-center"><RankIcon rank={e.rank} /></div></td>
                    <td className="py-2 font-semibold truncate max-w-[8rem]">
                      {e.name}
                      {e.userKey === currentUserKey && <span className="ml-1 text-[10px] text-cyan-400">(나)</span>}
                    </td>
                    <td className="py-2 text-right font-mono">{e.totalScore.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono">{e.chartsPlayed}</td>
                    <td className="py-2 text-right font-mono hidden sm:table-cell">{e.sRankCount}</td>
                    <td className="py-2 text-right font-mono hidden sm:table-cell">{e.fullComboCount}</td>
                    <td className="py-2 text-right font-mono text-slate-400 hidden sm:table-cell pr-1">{e.playCount}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[10px] text-slate-600">
          곡별 랭킹은 아이디마다 최고 점수 1개, 종합 랭킹은 모든 곡·난이도 최고 점수의 합계입니다. (이 기기 기준)
        </p>
      </div>
    </div>
  );
};
