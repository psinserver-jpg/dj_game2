/**
 * PulseBeat - Cyber Rhythm Arcade Application
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  GameView,
  SongMetadata,
  DifficultyLevel,
  Note,
  JudgmentType,
  GameScore,
  GameSettings,
  HitSample,
} from './types/game';
import { computeTimingStats } from './services/timing';
import { INITIAL_SONGS } from './data/songs';
import { IMAGES, getImage, getStageUrl } from './data/assets';
import { soundEngine } from './services/soundEngine';
import { storageService, DEFAULT_SETTINGS } from './services/storageService';
import { loadGeneratedSongs } from './services/musicLibrary';

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
  const isModalOpen = isSettingsOpen || isHowToPlayOpen;

  // Settings
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // Songs & Selection
  const [customSongs, setCustomSongs] = useState<SongMetadata[]>([]);
  const [generatedSongs, setGeneratedSongs] = useState<SongMetadata[]>([]);
  const allSongs = useMemo(() => {
    // Custom > generated; the built-in synth-only songs are just a fallback for when the generated
    // tracks can't be loaded (offline / missing manifest). The first song with an id wins.
    const seen = new Set<string>();
    const base = generatedSongs.length ? generatedSongs : INITIAL_SONGS;
    return [...customSongs, ...base].filter((song) => {
      if (seen.has(song.id)) return false;
      seen.add(song.id);
      return true;
    });
  }, [customSongs, generatedSongs]);
  const [selectedSong, setSelectedSong] = useState<SongMetadata>(INITIAL_SONGS[0]);
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyLevel>('NORMAL');
  const hasPickedSongRef = useRef(false);

  // Generated tracks are fetched + decoded before a run can start
  const [isLoadingSong, setIsLoadingSong] = useState(false);
  const isLoadingSongRef = useRef(false);
  const startRequestRef = useRef(0); // bumped when a pending start should be abandoned
  const selectedDifficultyRef = useRef(selectedDifficulty);
  selectedDifficultyRef.current = selectedDifficulty;

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
    offsetMs?: number;
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
  // Signed hit offsets of this play (ms, negative = early) and the last few for the timing bar
  const hitOffsetsRef = useRef<number[]>([]);
  const [recentHits, setRecentHits] = useState<HitSample[]>([]);

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

  // Mobile browsers only start audio after a user gesture: resume the context on the first touch/key
  useEffect(() => {
    const unlock = () => soundEngine.init();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Leaving the tab / app (phone call, home button) pauses the song instead of letting it run on
  useEffect(() => {
    if (currentView !== 'PLAYING' || isPaused) return;
    const onHide = () => {
      if (document.hidden) {
        soundEngine.pause();
        setIsPaused(true);
      }
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [currentView, isPaused]);

  // Warm the image cache so gameplay sprites and the stage backdrop draw from the first frame
  useEffect(() => {
    // title-bg is the stand-in when a song's stage art is missing
    [IMAGES.noteCyan, IMAGES.notePink, IMAGES.hitBurst, IMAGES.titleBackground].forEach(getImage);
  }, []);
  useEffect(() => {
    getImage(getStageUrl(selectedSong));
  }, [selectedSong]);

  // Load saved settings, custom songs & generated songs on mount
  useEffect(() => {
    const savedSettings = storageService.getSettings();
    setSettings(savedSettings);
    setCustomSongs(storageService.getCustomSongs());

    let cancelled = false;
    loadGeneratedSongs().then((generated) => {
      if (cancelled || generated.length === 0) return;
      setGeneratedSongs(generated);
      // Open on the first generated song unless the player already chose something
      if (!hasPickedSongRef.current) setSelectedSong(generated[0]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the engine on the saved volumes (it keeps them until the AudioContext exists)
  useEffect(() => {
    soundEngine.setVolumes(settings.musicVolume, settings.sfxVolume);
  }, [settings.musicVolume, settings.sfxVolume]);

  // Start fetching/decoding the selected generated track so the run can begin right away.
  // The short delay skips songs the player only scrolls past (each decode is ~40 MB of PCM).
  useEffect(() => {
    const url = selectedSong.audioUrl;
    if (!url) return;
    const timer = window.setTimeout(() => {
      soundEngine.loadAudio(url).catch((err) => {
        console.warn(`[App] Could not preload ${url}:`, err);
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [selectedSong.audioUrl]);

  // Changing the song, leaving the screen or opening a modal abandons a start that is still
  // waiting for audio (otherwise the run would begin hidden behind the modal).
  // The load itself keeps going, so starting again later uses the cached track.
  useEffect(() => {
    startRequestRef.current++;
    isLoadingSongRef.current = false;
    setIsLoadingSong(false);
  }, [selectedSong, currentView, isSettingsOpen, isHowToPlayOpen]);

  const handleSelectSong = useCallback((song: SongMetadata) => {
    hasPickedSongRef.current = true;
    setSelectedSong(song);
  }, []);

  const handleSaveSettings = (newSettings: GameSettings) => {
    setSettings(newSettings);
    storageService.saveSettings(newSettings);
  };

  // --- Start Game ---
  const beginPlay = useCallback((song: SongMetadata, difficulty: DifficultyLevel, audio?: AudioBuffer) => {
    const chart = song.difficulties[difficulty];
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
    hitOffsetsRef.current = [];
    setRecentHits([]);
    setCombo(0);
    setMaxCombo(0);
    setScore(0);
    setGrooveGauge(50);
    setRecentJudgment(null);
    setActiveLanes([false, false, false, false]);
    setIsPaused(false);

    setCurrentView('PLAYING');
    isPlayingRef.current = true;

    // Start the generated track, or the synthesized arrangement when there is no buffer
    soundEngine.startSong(song.musicPatternId, song.bpm, song.duration, 0, audio);
  }, []);

  const handleStartGame = useCallback(async () => {
    if (isLoadingSongRef.current) return; // already waiting for this song's audio
    soundEngine.init(); // inside the click/key gesture, so the AudioContext may start
    soundEngine.stopPreview();

    const song = selectedSong;
    hasPickedSongRef.current = true; // never swap the song under a run that is starting
    if (!song.audioUrl) {
      beginPlay(song, selectedDifficultyRef.current);
      return;
    }

    const cached = soundEngine.getLoadedAudio(song.audioUrl);
    if (cached) {
      beginPlay(song, selectedDifficultyRef.current, cached);
      return;
    }

    const request = ++startRequestRef.current;
    isLoadingSongRef.current = true;
    setIsLoadingSong(true);
    let audio: AudioBuffer | null = null;
    try {
      audio = await soundEngine.loadAudio(song.audioUrl);
    } catch (err) {
      console.warn(`[App] Could not load ${song.audioUrl}:`, err);
    }
    if (request !== startRequestRef.current) return; // song changed or player navigated away

    isLoadingSongRef.current = false;
    setIsLoadingSong(false);
    if (!audio) {
      alert('음원을 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    // Difficulty may have been changed while loading; use the latest pick
    beginPlay(song, selectedDifficultyRef.current, audio);
  }, [selectedSong, beginPlay]);

  // --- End Game & Calculate Results ---
  const handleEndGame = useCallback(() => {
    isPlayingRef.current = false;
    soundEngine.fadeOutAndStop();

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
      timing: computeTimingStats(hitOffsetsRef.current, settingsRef.current.audioOffsetMs),
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

      // Find nearest unjudged note in this lane. Read the audio clock now instead of the value
      // from the last animation frame, which can be up to a frame (~16 ms) old.
      const currentTime = Math.max(0, soundEngine.getCurrentTime() - settingsRef.current.audioOffsetMs / 1000);
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

        const offsetMs = Math.round(-minDelta * 1000);
        hitOffsetsRef.current.push(offsetMs);
        const now = performance.now();
        setRecentHits((prev) => [...prev.slice(-24), { offsetMs, judgment, at: now }]);

        setRecentJudgment({
          text: judgment,
          fastSlow,
          offsetMs,
          timestamp: now,
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
      let lastNoteEnd = 0; // includes hold tails

      // 1. Process Missed Notes & Active Holds
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        lastNoteEnd = Math.max(lastNoteEnd, note.time + (note.duration ?? 0));

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

      // 2. Check song completion condition. Generated tracks play out to their real end (the
      // chart already leaves out a silent tail); looping synth songs stop 2s after the last note.
      const isOverEarly =
        !selectedSong.audioUrl &&
        notes.length > 0 &&
        !hasUnjudged &&
        accurateTime > 10 &&
        accurateTime >= lastNoteEnd + 2.0;
      if (accurateTime >= selectedSong.duration || isOverEarly) {
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
    setCustomSongs((prev) => [newSong, ...prev.filter((s) => s.id !== newSong.id)]);
    handleSelectSong(newSong);
    setCurrentView('SONG_SELECT');
  };

  const handleDeleteCustomSong = (id: string) => {
    storageService.deleteCustomSong(id);
    setCustomSongs((prev) => prev.filter((s) => s.id !== id));
    if (selectedSong.id === id) {
      handleSelectSong(allSongs.find((s) => s.id !== id) || INITIAL_SONGS[0]);
    }
  };

  return (
    <div className="h-[100dvh] bg-[#080b12] text-slate-100 flex flex-col font-sans select-none overflow-hidden">
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
      {/* Screens scroll inside main, so nothing is ever cut off below the fold */}
      <main className="flex-1 min-h-0 relative flex flex-col overflow-y-auto overflow-x-hidden">
        {currentView === 'TITLE' && (
          <TitleScreen
            onStart={() => setCurrentView('SONG_SELECT')}
            keyboardEnabled={!isModalOpen}
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
            onSelectSong={handleSelectSong}
            onSelectDifficulty={setSelectedDifficulty}
            onChangeSpeed={(speed) => handleSaveSettings({ ...settings, scrollSpeed: speed })}
            onStartGame={handleStartGame}
            onOpenEditor={() => setCurrentView('BEATMAP_EDITOR')}
            onDeleteCustomSong={handleDeleteCustomSong}
            keyboardEnabled={!isModalOpen}
            isLoading={isLoadingSong}
          />
        )}

        {currentView === 'PLAYING' && (
          <div className="relative w-full flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden bg-[#080b12]">
            {/* Top/Bottom HUD Overlay */}
            <GameHUD
              songTitle={selectedSong.title}
              difficulty={selectedDifficulty}
              score={score}
              accuracy={currentAccuracy}
              counts={judgmentCountsRef.current}
              meanOffsetMs={
                hitOffsetsRef.current.length
                  ? hitOffsetsRef.current.reduce((a, b) => a + b, 0) / hitOffsetsRef.current.length
                  : null
              }
              grooveGauge={grooveGauge}
              progress={selectedSong.duration > 0 ? currentSongTime / selectedSong.duration : 0}
              onPause={() => {
                soundEngine.pause();
                setIsPaused(true);
              }}
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
              recentHits={recentHits}
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
            audioOffsetMs={settings.audioOffsetMs}
            onApplyOffset={(offset) => handleSaveSettings({ ...settings, audioOffsetMs: offset })}
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
