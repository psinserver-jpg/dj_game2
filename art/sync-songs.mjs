// Upserts a cover and a stage image entry into art/assets.json for every song in music/songs.json.
//   cover-<songId> -> raw/covers/<songId>.png (1024x1024)
//   stage-<songId> -> raw/stages/<songId>.png (1536x1024)
// Briefs come from the song's coverBrief / stageBrief (with a fallback built from title, genre,
// mood and palette, used only for new entries so it never overwrites an existing brief). Entries for
// other ids are left untouched, and running it twice changes nothing.
//
//   node art/sync-songs.mjs              # sync from music/songs.json
//   node art/sync-songs.mjs --dry-run    # only print what would change
//   node art/sync-songs.mjs path/to/songs.json
//
// Then: node art/generate.mjs <ids...>  and  node art/process.mjs <ids...>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ART_DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS_PATH = join(ART_DIR, 'assets.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const songsArg = args.find((a) => !a.startsWith('--'));
const SONGS_PATH = songsArg ? resolve(songsArg) : join(ART_DIR, '..', 'music', 'songs.json');

const LANE_RULE =
  "Keep the central vertical third darker and calmer because the game's note lane is drawn on top; put the brightest details on the left and right edges. No characters or vehicles in the center.";

const clean = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');
const sentence = (s) => {
  const t = clean(s);
  return !t || /[.!?]$/.test(t) ? t : `${t}.`;
};
const join2 = (...parts) => parts.map(sentence).filter(Boolean).join(' ');

function songContext(song) {
  const by = clean(song.artist) ? ` by ${clean(song.artist)}` : '';
  const genre = clean(song.genre) || 'electronic';
  const bpm = Number.isFinite(song.bpm) ? ` at ${song.bpm} BPM` : '';
  // referenceTradition is design metadata (Korean, may name real games); keep it out of image prompts.
  return `'${clean(song.title) || song.id}'${by}, ${genre}${bpm}`;
}

function paletteLine(song, brief) {
  const palette = clean(song.palette);
  if (!palette || /palette/i.test(brief)) return '';
  return `Palette leans ${palette}`;
}

function trackWords(song) {
  const genre = clean(song.genre);
  const mood = clean(song.mood);
  const track = genre ? `this ${genre} track` : 'this track';
  return mood ? `${track} and its ${mood} mood` : track;
}

function coverBrief(song) {
  const body =
    clean(song.coverBrief) ||
    join2(
      `A striking key visual that captures the feeling of '${clean(song.title) || song.id}' and ${trackWords(song)}`,
      'One strong focal subject, bold composition, cinematic lighting'
    );
  return join2(`Square album cover for ${songContext(song)}`, body, paletteLine(song, body));
}

function stageBrief(song) {
  const body =
    clean(song.stageBrief) ||
    join2(
      `An immersive environment that matches ${trackWords(song)}`,
      'Strong depth and perspective receding toward a central vanishing point'
    );
  const lane = /central vertical third/i.test(body) ? '' : LANE_RULE;
  return join2(`Wide landscape gameplay backdrop for the stage '${clean(song.title) || song.id}'`, body, paletteLine(song, body), lane);
}

// ownBrief: false when the brief is only the generic fallback. A fallback never replaces a brief
// that is already in assets.json (it may have been written by hand); it is used for new entries.
function entriesFor(song) {
  return [
    {
      entry: { id: `cover-${song.id}`, out: `raw/covers/${song.id}.png`, size: '1024x1024', brief: coverBrief(song) },
      ownBrief: Boolean(clean(song.coverBrief)),
    },
    {
      entry: { id: `stage-${song.id}`, out: `raw/stages/${song.id}.png`, size: '1536x1024', brief: stageBrief(song) },
      ownBrief: Boolean(clean(song.stageBrief)),
    },
  ];
}

const sameEntry = (a, b) => ['id', 'out', 'size', 'brief'].every((k) => a[k] === b[k]);

const songsFile = JSON.parse(readFileSync(SONGS_PATH, 'utf8'));
const manifest = JSON.parse(readFileSync(ASSETS_PATH, 'utf8'));
const assets = manifest.assets;

const added = [];
const updated = [];
const unchanged = [];
const keptBriefs = [];
const songIds = new Set();

for (const song of songsFile.songs ?? []) {
  if (typeof song?.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(song.id)) {
    console.log(`skip song with invalid id: ${JSON.stringify(song?.id)}`);
    continue;
  }
  songIds.add(song.id);
  for (const { entry, ownBrief } of entriesFor(song)) {
    const index = assets.findIndex((a) => a.id === entry.id);
    if (index >= 0) {
      const existingBrief = assets[index].brief;
      if (!ownBrief && typeof existingBrief === 'string' && existingBrief.trim() && existingBrief !== entry.brief) {
        entry.brief = existingBrief;
        keptBriefs.push(entry.id);
      }
      if (sameEntry(assets[index], entry)) {
        unchanged.push(entry.id);
      } else {
        assets[index] = { ...assets[index], ...entry };
        updated.push(entry.id);
      }
      continue;
    }
    // Keep covers with covers and stages with stages: insert after the last entry of the same kind.
    const prefix = entry.id.slice(0, entry.id.indexOf('-') + 1);
    let last = -1;
    assets.forEach((a, i) => {
      if (a.id.startsWith(prefix)) last = i;
    });
    assets.splice(last >= 0 ? last + 1 : assets.length, 0, entry);
    added.push(entry.id);
  }
}

const orphans = assets
  .filter((a) => /^(cover|stage)-/.test(a.id) && !songIds.has(a.id.replace(/^(cover|stage)-/, '')))
  .map((a) => a.id);

console.log(`added:     ${added.length ? added.join(', ') : '(none)'}`);
console.log(`updated:   ${updated.length ? updated.join(', ') : '(none)'}`);
console.log(`unchanged: ${unchanged.length ? unchanged.join(', ') : '(none)'}`);
if (keptBriefs.length) console.log(`kept existing brief (song has no coverBrief/stageBrief): ${keptBriefs.join(', ')}`);
if (orphans.length) console.log(`kept (no matching song): ${orphans.join(', ')}`);

const changed = [...added, ...updated];
if (!changed.length) {
  console.log('assets.json is already in sync.');
} else if (dryRun) {
  console.log('--dry-run: assets.json not written.');
} else {
  writeFileSync(ASSETS_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${ASSETS_PATH}`);
  console.log(`next: node art/generate.mjs ${changed.join(' ')}`);
  console.log(`      node art/process.mjs ${changed.join(' ')}`);
}
