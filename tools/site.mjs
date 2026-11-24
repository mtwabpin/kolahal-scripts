#!/usr/bin/env node
// Builds the whole site that Kolahal reads from GitHub Pages:
// - the root, index.json and the files it names, from this checkout (main), by its tools/check.mjs;
// - <X.Y.Z>/index.json and its files, from each branch named like a Kolahal version (0.5.17), by that
//   branch's own tools/check.mjs, so each branch is checked by the rules of its time. Kolahal X.Y.Z reads
//   its folder first, and the root when there is none. Kolahal reads these folders from FIRST on, so an
//   older branch is left out.
//
//   node tools/site.mjs --out _site            the branches of origin, as on GitHub
//   node tools/site.mjs --out _site --local    the local branches, to look at the site before a push
//   --live <address of the published site>     a branch that fails its check keeps the folder published there
//
// Exit status: 0 when everything is built; 1 when this checkout's own check fails, and then nothing is
// built; 2 when the site is built but a version branch failed its check. That branch's folder is then
// the one published before (with --live), or none, and Kolahal of that version reads the root.
// On GitHub, it also writes `failed=<versions>` to $GITHUB_OUTPUT, so the run fails after it publishes.
//
// Needs git and Node 20 or newer; and luac, as tools/check.mjs does.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const FIRST = '0.5.17';
const VERSION = /^\d+\.\d+\.\d+$/;

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const outArg = arg('--out');
if (!outArg) {
  console.log('usage: node tools/site.mjs --out <folder> [--local] [--live <url>]');
  process.exit(1);
}
const out = resolve(outArg);
const local = process.argv.includes('--local');
const live = arg('--live')?.replace(/\/*$/, '/');

const parts = (v) => v.split('.').map(Number);
const compare = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Runs a checkout's tools/check.mjs in [dir], writing the site's part at [into]. True when it passed. */
function check(dir, into, sha) {
  if (!existsSync(join(dir, 'tools', 'check.mjs'))) {
    console.log(`::error::${dir}: no tools/check.mjs`);
    return false;
  }
  try {
    execFileSync(process.execPath, ['tools/check.mjs', '--out', into], {
      cwd: dir,
      stdio: 'inherit',
      env: { ...process.env, GITHUB_SHA: sha },
    });
    return true;
  } catch {
    return false;
  }
}

/** The files of [version]'s folder as published at [live], each matching its checksum. False when any can't be. */
async function keepLive(version, into) {
  try {
    const base = `${live}${version}/`;
    const res = await fetch(`${base}index.json`);
    if (!res.ok) return false;
    const text = await res.text();
    const index = JSON.parse(text);
    const files = [...(index.scripts ?? []), ...(index.shaders ?? [])];
    for (const e of files) {
      if (!/^(scripts|shaders)\/[a-z0-9_-]+\/[a-z0-9_-]+\.(lua|js|agsl)$/.test(e.path ?? '')) return false;
      const got = await fetch(base + e.path);
      if (!got.ok) return false;
      const bytes = Buffer.from(await got.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== e.sha256) return false;
      mkdirSync(dirname(join(into, e.path)), { recursive: true });
      writeFileSync(join(into, e.path), bytes);
    }
    writeFileSync(join(into, 'index.json'), text);
    return true;
  } catch {
    return false;
  }
}

if (existsSync(out) && readdirSync(out).length) {
  console.log(`${outArg} isn't empty: give a new or empty folder`);
  process.exit(1);
}

console.log(`== the root, from ${git('rev-parse', '--abbrev-ref', 'HEAD')}`);
if (!check(process.cwd(), out, process.env.GITHUB_SHA ?? git('rev-parse', 'HEAD'))) {
  console.log('::error::The scripts at the root failed their check, so nothing is published');
  process.exit(1);
}

const prefix = local ? 'refs/heads/' : 'refs/remotes/origin/';
const branches = git('for-each-ref', '--format=%(refname)', prefix).split('\n').filter(Boolean)
  .map((ref) => ({ ref, version: ref.slice(prefix.length) }))
  .filter((b) => VERSION.test(b.version))
  .sort((a, b) => compare(a.version, b.version));

const published = [];
const failed = [];
const work = mkdtempSync(join(tmpdir(), 'kolahal-site-'));
for (const { ref, version } of branches) {
  if (compare(version, FIRST) < 0) {
    console.log(`== ${version}: left out, as Kolahal reads a version's folder from ${FIRST} on`);
    continue;
  }
  const sha = git('rev-parse', ref);
  const dir = join(work, version);
  const into = join(out, version);
  console.log(`== ${version}, from ${ref.replace(/^refs\/(heads|remotes)\//, '')} at ${sha.slice(0, 7)}`);
  git('worktree', 'add', '--detach', '--quiet', dir, sha);
  try {
    if (check(dir, into, sha)) {
      published.push(version);
      continue;
    }
  } finally {
    git('worktree', 'remove', '--force', dir);
  }
  rmSync(into, { recursive: true, force: true });
  const kept = live && (await keepLive(version, into));
  if (!kept) rmSync(into, { recursive: true, force: true });
  failed.push(version);
  console.log(`::error::The ${version} branch failed its check: ${kept
    ? `its folder stays as it was published before`
    : `it has no folder, so Kolahal ${version} reads the root`}`);
}
rmSync(work, { recursive: true, force: true });

console.log(`== the site: the root${published.map((v) => `, ${v}/`).join('')}` +
  (failed.length ? `; failed: ${failed.join(', ')}` : ''));
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed.join(' ')}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '| Folder | Built from |', '| --- | --- |', '| (root) | main |',
    ...published.map((v) => `| ${v}/ | ${v} |`),
    ...failed.map((v) => `| ${v}/ | **failed its check**: ${live ? 'the published folder is kept, if there was one' : 'left out'} |`),
    '',
  ].join('\n'));
}
process.exit(failed.length ? 2 : 0);
