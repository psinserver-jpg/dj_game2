import React, { useRef, useEffect } from 'react';
import { Note, JudgmentType, GameSettings } from '../types/game';
import { soundEngine } from '../services/soundEngine';
import { IMAGES, getImage, isImageReady } from '../data/assets';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
}

interface RingShockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  alpha: number;
  decay: number;
}

interface HitBurst {
  x: number;
  y: number;
  size: number;
  start: number;
}

interface JudgmentAnimation {
  text: JudgmentType;
  fastSlow?: 'FAST' | 'SLOW';
  timestamp: number;
  lane: number;
}

interface RhythmGameCanvasProps {
  notes: Note[];
  currentSongTime: number;
  settings: GameSettings;
  activeLanes: boolean[]; // whether key is currently held down
  combo: number;
  grooveGauge: number; // 0 to 100
  recentJudgment: JudgmentAnimation | null;
  backgroundUrl: string;
  onLanePress?: (lane: number) => void;
  onLaneRelease?: (lane: number) => void;
}

// Lanes alternate cyan / pink, matching LANE_COLORS.
const NOTE_SPRITES = [IMAGES.noteCyan, IMAGES.notePink, IMAGES.noteCyan, IMAGES.notePink];
const HIT_BURST_DURATION = 0.32; // seconds

const LANE_COLORS = [
  { primary: '#06B6D4', glow: 'rgba(6, 182, 212, 0.6)', light: '#67E8F9' }, // Cyan
  { primary: '#EC4899', glow: 'rgba(236, 72, 153, 0.6)', light: '#F472B6' }, // Pink
  { primary: '#06B6D4', glow: 'rgba(6, 182, 212, 0.6)', light: '#67E8F9' }, // Cyan
  { primary: '#EC4899', glow: 'rgba(236, 72, 153, 0.6)', light: '#F472B6' }, // Pink
];

export const RhythmGameCanvas: React.FC<RhythmGameCanvasProps> = ({
  notes,
  currentSongTime,
  settings,
  activeLanes,
  combo,
  grooveGauge,
  recentJudgment,
  backgroundUrl,
  onLanePress,
  onLaneRelease,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const shockwavesRef = useRef<RingShockwave[]>([]);
  const hitBurstsRef = useRef<HitBurst[]>([]);
  const lastJudgmentRef = useRef<JudgmentAnimation | null>(null);

  // Trigger particles when a new judgment arrives
  useEffect(() => {
    if (recentJudgment && recentJudgment !== lastJudgmentRef.current) {
      lastJudgmentRef.current = recentJudgment;
      if (recentJudgment.text !== 'MISS' && canvasRef.current) {
        const canvas = canvasRef.current;
        // CSS pixels, same geometry as the render loop's receptor row
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const receptorY = height * 0.86;

        const highwayWidth = Math.min(width * 0.9, 440);
        const highwayLeft = (width - highwayWidth) / 2;
        const laneW = highwayWidth / 4;
        const hitX = highwayLeft + (recentJudgment.lane + 0.5) * laneW;

        const color =
          recentJudgment.text === 'PERFECT'
            ? '#38BDF8'
            : recentJudgment.text === 'GREAT'
            ? '#34D399'
            : '#FBBF24';

        // Spawn particles
        const count = recentJudgment.text === 'PERFECT' ? 24 : 14;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = Math.random() * 6 + 2;
          particlesRef.current.push({
            x: hitX,
            y: receptorY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.5, // bias upward
            radius: Math.random() * 3.5 + 2,
            color,
            alpha: 1.0,
            decay: Math.random() * 0.03 + 0.02,
            gravity: 0.15,
          });
        }

        // Spawn sprite flash
        hitBurstsRef.current.push({
          x: hitX,
          y: receptorY,
          size: recentJudgment.text === 'PERFECT' ? 150 : 110,
          start: performance.now(),
        });

        // Spawn shockwave ring
        shockwavesRef.current.push({
          x: hitX,
          y: receptorY,
          radius: 10,
          maxRadius: 48,
          color,
          alpha: 0.8,
          decay: 0.05,
        });
      }
    }
  }, [recentJudgment]);

  // Main rendering loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // Handle high-DPI
      const dpr = window.devicePixelRatio || 1;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = displayWidth;
      const height = displayHeight;

      const spectrum = soundEngine.getAnalyserData();
      const avgBass = (spectrum[0] + spectrum[1] + spectrum[2]) / 3 / 255; // 0.0 ~ 1.0

      // 1. Draw Canvas Background (stage art, cover-fit, pulses with the bass) & Dim
      ctx.fillStyle = '#080b12';
      ctx.fillRect(0, 0, width, height);

      const bg = getImage(backgroundUrl);
      if (isImageReady(bg)) {
        const scale =
          Math.max(width / bg.naturalWidth, height / bg.naturalHeight) * (1.03 + avgBass * 0.025);
        const drawW = bg.naturalWidth * scale;
        const drawH = bg.naturalHeight * scale;
        ctx.drawImage(bg, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      }

      // Background dim overlay
      ctx.fillStyle = `rgba(0, 0, 0, ${settings.backgroundDim})`;
      ctx.fillRect(0, 0, width, height);

      // 2. Beat reactive side columns

      // Side visualizer columns
      const numBars = 12;
      const barH = height / numBars;
      for (let i = 0; i < numBars; i++) {
        const val = (spectrum[i * 2] || 0) / 255;
        const barWidth = val * 50;
        // Left
        ctx.fillStyle = `rgba(6, 182, 212, ${val * 0.35})`;
        ctx.fillRect(0, height - (i + 1) * barH, barWidth, barH - 2);
        // Right
        ctx.fillStyle = `rgba(236, 72, 153, ${val * 0.35})`;
        ctx.fillRect(width - barWidth, height - (i + 1) * barH, barWidth, barH - 2);
      }

      // Highway geometry
      const is3D = settings.perspectiveMode === '3D';
      const bottomHighwayWidth = Math.min(width * 0.9, 440);
      const topHighwayWidth = is3D ? bottomHighwayWidth * 0.62 : bottomHighwayWidth;
      const receptorY = height * 0.86;
      const topY = is3D ? height * 0.12 : height * 0.05;

      const bottomHighwayLeft = (width - bottomHighwayWidth) / 2;
      const topHighwayLeft = (width - topHighwayWidth) / 2;

      // 3. Draw Highway Roadway surface
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(topHighwayLeft, topY);
      ctx.lineTo(topHighwayLeft + topHighwayWidth, topY);
      ctx.lineTo(bottomHighwayLeft + bottomHighwayWidth, height);
      ctx.lineTo(bottomHighwayLeft, height);
      ctx.closePath();

      // Highway gradient
      const roadGrad = ctx.createLinearGradient(0, topY, 0, height);
      roadGrad.addColorStop(0, 'rgba(15, 23, 42, 0.4)');
      roadGrad.addColorStop(1, 'rgba(10, 15, 30, 0.95)');
      ctx.fillStyle = roadGrad;
      ctx.fill();

      // Subtle beat flash on highway
      if (avgBass > 0.4) {
        ctx.fillStyle = `rgba(56, 189, 248, ${(avgBass - 0.4) * 0.2})`;
        ctx.fill();
      }

      // 4. Highway border lasers
      ctx.lineWidth = 2.5;
      // Left border
      ctx.strokeStyle = '#06B6D4';
      ctx.shadowColor = '#06B6D4';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(topHighwayLeft, topY);
      ctx.lineTo(bottomHighwayLeft, height);
      ctx.stroke();

      // Right border
      ctx.strokeStyle = '#EC4899';
      ctx.shadowColor = '#EC4899';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(topHighwayLeft + topHighwayWidth, topY);
      ctx.lineTo(bottomHighwayLeft + bottomHighwayWidth, height);
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadow

      // 5. Draw 4 Lanes and Dividers
      for (let l = 1; l < 4; l++) {
        const topX = topHighwayLeft + (l / 4) * topHighwayWidth;
        const bottomX = bottomHighwayLeft + (l / 4) * bottomHighwayWidth;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.lineTo(bottomX, height);
        ctx.stroke();
      }

      // 6. Draw Lane Key Beams (When active/held)
      for (let l = 0; l < 4; l++) {
        if (activeLanes[l]) {
          const lTopX1 = topHighwayLeft + (l / 4) * topHighwayWidth;
          const lTopX2 = topHighwayLeft + ((l + 1) / 4) * topHighwayWidth;
          const lBotX1 = bottomHighwayLeft + (l / 4) * bottomHighwayWidth;
          const lBotX2 = bottomHighwayLeft + ((l + 1) / 4) * bottomHighwayWidth;

          ctx.beginPath();
          ctx.moveTo(lTopX1, topY);
          ctx.lineTo(lTopX2, topY);
          ctx.lineTo(lBotX2, height);
          ctx.lineTo(lBotX1, height);
          ctx.closePath();

          const beamGrad = ctx.createLinearGradient(0, topY, 0, receptorY);
          beamGrad.addColorStop(0, 'rgba(255, 255, 255, 0.0)');
          beamGrad.addColorStop(0.7, LANE_COLORS[l].glow);
          beamGrad.addColorStop(1, LANE_COLORS[l].primary);
          ctx.fillStyle = beamGrad;
          ctx.fill();
        }
      }

      ctx.restore(); // Restore clip/canvas

      // 7. Perspective Helper Functions
      const speedModifier = settings.scrollSpeed * 0.85; // Speed factor
      const timeWindow = 1.6 / speedModifier; // Seconds visible on highway

      const getNotePosition = (noteTime: number) => {
        const timeDiff = noteTime - currentSongTime;
        // Progress: 0.0 = at top horizon, 1.0 = at judgment line
        const progress = 1 - timeDiff / timeWindow;
        return progress;
      };

      const getHighwayGeometryAt = (progress: number) => {
        const p = Math.max(0, Math.min(1.2, progress));
        const curveP = is3D ? Math.pow(p, 1.65) : p; // Perspective depth compression
        const y = topY + (receptorY - topY) * curveP;
        const currentHighwayWidth = topHighwayWidth + (bottomHighwayWidth - topHighwayWidth) * curveP;
        const currentHighwayLeft = topHighwayLeft + (bottomHighwayLeft - topHighwayLeft) * curveP;
        const laneW = currentHighwayWidth / 4;
        return { y, currentHighwayWidth, currentHighwayLeft, laneW, curveP };
      };

      // 8. Draw Falling Notes (Regular & Hold)
      notes.forEach((note) => {
        // Skip already completed notes
        if (note.judged && !note.duration) return;
        if (note.judged && note.holdProgress === 1) return;

        const headP = getNotePosition(note.time);
        const tailP = note.duration ? getNotePosition(note.time + note.duration) : headP;

        // Culling: off-screen
        if (headP < -0.1 && tailP < -0.1) return;
        if (headP > 1.3 && tailP > 1.3) return;

        const lane = note.lane;
        const laneTheme = LANE_COLORS[lane];

        // A. Draw Hold Note Ribbon if duration > 0
        if (note.duration && note.duration > 0) {
          const startP = Math.max(0, Math.min(1.05, note.holding ? 1.0 : headP));
          const endP = Math.max(0, Math.min(1.05, tailP));

          if (startP > endP) {
            const numSegments = 16;
            ctx.beginPath();

            // Left edge down
            for (let i = 0; i <= numSegments; i++) {
              const segP = endP + (startP - endP) * (i / numSegments);
              const geom = getHighwayGeometryAt(segP);
              const xLeft = geom.currentHighwayLeft + lane * geom.laneW + geom.laneW * 0.15;
              if (i === 0) ctx.moveTo(xLeft, geom.y);
              else ctx.lineTo(xLeft, geom.y);
            }

            // Right edge up
            for (let i = numSegments; i >= 0; i--) {
              const segP = endP + (startP - endP) * (i / numSegments);
              const geom = getHighwayGeometryAt(segP);
              const xRight = geom.currentHighwayLeft + (lane + 1) * geom.laneW - geom.laneW * 0.15;
              ctx.lineTo(xRight, geom.y);
            }

            ctx.closePath();

            // Laser ribbon gradient
            const headGeom = getHighwayGeometryAt(startP);
            const tailGeom = getHighwayGeometryAt(endP);
            const holdGrad = ctx.createLinearGradient(0, tailGeom.y, 0, headGeom.y);
            holdGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
            holdGrad.addColorStop(0.5, laneTheme.glow);
            holdGrad.addColorStop(1, laneTheme.primary);

            ctx.fillStyle = holdGrad;
            ctx.fill();

            // Hold edge outline
            ctx.strokeStyle = laneTheme.light;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Hold spark fountain if currently being held
            if (note.holding && Math.random() < 0.6) {
              const geom = getHighwayGeometryAt(1.0);
              const holdX = geom.currentHighwayLeft + (lane + 0.5) * geom.laneW;
              particlesRef.current.push({
                x: holdX + (Math.random() * 24 - 12),
                y: receptorY,
                vx: Math.random() * 4 - 2,
                vy: -Math.random() * 5 - 2,
                radius: Math.random() * 2.5 + 1,
                color: laneTheme.light,
                alpha: 1.0,
                decay: 0.05,
                gravity: 0.1,
              });
            }
          }
        }

        // B. Draw Note Head Capsule
        if (!note.holding && headP >= -0.1 && headP <= 1.15) {
          const geom = getHighwayGeometryAt(headP);
          const laneX = geom.currentHighwayLeft + lane * geom.laneW;
          const noteWidth = geom.laneW * 0.88;
          const noteX = laneX + (geom.laneW - noteWidth) / 2;
          const noteHeight = Math.max(8, is3D ? 10 + 12 * geom.curveP : 14);
          const radius = Math.min(6, noteHeight / 2);

          const sprite = getImage(NOTE_SPRITES[lane]);
          if (isImageReady(sprite)) {
            // Sprite includes its own glow, so draw it slightly larger than the hit box
            const spriteW = noteWidth * 1.12;
            const spriteH = noteHeight * 1.35;
            ctx.drawImage(sprite, noteX + (noteWidth - spriteW) / 2, geom.y - spriteH / 2, spriteW, spriteH);
            return;
          }

          // Fallback vector note while the sprite loads
          ctx.save();
          ctx.shadowColor = laneTheme.primary;
          ctx.shadowBlur = 10 * (geom.curveP || 0.8);

          // Outer pill body
          ctx.fillStyle = laneTheme.primary;
          ctx.beginPath();
          ctx.roundRect(noteX, geom.y - noteHeight / 2, noteWidth, noteHeight, radius);
          ctx.fill();

          // Inner white sheen
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.roundRect(
            noteX + 3,
            geom.y - noteHeight * 0.35,
            noteWidth - 6,
            noteHeight * 0.35,
            radius / 2
          );
          ctx.fill();

          ctx.restore();
        }
      });

      // 9. Draw Receptors / Target Judgment Line
      const receptorGeom = getHighwayGeometryAt(1.0);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(receptorGeom.currentHighwayLeft, receptorY);
      ctx.lineTo(receptorGeom.currentHighwayLeft + receptorGeom.currentHighwayWidth, receptorY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 10. Draw 4 Receptor Target Pads
      for (let l = 0; l < 4; l++) {
        const rX = receptorGeom.currentHighwayLeft + l * receptorGeom.laneW;
        const rW = receptorGeom.laneW * 0.88;
        const padX = rX + (receptorGeom.laneW - rW) / 2;
        const padH = 14;
        const isPressed = activeLanes[l];

        ctx.save();
        if (isPressed) {
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = LANE_COLORS[l].primary;
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.roundRect(padX - 2, receptorY - padH / 2 - 2, rW + 4, padH + 4, 6);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.strokeStyle = LANE_COLORS[l].primary;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(padX, receptorY - padH / 2, rW, padH, 4);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();

        // Key letters below receptors
        const keyLetter = settings.keyBindings[l].toUpperCase();
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = isPressed ? '#FFFFFF' : 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(keyLetter, padX + rW / 2, receptorY + 24);
      }

      // 11. Draw Particle Effects
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 12. Draw Shockwaves
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const sw = shockwavesRef.current[i];
        sw.radius += (sw.maxRadius - sw.radius) * 0.25;
        sw.alpha -= sw.decay;

        if (sw.alpha <= 0) {
          shockwavesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = sw.alpha;
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 12b. Sprite hit flashes (additive blend)
      const burstSprite = getImage(IMAGES.hitBurst);
      const now = performance.now();
      hitBurstsRef.current = hitBurstsRef.current.filter(
        (b) => (now - b.start) / 1000 < HIT_BURST_DURATION
      );
      if (isImageReady(burstSprite)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const b of hitBurstsRef.current) {
          const t = (now - b.start) / 1000 / HIT_BURST_DURATION; // 0 -> 1
          const size = b.size * (0.55 + 0.6 * Math.sqrt(t));
          ctx.globalAlpha = 1 - t * t;
          ctx.drawImage(burstSprite, b.x - size / 2, b.y - size / 2, size, size);
        }
        ctx.restore();
      }

      // 13. In-Game Combo Display
      if (combo > 2) {
        ctx.save();
        const comboY = height * 0.44;
        ctx.textAlign = 'center';

        // Combo number
        ctx.font = '800 48px "Chakra Petch", sans-serif';
        if (combo >= 100) {
          ctx.fillStyle = '#F59E0B'; // Gold
          ctx.shadowColor = '#F59E0B';
          ctx.shadowBlur = 18;
        } else if (combo >= 50) {
          ctx.fillStyle = '#38BDF8'; // Sky
          ctx.shadowColor = '#38BDF8';
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowBlur = 0;
        }
        ctx.fillText(String(combo), width / 2, comboY);

        // "COMBO" label
        ctx.font = '700 13px "Chakra Petch", sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.letterSpacing = '4px';
        ctx.fillText('COMBO', width / 2, comboY + 20);
        ctx.restore();
      }

      // 14. Judgment Text Animation
      if (recentJudgment) {
        const timeSince = (performance.now() - recentJudgment.timestamp) / 1000;
        if (timeSince < 0.65) {
          ctx.save();
          const alpha = Math.max(0, 1 - timeSince / 0.65);
          ctx.globalAlpha = alpha;
          ctx.textAlign = 'center';

          // Pop scale
          const scale = 1 + Math.max(0, 0.35 - timeSince * 2);
          const judgeY = height * 0.56;

          let color = '#38BDF8';
          if (recentJudgment.text === 'GREAT') color = '#34D399';
          if (recentJudgment.text === 'GOOD') color = '#FBBF24';
          if (recentJudgment.text === 'MISS') color = '#F43F5E';

          ctx.font = `800 ${Math.floor(28 * scale)}px "Chakra Petch", sans-serif`;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
          ctx.fillText(recentJudgment.text, width / 2, judgeY);

          // Fast / Slow indicator
          if (settings.showFastSlow && recentJudgment.fastSlow && recentJudgment.text !== 'PERFECT') {
            ctx.font = '600 12px "JetBrains Mono", monospace';
            ctx.fillStyle = recentJudgment.fastSlow === 'FAST' ? '#60A5FA' : '#FB923C';
            ctx.shadowBlur = 0;
            ctx.fillText(recentJudgment.fastSlow, width / 2, judgeY + 18);
          }

          ctx.restore();
        }
      }

      ctx.restore(); // Final restore
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [notes, currentSongTime, settings, activeLanes, combo, grooveGauge, recentJudgment, backgroundUrl]);

  // Touch handlers for on-screen play on mobile / tablets
  const handleTouch = (e: React.TouchEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const width = rect.width;
    const highwayWidth = Math.min(width * 0.9, 440);
    const highwayLeft = (width - highwayWidth) / 2;
    const laneW = highwayWidth / 4;

    const touches = Array.from(e.touches);
    const pressedLanes = [false, false, false, false];

    touches.forEach((touch) => {
      const clientX = touch.clientX - rect.left;
      const clientY = touch.clientY - rect.top;

      // Only respond if touch is in the lower half of screen
      if (clientY > rect.height * 0.5) {
        const lane = Math.floor((clientX - highwayLeft) / laneW);
        if (lane >= 0 && lane < 4) {
          pressedLanes[lane] = true;
        }
      }
    });

    for (let l = 0; l < 4; l++) {
      if (pressedLanes[l] && !activeLanes[l]) {
        onLanePress?.(l);
      } else if (!pressedLanes[l] && activeLanes[l]) {
        onLaneRelease?.(l);
      }
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none"
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={handleTouch}
      />
    </div>
  );
};
