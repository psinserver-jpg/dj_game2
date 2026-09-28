// Generates every image listed in art/assets.json with the Codex CLI's built-in
// image generation (gpt-image), running a few Codex sessions in parallel.
//
//   node art/generate.mjs            # generate only missing images
//   node art/generate.mjs --force    # regenerate everything
//   node art/generate.mjs logo hit-burst   # (re)generate specific ids
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ART_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(ART_DIR, '..');
const CONCURRENCY = 4;

const manifest = JSON.parse(readFileSync(join(ART_DIR, 'assets.json'), 'utf8'));
const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyIds = args.filter((a) => !a.startsWith('--'));

const jobs = manifest.assets.filter((a) => {
  if (onlyIds.length) return onlyIds.includes(a.id);
  return force || !existsSync(join(ART_DIR, a.out));
});

function buildPrompt(asset) {
  const outRel = relative(ROOT, join(ART_DIR, asset.out)).replaceAll('\\', '/');
  return [
    'Use your built-in image generation tool to create exactly ONE image. Do not draw it with code.',
    '',
    `Target size: ${asset.size} pixels.`,
    manifest.style,
    '',
    `Brief: ${asset.brief}`,
    '',
    `After the image is generated, copy the resulting PNG to exactly this path (create folders, overwrite if it exists): ${outRel}`,
    'Do not modify any other file. Reply with only the final file path and its pixel size.',
  ].join('\n');
}

function runCodex(asset) {
  return new Promise((resolve) => {
    const logDir = join(ART_DIR, 'logs');
    mkdirSync(logDir, { recursive: true });
    mkdirSync(dirname(join(ART_DIR, asset.out)), { recursive: true });
    const started = Date.now();
    const child = spawn('codex', ['exec', '--sandbox', 'workspace-write', '-'], {
      cwd: ROOT,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => (log += d));
    child.stderr.on('data', (d) => (log += d));
    child.stdin.end(buildPrompt(asset));
    child.on('close', (code) => {
      writeFileSync(join(logDir, `${asset.id}.log`), log);
      const ok = existsSync(join(ART_DIR, asset.out));
      const secs = Math.round((Date.now() - started) / 1000);
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${asset.id} (${secs}s, exit ${code})`);
      resolve(ok);
    });
  });
}

console.log(`Generating ${jobs.length} image(s) with concurrency ${CONCURRENCY}...`);
const queue = [...jobs];
const failed = [];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const asset = queue.shift();
      if (!(await runCodex(asset))) failed.push(asset.id);
    }
  })
);
if (failed.length) {
  console.log(`Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
}
