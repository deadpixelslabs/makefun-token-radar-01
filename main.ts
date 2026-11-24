import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './dashboard/engine.js';
import { buildDossier } from './vendor/makefun-board.ts';

interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  implied_value_usd: number;
  farm_steps: string[];
}

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Array<{ slug: string }>;
  watchlist: string[];
}

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const DOSSIER_MAX_BYTES = 1_572_864;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };

function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

function validateBoard(board: BoardRow[], snapshot: Snapshot): void {
  if (board.length < 100 || board.length > 4000) {
    throw new Error(`Row count ${board.length} outside [100, 4000]`);
  }
  const validSlugs = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  const allVals = new Set<number>();

  for (let i = 0; i < board.length; i++) {
    const r = board[i]!;
    if (!validSlugs.has(r.slug) || seen.has(r.slug)) {
      throw new Error(`Invalid or duplicate slug: ${r.slug}`);
    }
    seen.add(r.slug);
    if (!r.name || !r.name.trim()) throw new Error(`Empty name at ${r.slug}`);
    if (r.rank !== i + 1) throw new Error(`Rank mismatch at ${r.slug}: ${r.rank}`);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) {
      throw new Error(`Invalid implied_value_usd at ${r.slug}`);
    }
    if (i > 0 && r.implied_value_usd > board[i - 1]!.implied_value_usd) {
      throw new Error(`Non-monotonic rank ordering at ${r.slug}`);
    }
    allVals.add(r.implied_value_usd);
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      throw new Error(`Invalid farm_steps length at ${r.slug}`);
    }
    for (const step of r.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) throw new Error(`Farm step length ${len} out of bounds at ${r.slug}`);
    }
  }
  if (allVals.size < 2) throw new Error('Implied values cannot all be identical');
  for (const wlSlug of snapshot.watchlist) {
    if (!seen.has(wlSlug)) throw new Error(`Missing watchlist protocol: ${wlSlug}`);
  }
}

function copyDirFiles(srcDir: string, dstDir: string): string[] {
  mkdirSync(dstDir, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(srcDir).sort()) {
    if (name.startsWith('.')) continue;
    const p = join(srcDir, name);
    if (!statSync(p).isFile()) continue;
    copyFileSync(p, join(dstDir, name));
    copied.push(name);
  }
  return copied;
}

function assertNoExternalUrls(dir: string): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    const text = readFileSync(p, 'utf8');
    if (/https?:\/\//i.test(text)) {
      throw new Error(`External URL reference forbidden in dashboard/${name}`);
    }
  }
}

function main(): void {
  const inputArg = getArg('input', '/input');
  const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
  if (!existsSync(inputFile)) {
    throw new Error(`Missing snapshot input at ${inputFile}`);
  }
  const outDir = getArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

  const snapshot = JSON.parse(readFileSync(inputFile, 'utf8')) as Snapshot;
  const engine = (globalThis as { RadarEngine?: { buildAll: (s: Snapshot) => { board: BoardRow[]; radar: unknown }; verifyBoardIntegrity: (r: unknown) => { allOk: boolean } } }).RadarEngine;
  if (!engine) throw new Error('RadarEngine failed to load from dashboard/engine.js');

  const { board, radar } = engine.buildAll(snapshot);
  validateBoard(board, snapshot);
  if (!engine.verifyBoardIntegrity(radar).allOk) {
    throw new Error('Board integrity seal verification failed');
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(outDir, 'data.js'), `window.__RADAR_DATA__ = ${JSON.stringify(radar)};\n`);

  const dashFiles = copyDirFiles(join(here, 'dashboard'), join(outDir, 'dashboard'));
  assertNoExternalUrls(join(outDir, 'dashboard'));
  const shots = copyDirFiles(join(here, 'screenshots'), join(outDir, 'screenshots'));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`Expected 3 or 4 screenshots, found ${shots.length}`);
  }

  const dossierBytes = buildDossier(outDir, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: DASHBOARD_CAPS,
  });
  if (dossierBytes.length > DOSSIER_MAX_BYTES) {
    throw new Error(`Dossier ${dossierBytes.length} bytes exceeds ${DOSSIER_MAX_BYTES} byte cap`);
  }
  const parsedDossier = JSON.parse(Buffer.from(dossierBytes).toString('utf8')) as { text?: string };
  if (typeof parsedDossier.text !== 'string' || parsedDossier.text.includes('lines not shown.]')) {
    throw new Error('Dossier source text was truncated; reduce dashboard/ bytes below TEXT_MAX_BYTES');
  }
  writeFileSync(join(outDir, 'dossier.json'), dossierBytes);

  process.stdout.write(
    `Pre-Token Desk: ${snapshot.protocols.length} protocols, ${board.length} ranked, ${dashFiles.length} dashboard files, ${shots.length} screenshots, dossier ${dossierBytes.length} bytes\n`,
  );
}

main();
