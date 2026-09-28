import React, { useState, useEffect, useRef } from 'react';
import { SongMetadata, Note, DifficultyLevel, Beatmap } from '../types/game';
import { soundEngine } from '../services/soundEngine';
import { IMAGES } from '../data/assets';
import { Play, Pause, Square, Save, X, Plus, Trash2, Music, Upload } from 'lucide-react';

interface BeatmapEditorModalProps {
  isOpen: boolean;
  onSaveCustomSong: (song: SongMetadata) => void;
  onClose: () => void;
}

export const BeatmapEditorModal: React.FC<BeatmapEditorModalProps> = ({
  isOpen,
  onSaveCustomSong,
  onClose,
}) => {
  const [title, setTitle] = useState('My Custom Track');
  const [artist, setArtist] = useState('DJ Creator');
  const [bpm, setBpm] = useState(130);
  const [duration, setDuration] = useState(60);
  const [patternId, setPatternId] = useState<'neon_velocity' | 'midnight_tokyo' | 'solar_overdrive' | 'starlight_lullaby'>('neon_velocity');
  
  // Custom audio file state
  const [customAudioFile, setCustomAudioFile] = useState<File | null>(null);
  const [customAudioBuffer, setCustomAudioBuffer] = useState<AudioBuffer | null>(null);

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const animRef = useRef<number | null>(null);

  // Sync clock during playback / recording
  useEffect(() => {
    if (!isPlaying && !isRecording) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const updateClock = () => {
      const cur = soundEngine.getCurrentTime();
      setCurrentTime(cur);

      if (cur >= duration) {
        handleStop();
        return;
      }

      animRef.current = requestAnimationFrame(updateClock);
    };

    animRef.current = requestAnimationFrame(updateClock);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, isRecording, duration]);

  // Handle key press for live note recording
  useEffect(() => {
    if (!isRecording) return;

    const keyLaneMap: Record<string, number> = {
      d: 0,
      f: 1,
      j: 2,
      k: 3,
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const lane = keyLaneMap[e.key.toLowerCase()];
      if (lane !== undefined) {
        soundEngine.playHitSound(lane);
        const t = Number(soundEngine.getCurrentTime().toFixed(3));
        setNotes((prev) => [
          ...prev,
          {
            id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            lane,
            time: t,
          },
        ]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCustomAudioFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
      const buffer = await soundEngine.decodeAudioFile(file);
      setCustomAudioBuffer(buffer);
      setDuration(Math.round(buffer.duration));
    } catch {
      alert('오디오 파일을 디코딩하는데 실패했습니다.');
    }
  };

  const handleStartRecording = () => {
    soundEngine.init();
    setNotes([]);
    setIsRecording(true);
    setIsPlaying(true);
    soundEngine.startSong(patternId, bpm, duration, 0, customAudioBuffer || undefined);
  };

  const handlePlayPreview = () => {
    soundEngine.init();
    setIsPlaying(true);
    setIsRecording(false);
    soundEngine.startSong(patternId, bpm, duration, 0, customAudioBuffer || undefined);
  };

  const handleStop = () => {
    soundEngine.stop();
    setIsPlaying(false);
    setIsRecording(false);
    setCurrentTime(0);
  };

  const handleSave = () => {
    if (notes.length === 0) {
      alert('최소 1개 이상의 노트를 기록해야 저장할 수 있습니다. [녹음 시작]을 누르고 D, F, J, K 키를 리듬에 맞춰 눌러보세요!');
      return;
    }

    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);

    const beatmap: Beatmap = {
      difficulty: 'NORMAL',
      level: Math.min(12, Math.max(1, Math.round(sortedNotes.length / 15))),
      notes: sortedNotes,
      noteCount: sortedNotes.length,
    };

    const newSong: SongMetadata = {
      id: `custom_${Date.now()}`,
      title,
      artist,
      bpm,
      genre: customAudioBuffer ? 'Custom Audio' : 'User Created',
      duration,
      coverUrl: IMAGES.customCover,
      previewStart: 5,
      previewDuration: 10,
      musicPatternId: customAudioBuffer ? 'custom' : patternId,
      difficulties: {
        EASY: beatmap,
        NORMAL: beatmap,
        HARD: beatmap,
        EXPERT: beatmap,
      },
    };

    handleStop();
    onSaveCustomSong(newSong);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-bold font-display text-white">커스텀 비트맵 스튜디오</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              실시간 탭 녹음으로 나만의 4키 리듬 채보를 만들어보세요.
            </p>
          </div>
          <button
            onClick={() => {
              handleStop();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">곡 제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">아티스트</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">BPM</label>
            <input
              type="number"
              min="60"
              max="220"
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">신스 배경 음악 테마</label>
            <select
              value={patternId}
              disabled={!!customAudioBuffer}
              onChange={(e) => setPatternId(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="neon_velocity">Cyberpunk DnB (140 BPM)</option>
              <option value="midnight_tokyo">Synthwave 80s (115 BPM)</option>
              <option value="solar_overdrive">Speedcore Chiptune (160 BPM)</option>
              <option value="starlight_lullaby">Lo-Fi Future (95 BPM)</option>
            </select>
          </div>
        </div>

        {/* Audio File Upload Option */}
        <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              <span>내 오디오 파일 불러오기 (MP3 / WAV)</span>
            </div>
            <p className="text-[11px] text-slate-400 truncate mt-0.5">
              {customAudioFile ? `선택된 파일: ${customAudioFile.name}` : '원하는 음악 파일을 업로드하여 채보를 제작할 수 있습니다.'}
            </p>
          </div>

          <label className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded cursor-pointer whitespace-nowrap">
            파일 선택
            <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Live Recording Console */}
        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 text-center space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              기록된 노트: <strong className="text-cyan-400 font-mono text-sm">{notes.length}</strong>개
            </span>
            <span className="font-mono text-white text-sm">
              {currentTime.toFixed(1)}s / {duration}s
            </span>
          </div>

          {/* Time progress bar */}
          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-cyan-400 transition-all duration-75"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            />
          </div>

          {/* Key Hints */}
          {isRecording && (
            <div className="p-4 bg-cyan-950/30 border border-cyan-500/40 rounded-lg text-cyan-300 text-xs animate-pulse">
              🔥 <strong>실시간 녹음 중!</strong> 지금 키보드의 <strong>D · F · J · K</strong> 키를
              리듬에 맞춰 탭하세요!
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 pt-2">
            {!isRecording && !isPlaying ? (
              <>
                <button
                  onClick={handleStartRecording}
                  className="px-5 py-2.5 bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg shadow-rose-500/20 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  <span>실시간 탭 녹음 시작</span>
                </button>

                <button
                  onClick={handlePlayPreview}
                  disabled={notes.length === 0}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>노트 재생 확인</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleStop}
                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current text-rose-400" />
                <span>정지 (STOP)</span>
              </button>
            )}

            {notes.length > 0 && !isRecording && (
              <button
                onClick={() => setNotes([])}
                className="px-3 py-2.5 text-xs text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>노트 초기화</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
          <button
            onClick={() => {
              handleStop();
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            취소
          </button>

          <button
            onClick={handleSave}
            disabled={notes.length === 0}
            className="px-6 py-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-40 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>곡 저장 & 플레이</span>
          </button>
        </div>
      </div>
    </div>
  );
};
