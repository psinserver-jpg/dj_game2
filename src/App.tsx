/**
 * PulseBeat - Cyber Rhythm Arcade Application
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GameView,
  SongMetadata,
  DifficultyLevel,
  Note,
  JudgmentType,
  GameScore,
  GameSettings,
} from './types/game';
import { INITIAL_SONGS } from './data/songs';
import { IMAGES, getImage, getStageUrl } from './data/assets';
import { soundEngine } from './services/soundEngine';
import { storageService, DEFAULT_SETTINGS } from './services/storageService';

import { Navbar } from './components/Navbar';
import { TitleScreen } from './components/TitleScreen';
import { SongSelectScreen } from './components/SongSelectScreen';
import { RhythmGameCanvas } from './components/RhythmGameCanvas';
import { GameHUD } from './components/GameHUD';
import { PauseModal } from './components/PauseModal';
import { ResultScreen } from './components/ResultScreen';
import { SettingsModal } from './components/SettingsModal';
import { BeatmapEditorModal } from './components/BeatmapEditorModal';
import { HowToPlayModal } from './components/HowToPlayModal';

export default function App() {
  // Navigation & Modals
  const [currentView, setCurrentView] = useState<GameView>('TITLE');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Settings
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Songs & Selection
  const [allSongs, setAllSongs] = useState<SongMetadata[]>(INITIAL_SONGS);
  const [selectedSong, setSelectedSong] = useState<SongMetadata>(INITIAL_SONGS[0]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>('NORMAL');

  // Active Game State
  const [activeNotes, setActiveNotes] = useState<Note[]>([]);
  const [currentSongTime, setCurrentSongTime] = useState<number>(0);
  const [activeLanes, setActiveLanes] = useState<boolean[]>([false, false, false, false]);
  const [combo, setCombo] = useState<number>(0);
  const [maxCombo, setMaxCombo] = useState<number>(0);
  const [score, setScore] = useState<number>(0);
  const [grooveGauge, setGrooveGauge] = useState<number>(50);
  const [recentJudgment, setRecentJudgment] = useState<{
    text: JudgmentType;
    fastSlow?: 'FAST' | 'SLOW';
    timestamp: number;
    lane: number;
  } | null>(null);

  // Judgment tallies
  const judgmentCountsRef = useRef({
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
  });
  const timingDistRef = useRef({
    fast: 0,
    slow: 0,
  });

  // Result state
  const [lastGameScore, setLastGameScore] = useState<GameScore | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Game loop refs
  const isPlayingRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const activeNotesRef = useRef<Note[]>([]);
  const currentSongTimeRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Warm the image cache so gameplay sprites and the stage backdrop draw from the first frame
  useEffect(() => {
    [IMAGES.noteCyan, IMAGES.notePink, IMAGES.hitBurst].forEach(getImage);
  }, []);
  useEffect(() => {
    getImage(getStageUrl(selectedSong));
  }, [selectedSong]);

  // Load saved settings & custom songs on mount
  useEffect(() => {
    const savedSettings = storageService.getSettings();
    setSettings(savedSettings);

    const customSongs = storageService.getCustomSongs();
    if (customSongs.length > 0) {
      setAllSongs([...customSongs, ...INITIAL_SONGS]);
    }
  }, []);

  const handleSaveSettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
    storageService.saveSettings(newSettings);
  };

  // --- Start Game ---
  const handleStartGame = useCallback(() => {
    soundEngine.init();
    soundEngine.stopPreview();

    const chart = selectedSong.difficulties[selectedDifficulty];
    // Deep copy notes so mutation doesn't affect source beatmap
    const freshNotes: Note[] = chart.notes.map((n) => ({
      ...n,
      hit: false,
      holding: false,
      holdProgress: 0,
      judged: false,
    }));

    activeNotesRef.current = freshNotes;
    setActiveNotes(freshNotes);

    // Reset scores & gauges
    judgmentCountsRef.current = { perfect: 0, great: 0, good: 0, miss: 0 };
    timingDistRef.current = { fast: 0, slow: 0 };
    setCombo(0);
    setMaxCombo(0);
    setScore(0);
    setGrooveGauge(50);
    setRecentJudgment(null);
    setActiveLanes([false, false, false, false]);
    setIsPaused(false);

    setCurrentView('PLAYING');
    isPlayingRef.current = true;

    // Start synthesized track
    soundEngine.startSong(
      selectedSong.musicPatternId,
      selectedSong.bpm,
      selectedSong.duration,
      0
    );
  }, [selectedSong, selectedDifficulty]);

  // --- End Game & Calculate Results ---
  const handleEndGame = useCallback(() => {
    isPlayingRef.current = false;
    soundEngine.stop();

    const counts = judgmentCountsRef.current;
    const totalNotes = selectedSong.difficulties[selectedDifficulty].noteCount;
    const judgedTotal = counts.perfect + counts.great + counts.good + counts.miss;

    // If unjudged notes remain, count them as miss
    if (judgedTotal < totalNotes) {
      counts.miss += totalNotes - judgedTotal;
    }

    // Accurate scoring
    const accuracyPoints = counts.perfect * 1.0 + counts.great * 0.7 + counts.good * 0.4;
    const accuracy = totalNotes > 0 ? (accuracyPoints / totalNotes) * 100 : 0;

    // Score out of 1,000,000 (900k accuracy + 100k combo)
    const baseScore = totalNotes > 0 ? (accuracyPoints / totalNotes) * 900000 : 0;
    const comboScore = totalNotes > 0 ? (maxCombo / totalNotes) * 100000 : 0;
    const finalScore = Math.min(1000000, Math.round(baseScore + comboScore));

    // Grade calculation
    let grade: 'SSS' | 'SS' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F' = 'D';
    if (finalScore >= 990000) grade = 'SSS';
    else if (finalScore >= 970000) grade = 'SS';
    else if (finalScore >= 950000) grade = 'S';
    else if (finalScore >= 900000) grade = 'A';
    else if (finalScore >= 800000) grade = 'B';
    else if (finalScore >= 700000) grade = 'C';
    else grade = 'D';

    const isFullCombo = counts.miss === 0 && counts.good === 0 && totalNotes > 0;
    const isAllPerfect = counts.perfect === totalNotes && totalNotes > 0;

    const gameScore: GameScore = {
      score: finalScore,
      accuracy,
      maxCombo,
      counts: { ...counts },
      timingDistribution: { ...timingDistRef.current },
      grade,
      isFullCombo,
      isAllPerfect,
      timestamp: Date.now(),
    };

    const isRecord = storageService.saveScore(selectedSong.id, selectedDifficulty, gameScore);
    setIsNewRecord(isRecord);
    setLastGameScore(gameScore);
    setCurrentView('RESULT');
  }, [selectedSong, selectedDifficulty, maxCombo]);

  // --- Lane Input Press (Key Down / Touch Down) ---
  const handleLanePress = useCallback(
    (lane: number) => {
      if (!isPlayingRef.current || isPaused) return;

      // Update active visual lane
      setActiveLanes((prev) => {
        const next = [...prev];
        next[lane] = true;
        return next;
      });

      // Play hitsound immediately
      if (settingsRef.current.hitsoundEnabled) {
        soundEngine.playHitSound(lane);
      }

      // Find nearest unjudged note in this lane
      const currentTime = currentSongTimeRef.current;
      const notes = activeNotesRef.current;

      let closestNote: Note | null = null;
      let minDelta = Infinity;

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        if (note.lane === lane && !note.judged) {
          const delta = note.time - currentTime;
          // Look within a reasonable hit window: [-0.14s, +0.16s]
          if (delta > -0.14 && delta < 0.16) {
            if (Math.abs(delta) < Math.abs(minDelta)) {
              minDelta = delta;
              closestNote = note;
            }
          }
        }
      }

      if (!closestNote) return;

      const absDelta = Math.abs(minDelta);
      let judgment: JudgmentType = 'MISS';
      let fastSlow: 'FAST' | 'SLOW' | undefined = undefined;

      if (absDelta <= 0.045) {
        judgment = 'PERFECT';
      } else if (absDelta <= 0.085) {
        judgment = 'GREAT';
        fastSlow = minDelta > 0 ? 'FAST' : 'SLOW';
      } else if (absDelta <= 0.135) {
        judgment = 'GOOD';
        fastSlow = minDelta > 0 ? 'FAST' : 'SLOW';
      }

      if (judgment !== 'MISS') {
        if (fastSlow) {
          if (fastSlow === 'FAST') timingDistRef.current.fast++;
          else timingDistRef.current.slow++;
        }

        // Tally counts
        if (judgment === 'PERFECT') judgmentCountsRef.current.perfect++;
        if (judgment === 'GREAT') judgmentCountsRef.current.great++;
        if (judgment === 'GOOD') judgmentCountsRef.current.good++;

        // Update Combo & Score
        setCombo((prev) => {
          const next = prev + 1;
          setMaxCombo((m) => Math.max(m, next));
          return next;
        });

        const points = judgment === 'PERFECT' ? 300 : judgment === 'GREAT' ? 200 : 100;
        setScore((prev) => prev + points);

        // Groove gauge fill
        setGrooveGauge((prev) => Math.min(100, prev + (judgment === 'PERFECT' ? 2.2 : 1.2)));

        // Handle Hold Note
        if (closestNote.duration && closestNote.duration > 0) {
          closestNote.holding = true;
          closestNote.judgment = judgment;
        } else {
          closestNote.judged = true;
          closestNote.judgment = judgment;
        }

        setRecentJudgment({
          text: judgment,
          fastSlow,
          timestamp: performance.now(),
          lane,
        });
      }
    },
    [isPaused]
  );

  // --- Lane Input Release (Key Up / Touch Up) ---
  const handleLaneRelease = useCallback((lane: number) => {
    setActiveLanes((prev) => {
      const next = [...prev];
      next[lane] = false;
      return next;
    });

    if (!isPlayingRef.current) return;

    // Check if player was holding a long note
    const currentTime = currentSongTimeRef.current;
    const notes = activeNotesRef.current;

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.lane === lane && note.holding && !note.judged) {
        note.holding = false;
        const totalDuration = note.duration || 0;
        const heldDuration = currentTime - note.time;

        if (heldDuration >= totalDuration * 0.82) {
          // Successfully completed hold!
          note.judged = true;
          note.holdProgress = 1;
          setScore((s) => s + 200);
        } else {
          // Interrupted hold
          note.judged = true;
          judgmentCountsRef.current.miss++;
          setCombo(0);
          setGrooveGauge((prev) => Math.max(0, prev - 5));
          setRecentJudgment({
            text: 'MISS',
            timestamp: performance.now(),
            lane,
          });
        }
      }
    }
  }, []);

  // --- Global Keyboard Listeners ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentView !== 'PLAYING') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPaused((prev) => {
          if (!prev) {
            soundEngine.pause();
            return true;
          } else {
            soundEngine.resume();
            return false;
          }
        });
        return;
      }

      if (isPaused) return;

      const key = e.key.toLowerCase();
      const laneIndex = settings.keyBindings.findIndex((k) => k.toLowerCase() === key);
      if (laneIndex !== -1 && !activeLanes[laneIndex]) {
        e.preventDefault();
        handleLanePress(laneIndex);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (currentView !== 'PLAYING') return;

      const key = e.key.toLowerCase();
      const laneIndex = settings.keyBindings.findIndex((k) => k.toLowerCase() === key);
      if (laneIndex !== -1) {
        e.preventDefault();
        handleLaneRelease(laneIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [currentView, isPaused, settings.keyBindings, activeLanes, handleLanePress, handleLaneRelease]);

  // --- High-Performance Game Clock Loop ---
  useEffect(() => {
    if (currentView !== 'PLAYING' || isPaused) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const checkNotesAndClock = () => {
      if (!isPlayingRef.current) return;

      // Current hardware time + latency offset compensation
      const offsetSec = settingsRef.current.audioOffsetMs / 1000;
      const rawTime = soundEngine.getCurrentTime();
      const accurateTime = Math.max(0, rawTime - offsetSec);

      currentSongTimeRef.current = accurateTime;
      setCurrentSongTime(accurateTime);

      const notes = activeNotesRef.current;
      let hasUnjudged = false;

      // 1. Process Missed Notes & Active Holds
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        if (!note.judged) {
          hasUnjudged = true;

          // If note is currently being held
          if (note.holding && note.duration) {
            const heldDuration = accurateTime - note.time;
            note.holdProgress = Math.min(1, heldDuration / note.duration);

            if (heldDuration >= note.duration) {
              note.judged = true;
              note.holding = false;
              note.holdProgress = 1;
              setScore((s) => s + 150);
            }
          }
          // Note passed judgment line without hit
          else if (accurateTime - note.time > 0.135) {
            note.judged = true;
            note.judgment = 'MISS';
            judgmentCountsRef.current.miss++;
            setCombo(0);
            setGrooveGauge((g) => Math.max(0, g - 6));
            setRecentJudgment({
              text: 'MISS',
              timestamp: performance.now(),
              lane: note.lane,
            });
          }
        }
      }

      // 2. Check song completion condition
      const songDuration = selectedSong.duration;
      if (accurateTime >= songDuration || (!hasUnjudged && accurateTime > 10 && accurateTime >= notes[notes.length - 1]?.time + 2.0)) {
        handleEndGame();
        return;
      }

      animFrameRef.current = requestAnimationFrame(checkNotesAndClock);
    };

    animFrameRef.current = requestAnimationFrame(checkNotesAndClock);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [currentView, isPaused, selectedSong, handleEndGame]);

  // Current live accuracy calculation
  const currentTotal =
    judgmentCountsRef.current.perfect +
    judgmentCountsRef.current.great +
    judgmentCountsRef.current.good +
    judgmentCountsRef.current.miss;
  const currentAccuracy =
    currentTotal > 0
      ? ((judgmentCountsRef.current.perfect * 1.0 +
          judgmentCountsRef.current.great * 0.7 +
          judgmentCountsRef.current.good * 0.4) /
          currentTotal) *
        100
      : 100;

  // Custom song saving
  const handleSaveCustomSong = (newSong: SongMetadata) => {
    storageService.saveCustomSong(newSong);
    setAllSongs([newSong, ...allSongs.filter((s) => s.id !== newSong.id)]);
    setSelectedSong(newSong);
    setCurrentView('SONG_SELECT');
  };

  const handleDeleteCustomSong = (id: string) => {
    storageService.deleteCustomSong(id);
    const filtered = allSongs.filter((s) => s.id !== id);
    setAllSongs(filtered);
    if (selectedSong.id === id) {
      setSelectedSong(filtered[0] || INITIAL_SONGS[0]);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b12] text-slate-100 flex flex-col font-sans select-none overflow-x-hidden">
      {/* 3-Zone Top Navigation Bar */}
      <Navbar
        currentView={currentView}
        onNavigate={(view) => {
          soundEngine.stop();
          soundEngine.stopPreview();
          setCurrentView(view);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenHowToPlay={() => setIsHowToPlayOpen(true)}
      />

      {/* Main View Router */}
      <main className="flex-1 relative flex flex-col">
        {currentView === 'TITLE' && (
          <TitleScreen
            onStart={() => setCurrentView('SONG_SELECT')}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenHowToPlay={() => setIsHowToPlayOpen(true)}
          />
        )}

        {currentView === 'SONG_SELECT' && (
          <SongSelectScreen
            songs={allSongs}
            selectedSong={selectedSong}
            selectedDifficulty={selectedDifficulty}
            settings={settings}
            onSelectSong={setSelectedSong}
            onSelectDifficulty={setSelectedDifficulty}
            onChangeSpeed={(speed) => handleSaveSettings({ ...settings, scrollSpeed: speed })}
            onStartGame={handleStartGame}
            onOpenEditor={() => setCurrentView('BEATMAP_EDITOR')}
            onDeleteCustomSong={handleDeleteCustomSong}
          />
        )}

        {currentView === 'PLAYING' && (
          <div className="relative w-full h-[100vh] flex flex-col items-center justify-center overflow-hidden bg-[#080b12]">
            {/* Top/Bottom HUD Overlay */}
            <GameHUD
              songTitle={selectedSong.title}
              difficulty={selectedDifficulty}
              score={score}
              accuracy={currentAccuracy}
              grooveGauge={grooveGauge}
              keyBindings={settings.keyBindings}
              activeLanes={activeLanes}
              onPause={() => {
                soundEngine.pause();
                setIsPaused(true);
              }}
              onLanePress={handleLanePress}
              onLaneRelease={handleLaneRelease}
            />

            {/* Canvas Highway */}
            <RhythmGameCanvas
              notes={activeNotes}
              currentSongTime={currentSongTime}
              settings={settings}
              activeLanes={activeLanes}
              combo={combo}
              grooveGauge={grooveGauge}
              recentJudgment={recentJudgment}
              backgroundUrl={getStageUrl(selectedSong)}
              onLanePress={handleLanePress}
              onLaneRelease={handleLaneRelease}
            />
          </div>
        )}

        {currentView === 'RESULT' && lastGameScore && (
          <ResultScreen
            score={lastGameScore}
            song={selectedSong}
            difficulty={selectedDifficulty}
            isNewRecord={isNewRecord}
            onRetry={handleStartGame}
            onSongSelect={() => setCurrentView('SONG_SELECT')}
          />
        )}

        {currentView === 'BEATMAP_EDITOR' && (
          <div className="p-6">
            <BeatmapEditorModal
              isOpen={true}
              onSaveCustomSong={handleSaveCustomSong}
              onClose={() => setCurrentView('SONG_SELECT')}
            />
          </div>
        )}
      </main>

      {/* Global Modals */}
      {isPaused && (
        <PauseModal
          onResume={() => {
            soundEngine.resume();
            setIsPaused(false);
          }}
          onRetry={handleStartGame}
          onExit={() => {
            soundEngine.stop();
            isPlayingRef.current = false;
            setIsPaused(false);
            setCurrentView('SONG_SELECT');
          }}
          settings={settings}
          onUpdateSpeed={(speed) => handleSaveSettings({ ...settings, scrollSpeed: speed })}
          onUpdateOffset={(offset) => handleSaveSettings({ ...settings, audioOffsetMs: offset })}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />

      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        keyBindings={settings.keyBindings}
        onClose={() => setIsHowToPlayOpen(false)}
      />
    </div>
  );
}
