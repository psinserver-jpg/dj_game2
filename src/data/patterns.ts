/**
 * Built-in synth arrangements, expressed as data.
 * The sound engine plays these events and the chart generator reads the same events,
 * so every note in a built-in song lands on something you can actually hear.
 */

export type SynthPatternId = 'neon_velocity' | 'midnight_tokyo' | 'solar_overdrive' | 'starlight_lullaby';

export type PatternEvent =
  | { inst: 'kick'; accent: number }
  | { inst: 'snare'; accent: number }
  | { inst: 'hat'; open: boolean }
  | { inst: 'bass'; freq: number; steps: number }
  | { inst: 'lead'; freq: number; steps: number; wave: OscillatorType }
  | { inst: 'chord'; freqs: number[]; steps: number };

/** Events for one 16th-note step (4 steps per beat). Durations are in steps. */
export function getPatternEvents(patternId: string, step: number): PatternEvent[] {
  const beat = Math.floor(step / 4);
  const subStep = step % 4;
  const ev: PatternEvent[] = [];

  if (patternId === 'neon_velocity') {
    // DnB / Cyberpunk: 140 BPM breakbeat
    if (beat % 4 === 0 && subStep === 0) ev.push({ inst: 'kick', accent: 1.0 });
    if (beat % 4 === 2 && subStep === 2) ev.push({ inst: 'kick', accent: 0.9 });
    if ((beat % 4 === 1 || beat % 4 === 3) && subStep === 0) ev.push({ inst: 'snare', accent: 1.0 });
    ev.push({ inst: 'hat', open: subStep === 2 });

    // Bass: F2, G#2, D#2, C2 progression
    const bassProg = [87.31, 87.31, 103.83, 77.78, 65.41, 65.41, 77.78, 87.31];
    if (subStep === 0 || (subStep === 2 && beat % 2 === 1)) {
      ev.push({ inst: 'bass', freq: bassProg[Math.floor(beat / 2) % bassProg.length], steps: 1.8 });
    }

    // Fast arpeggio from bar 2
    const melodyNotes = [349.23, 415.3, 523.25, 622.25, 698.46, 523.25, 415.3, 349.23];
    if (beat >= 4) {
      ev.push({ inst: 'lead', freq: melodyNotes[step % melodyNotes.length], steps: 0.9, wave: 'sawtooth' });
    }
  } else if (patternId === 'midnight_tokyo') {
    // Synthwave / City Pop: 115 BPM four-on-the-floor
    if (subStep === 0) ev.push({ inst: 'kick', accent: 1.0 });
    if ((beat % 4 === 1 || beat % 4 === 3) && subStep === 0) ev.push({ inst: 'snare', accent: 1.1 });
    if (subStep === 2) ev.push({ inst: 'hat', open: false });

    const root = [110, 110, 130.81, 98.0][Math.floor(beat / 4) % 4];
    ev.push({ inst: 'bass', freq: subStep % 2 === 0 ? root : root * 2, steps: 0.85 });

    if (subStep === 0 && beat % 2 === 0) {
      const chords = [
        [220, 261.63, 329.63, 415.3], // Am7
        [261.63, 329.63, 392.0, 493.88], // Cmaj7
        [174.61, 220.0, 261.63, 329.63], // Fmaj7
        [196.0, 246.94, 293.66, 369.99], // G7
      ];
      ev.push({ inst: 'chord', freqs: chords[Math.floor(beat / 4) % 4], steps: 7 });
    }

    if (subStep === 0 && beat % 2 === 1) {
      const leadScale = [440, 493.88, 523.25, 659.25, 783.99];
      ev.push({ inst: 'lead', freq: leadScale[(beat * 3) % leadScale.length], steps: 3.5, wave: 'triangle' });
    }
  } else if (patternId === 'solar_overdrive') {
    // Speedcore / Chiptune: 160 BPM
    if (subStep === 0) ev.push({ inst: 'kick', accent: 1.1 });
    if (beat % 2 === 1 && subStep === 0) ev.push({ inst: 'snare', accent: 0.95 });
    ev.push({ inst: 'hat', open: subStep === 1 || subStep === 3 });

    const roots = [130.81, 146.83, 164.81, 196.0];
    ev.push({ inst: 'bass', freq: roots[Math.floor(beat / 4) % roots.length], steps: 0.9 });

    const chipScale = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25];
    ev.push({ inst: 'lead', freq: chipScale[step % chipScale.length], steps: 0.75, wave: 'square' });
  } else if (patternId === 'starlight_lullaby') {
    // Lo-Fi Future Bass: 95 BPM
    if ((beat % 4 === 0 || beat % 4 === 2) && subStep === 0) ev.push({ inst: 'kick', accent: 0.8 });
    if ((beat % 4 === 1 || beat % 4 === 3) && subStep === 0) ev.push({ inst: 'snare', accent: 0.75 });
    if (subStep === 2) ev.push({ inst: 'hat', open: false });

    const lofiRoots = [65.41, 87.31, 98.0, 77.78];
    if (subStep === 0) {
      ev.push({ inst: 'bass', freq: lofiRoots[Math.floor(beat / 4) % lofiRoots.length], steps: 3.5 });
    }

    if (subStep === 0 && beat % 4 === 0) {
      const chords = [
        [261.63, 329.63, 392.0, 493.88],
        [220.0, 261.63, 329.63, 392.0],
        [174.61, 220.0, 261.63, 329.63],
        [196.0, 246.94, 293.66, 392.0],
      ];
      ev.push({ inst: 'chord', freqs: chords[Math.floor(beat / 4) % 4], steps: 14 });
    }

    if (subStep === 0 && beat % 2 === 0) {
      const bells = [523.25, 587.33, 659.25, 783.99, 880.0];
      ev.push({ inst: 'lead', freq: bells[(beat * 2) % bells.length], steps: 2.5, wave: 'sine' });
    }
  }

  return ev;
}
