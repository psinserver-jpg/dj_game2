/**
 * Image asset paths (served from /public/images).
 * All artwork is generated with Codex image generation — see art/assets.json.
 */

import type { SongMetadata } from '../types/game';

export const IMAGES = {
  titleBackground: '/images/ui/title-bg.webp',
  logo: '/images/ui/logo.png',
  customCover: '/images/covers/custom.webp',
  noteCyan: '/images/sprites/note-cyan.png',
  notePink: '/images/sprites/note-pink.png',
  hitBurst: '/images/sprites/hit-burst.png',
} as const;

export const cover = (name: string) => `/images/covers/${name}.webp`;
export const stage = (name: string) => `/images/stages/${name}.webp`;

// Custom songs built on a stock synth pattern reuse that pattern's stage art.
export function getStageUrl(song: Pick<SongMetadata, 'musicPatternId'> & { stageUrl?: string }): string {
  if (song.stageUrl) return song.stageUrl;
  if (song.musicPatternId === 'custom') return IMAGES.titleBackground;
  return stage(song.musicPatternId.replace(/_/g, '-'));
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
