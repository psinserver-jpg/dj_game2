// Converts the raw generated PNGs in art/raw into web-ready files in public/images.
// The job list comes from art/assets.json; each asset's raw `out` path decides what it becomes:
//   raw/covers/<n>.png  -> covers/<n>.webp   (768 px wide, WebP q80)
//   raw/stages/<n>.png  -> stages/<n>.webp   (1536 px wide, WebP q80)
//   raw/ui/title-bg.png -> ui/title-bg.webp  (1920 px wide) + ui/og-image.jpg (1200x630 cover, JPEG q82)
//   raw/ui/<n>.png      -> ui/<n>.webp       (1920 px wide)
//   raw/ui/logo.png     -> ui/logo.png       (black keyed out to alpha, trimmed, 1200 px wide)
//   raw/sprites/<n>.png -> sprites/<n>.png   (black keyed out to alpha, trimmed, 256 px wide)
// An asset can override this with "web": [{ "kind": "photo" | "og" | "keyed", "out": "<path in public/images>", "width": n }].
// Images are never enlarged.
//
//   node art/process.mjs                          # every asset in assets.json
//   node art/process.mjs cover-foo stage-foo      # only these asset ids
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ART_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(ART_DIR, '..', 'public', 'images');

const manifest = JSON.parse(readFileSync(join(ART_DIR, 'assets.json'), 'utf8'));
const onlyIds = process.argv.slice(2).filter((a) => !a.startsWith('-'));

// Default web outputs per raw folder, given the raw file's base name.
const FOLDER_RULES = {
  covers: (name) => [{ kind: 'photo', out: `covers/${name}.webp`, width: 768 }],
  stages: (name) => [{ kind: 'photo', out: `stages/${name}.webp`, width: 1536 }],
  sprites: (name) => [{ kind: 'keyed', out: `sprites/${name}.png`, width: 256 }],
  ui: (name) => {
    if (name === 'logo') return [{ kind: 'keyed', out: 'ui/logo.png', width: 1200 }];
    const outputs = [{ kind: 'photo', out: `ui/${name}.webp`, width: 1920 }];
    if (name === 'title-bg') outputs.push({ kind: 'og', out: 'ui/og-image.jpg' });
    return outputs;
  },
};

function webOutputs(asset) {
  if (Array.isArray(asset.web)) return asset.web;
  const rel = String(asset.out ?? '')
    .replaceAll('\\', '/')
    .replace(/^(\.\/)?raw\//, '');
  const parts = rel.split('/');
  if (parts.length !== 2) return [];
  const rule = FOLDER_RULES[parts[0]];
  return rule ? rule(posix.parse(parts[1]).name) : [];
}

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

async function convert(src, job) {
  const out = join(OUT_DIR, job.out);
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
  } else {
    throw new Error(`unknown kind "${job.kind}"`);
  }
  const meta = await sharp(out).metadata();
  console.log(`ok   ${job.out} ${meta.width}x${meta.height}`);
}

const known = new Set(manifest.assets.map((a) => a.id));
const unknownIds = onlyIds.filter((id) => !known.has(id));
if (unknownIds.length) {
  console.log(`unknown asset id(s): ${unknownIds.join(', ')}`);
  process.exitCode = 1;
}

const assets = onlyIds.length ? manifest.assets.filter((a) => onlyIds.includes(a.id)) : manifest.assets;
let written = 0;
let skipped = 0;
let failed = 0;

for (const asset of assets) {
  const jobs = webOutputs(asset);
  if (!jobs.length) {
    console.log(`skip ${asset.id} (no web output rule for ${asset.out})`);
    skipped++;
    continue;
  }
  const src = join(ART_DIR, asset.out);
  if (!existsSync(src)) {
    console.log(`skip ${asset.id} (missing ${asset.out})`);
    skipped++;
    continue;
  }
  for (const job of jobs) {
    try {
      await convert(src, job);
      written++;
    } catch (err) {
      console.log(`FAIL ${job.out}: ${err.message}`);
      failed++;
    }
  }
}

console.log(`done: ${written} file(s) written, ${skipped} asset(s) skipped, ${failed} failed`);
if (failed) process.exitCode = 1;
