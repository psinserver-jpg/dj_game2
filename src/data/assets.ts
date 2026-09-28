/**
 * Image asset paths (served from /public/images).
 * All artwork is generated with Codex image generation — see art/assets.json.
 */

import type { SongMetadata } from '../types/game';
import type { SynthPatternId } from './patterns';

export const IMAGES = {
  titleBackground: '/images/ui/title-bg.webp',
  logo: '/images/ui/logo.png',
  customCover: '/images/covers/custom.webp',
  noteCyan: '/images/sprites/note-cyan.png',
  notePink: '/images/sprites/note-pink.png',
  hitBurst: '/images/sprites/hit-burst.png',
} as const;

// Downloadable project documents (served from /public/docs)
export const DOCS = {
  plan: { url: '/docs/pulsebeat-plan.docx', fileName: 'PulseBeat_작업계획서.docx' },
} as const;

export const cover = (name: string) => `/images/covers/${name}.webp`;
export const stage = (name: string) => `/images/stages/${name}.webp`;

const SYNTH_STAGES: Record<SynthPatternId, string> = {
  neon_velocity: stage('neon-velocity'),
  midnight_tokyo: stage('midnight-tokyo'),
  solar_overdrive: stage('solar-overdrive'),
  starlight_lullaby: stage('starlight-lullaby'),
};

// Custom songs built on a stock synth pattern reuse that pattern's stage art;
// uploads ('custom') and generated tracks without a stageUrl ('audio') use the title backdrop.
export function getStageUrl(song: Pick<SongMetadata, 'musicPatternId' | 'stageUrl'>): string {
  if (song.stageUrl) return song.stageUrl;
  const synthStage: string | undefined = (SYNTH_STAGES as Record<string, string>)[song.musicPatternId];
  return synthStage ?? IMAGES.titleBackground;
}

// <img onError>: show the generic cover when a song's artwork has not been generated yet.
export function handleCoverError(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  if (!img.src.endsWith(IMAGES.customCover)) img.src = IMAGES.customCover;
}

// <img onError>: show the title backdrop when a song's stage art has not been generated yet.
export function handleStageError(e: { currentTarget: HTMLImageElement }) {
  const img = e.currentTarget;
  if (!img.src.endsWith(IMAGES.titleBackground)) img.src = IMAGES.titleBackground;
}

// Shared cache so canvas sprites load once and can be drawn synchronously afterwards.
const imageCache = new Map<string, HTMLImageElement>();

export function getImage(url: string): HTMLImageElement {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

export const isImageReady = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

// complete + no pixels = the request failed (missing file or not an image)
const isImageBroken = (img: HTMLImageElement) => img.complete && img.naturalWidth === 0;

/** Stage art for canvas drawing; the title backdrop stands in when the art failed to load. */
export function getStageImage(url: string): HTMLImageElement {
  const img = getImage(url);
  return isImageBroken(img) ? getImage(IMAGES.titleBackground) : img;
}
