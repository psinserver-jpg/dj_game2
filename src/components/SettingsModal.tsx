import React, { useState, useEffect } from 'react';
import { GameSettings } from '../types/game';
import { soundEngine } from '../services/soundEngine';
import { X, Volume2, Keyboard, Eye, Clock, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../services/storageService';

interface SettingsModalProps {
  isOpen: boolean;
  settings: GameSettings;
  onSave: (settings: GameSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [localSettings, setLocalSettings] = useState<GameSettings>(settings);
  const [listeningLane, setListeningLane] = useState<number | null>(null);
  const [isMetronomeActive, setIsMetronomeActive] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  // Handle key binding listener
  useEffect(() => {
    if (listeningLane === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const newKey = e.key.toLowerCase();
      // Exclude escape or tab
      if (newKey === 'escape') {
        setListeningLane(null);
        return;
      }

      const updatedKeys = [...localSettings.keyBindings] as [string, string, string, string];
      updatedKeys[listeningLane] = newKey;

      const updated = { ...localSettings, keyBindings: updatedKeys };
      setLocalSettings(updated);
      onSave(updated);
      setListeningLane(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningLane, localSettings, onSave]);

  // Metronome sync test loop
  useEffect(() => {
    if (!isMetronomeActive) return;

    soundEngine.init();
    const interval = setInterval(() => {
      soundEngine.playCalibrationMetronome();
    }, 500); // 120 BPM beat

    return () => clearInterval(interval);
  }, [isMetronomeActive]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onSave(updated);

    if (key === 'musicVolume' || key === 'sfxVolume') {
      soundEngine.setVolumes(updated.musicVolume, updated.sfxVolume);
    }
  };

  const handleReset = () => {
    setLocalSettings(DEFAULT_SETTINGS);
    onSave(DEFAULT_SETTINGS);
    soundEngine.setVolumes(DEFAULT_SETTINGS.musicVolume, DEFAULT_SETTINGS.sfxVolume);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-display text-white">환경 설정</h2>
          </div>
          <button
            onClick={() => {
              setIsMetronomeActive(false);
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Key Bindings */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase">
            <Keyboard className="w-4 h-4 text-cyan-400" />
            <span>4키 키 매핑</span>
          </div>
          <p className="text-xs text-slate-400">
            변경할 레인 버튼을 누른 뒤 원하는 키를 입력하세요.
          </p>

          <div className="grid grid-cols-4 gap-2 pt-1">
            {localSettings.keyBindings.map((key, lane) => (
              <button
                key={lane}
                onClick={() => setListeningLane(lane)}
                className={`py-3 rounded-lg border text-center font-mono font-bold transition-all cursor-pointer ${
                  listeningLane === lane
                    ? 'bg-cyan-500 text-slate-950 border-white ring-2 ring-cyan-400 animate-pulse'
                    : 'bg-slate-950/70 border-slate-800 text-cyan-400 hover:border-slate-700'
                }`}
              >
                <div className="text-[10px] text-slate-500 font-sans">LANE {lane + 1}</div>
                <div className="text-lg uppercase">
                  {listeningLane === lane ? '입력 대기' : key}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Audio Latency Calibration */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>오디오 싱크 오프셋 (지연 보정)</span>
            </div>
            <span className="font-mono text-xs font-bold text-amber-400">
              {localSettings.audioOffsetMs > 0
                ? `+${localSettings.audioOffsetMs}`
                : localSettings.audioOffsetMs}{' '}
              ms
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-snug">
            블루투스 이어폰이나 사운드카드 지연 시 값을 조절하여 정확한 판정을 맞추세요.
          </p>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="-150"
              max="150"
              step="5"
              value={localSettings.audioOffsetMs}
              onChange={(e) => handleChange('audioOffsetMs', parseInt(e.target.value, 10))}
              className="flex-1 accent-amber-400 cursor-pointer"
            />
            <button
              onClick={() => setIsMetronomeActive(!isMetronomeActive)}
              className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                isMetronomeActive
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isMetronomeActive ? '비트 정지' : '비트 테스트'}
            </button>
          </div>
        </div>

        {/* 3. Audio Volume */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase">
            <Volume2 className="w-4 h-4 text-emerald-400" />
            <span>음량 조절</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>배경 음악 (BGM)</span>
                <span className="font-mono">{Math.round(localSettings.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={localSettings.musicVolume}
                onChange={(e) => handleChange('musicVolume', parseFloat(e.target.value))}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>타격 효과음 (Hitsound)</span>
                <span className="font-mono">{Math.round(localSettings.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={localSettings.sfxVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  handleChange('sfxVolume', val);
                  soundEngine.playHitSound(0);
                }}
                className="w-full accent-emerald-400 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 4. Visual Preferences */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300 uppercase">
            <Eye className="w-4 h-4 text-purple-400" />
            <span>화면 및 표시</span>
          </div>

          {/* Perspective View Toggle */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">화면 시점</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => handleChange('perspectiveMode', '3D')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  localSettings.perspectiveMode === '3D'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                3D 고속도로
              </button>
              <button
                onClick={() => handleChange('perspectiveMode', '2D')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                  localSettings.perspectiveMode === '2D'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                2D 클래식
              </button>
            </div>
          </div>

          {/* Background Dim */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>배경 어둡기 (BGA Dim)</span>
              <span className="font-mono">{Math.round(localSettings.backgroundDim * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="0.85"
              step="0.05"
              value={localSettings.backgroundDim}
              onChange={(e) => handleChange('backgroundDim', parseFloat(e.target.value))}
              className="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          {/* FAST / SLOW toggle */}
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-slate-300">FAST / SLOW 판정 타이밍 표시</span>
            <input
              type="checkbox"
              checked={localSettings.showFastSlow}
              onChange={(e) => handleChange('showFastSlow', e.target.checked)}
              className="w-4 h-4 accent-cyan-400 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>기본값 초기화</span>
          </button>

          <button
            onClick={() => {
              setIsMetronomeActive(false);
              onClose();
            }}
            className="px-5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
          >
            설정 완료
          </button>
        </div>
      </div>
    </div>
  );
};
