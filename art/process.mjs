// Converts the raw Codex-generated PNGs in art/raw into web-ready files in public/images.
//   - covers / stages / ui backgrounds -> resized WebP
//   - sprites and the logo (generated on pure black) -> black keyed out to alpha, trimmed PNG
//
//   node art/process.mjs
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ART_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ART_DIR, '..', 'public', 'images');

const JOBS = [
  ...['neon-velocity', 'midnight-tokyo', 'solar-overdrive', 'starlight-lullaby', 'custom'].map((n) => ({
    src: `covers/${n}.png`,
    out: `covers/${n}.webp`,
    kind: 'photo',
    width: 768,
  })),
  ...['neon-velocity', 'midnight-tokyo', 'solar-overdrive', 'starlight-lullaby'].map((n) => ({
    src: `stages/${n}.png`,
    out: `stages/${n}.webp`,
    kind: 'photo',
    width: 1536,
  })),
  { src: 'ui/title-bg.png', out: 'ui/title-bg.webp', kind: 'photo', width: 1920 },
  { src: 'ui/title-bg.png', out: 'ui/og-image.jpg', kind: 'og' },
  { src: 'ui/logo.png', out: 'ui/logo.png', kind: 'keyed', width: 1200 },
  { src: 'sprites/note-cyan.png', out: 'sprites/note-cyan.png', kind: 'keyed', width: 256 },
  { src: 'sprites/note-pink.png', out: 'sprites/note-pink.png', kind: 'keyed', width: 256 },
  { src: 'sprites/hit-burst.png', out: 'sprites/hit-burst.png', kind: 'keyed', width: 256 },
];

// "Unscreen": treat the black background as transparency. alpha = max(r,g,b), and the
// color is un-premultiplied so glows keep their hue when composited over anything.
async function keyOutBlack(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let a = Math.max(r, g, b);
    if (a < 14) a = 0; // kill compression noise in the background
    if (a === 0) continue;
    out[j] = Math.min(255, Math.round((r * 255) / a));
    out[j + 1] = Math.min(255, Math.round((g * 255) / a));
    out[j + 2] = Math.min(255, Math.round((b * 255) / a));
    out[j + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

for (const job of JOBS) {
  const src = join(ART_DIR, 'raw', job.src);
  const out = join(OUT_DIR, job.out);
  if (!existsSync(src)) {
    console.log(`skip ${job.src} (missing)`);
    continue;
  }
  mkdirSync(dirname(out), { recursive: true });

  if (job.kind === 'photo') {
    await sharp(src).resize({ width: job.width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(out);
  } else if (job.kind === 'og') {
    await sharp(src).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(out);
  } else if (job.kind === 'keyed') {
    const keyed = await (await keyOutBlack(src)).png().toBuffer();
    await sharp(keyed)
      .trim({ threshold: 1 })
      .resize({ width: job.width, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }
  const meta = await sharp(out).metadata();
  console.log(`ok   ${job.out} ${meta.width}x${meta.height}`);
}
