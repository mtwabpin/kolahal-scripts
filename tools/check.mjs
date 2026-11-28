#!/usr/bin/env node
// Checks every script in scripts/ and every shader in shaders/, the way a pull request is checked. With
// `--out <dir>` it also writes what Kolahal reads from GitHub Pages: <dir>/index.json,
// <dir>/scripts/<name>/<file> and <dir>/shaders/<name>/<name>.agsl.
//
//   node tools/check.mjs            check only
//   node tools/check.mjs --out _site
//
// No dependencies (Node 20 or newer). Lua syntax needs `luac5.4` or `luac`; without one, Lua
// scripts are only checked for syntax on GitHub. Shaders are not compiled: Android has the compiler.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The rules themselves are in rules.mjs, which Kolahal's website runs too: this file reads the files, checks
// their syntax, and writes what is published.
import { NAME, RESERVED, checkScript, checkShader, normalizeTime, oneLine, parseInterval, value } from './rules.mjs';

const luac = ['luac5.4', 'luac'].find((cmd) => {
  try { execFileSync(cmd, ['-v'], { stdio: 'ignore' }); return true; } catch { return false; }
});
// Kolahal runs a JavaScript script as the body of an async function (so it may `return` and `await`).
const AsyncFunction = (async () => {}).constructor;

function syntaxError(path, lang, code) {
  if (lang === 'js') {
    try { new AsyncFunction(code); return null; } catch (e) { return e.message; }
  }
  if (!luac) return process.env.CI ? 'no luac to check Lua syntax with' : null;
  try { execFileSync(luac, ['-p', path], { stdio: 'pipe' }); return null; } catch (e) {
    return String(e.stderr || e.message).trim().split('\n')[0];
  }
}

/** An issue as check.mjs prints it: its line, then its words in one line. */
const said = (x) => `line ${x.line}: ${oneLine(x)}`;

function check(dir) {
  const problems = [];
  const files = readdirSync(join('scripts', dir)).filter((f) => /\.(lua|js)$/.test(f));
  if (files.length !== 1) {
    if (!NAME.test(dir)) problems.push('folder name: lowercase letters, digits, - and _ only, up to 40');
    if (RESERVED.includes(dir)) problems.push(`folder name: ${dir} is a Kolahal command, so Kolahal doesn't install a script of that name`);
    return { problems: [...problems, `one .lua or .js file per folder, found ${files.length}`] };
  }
  const file = files[0];
  const lang = file.endsWith('.js') ? 'js' : 'lua';
  if (file !== `${dir}.${lang}`) problems.push(`the file must be named ${dir}.${lang}`);
  const path = join('scripts', dir, file);
  const bytes = readFileSync(path);
  const code = bytes.toString('utf8');

  // What Kolahal's editor would say, and what the library asks for besides (rules.mjs).
  const { kolahal, library, header } = checkScript({ name: dir, code, lang });
  const all = [...kolahal, ...library].sort((a, b) => a.line - b.line);
  problems.push(...all.filter((x) => x.level === 'error').map(said));
  const warnings = all.filter((x) => x.level === 'warning').map(said);
  const syntax = syntaxError(path, lang, code);
  if (syntax) problems.push(`syntax: ${syntax}`);

  const every = value(code, 'every');
  return {
    problems,
    warnings,
    entry: {
      name: dir,
      lang,
      path: `scripts/${dir}/${file}`,
      title: header.title,
      desc: header.desc,
      author: header.author,
      version: header.version,
      tags: header.tags,
      uses: header.uses,
      on: header.events,
      // One with a screen of its own is a command, as Kolahal reads it.
      command: header.command,
      every: every ? parseInterval(every) || null : null,
      at: (value(code, 'at') ?? '').split(/[,\s]+/).filter(Boolean).map(normalizeTime).filter(Boolean),
      notify: header.notify,
      requires: header.requires,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

// ---- shaders (AGSL, Kolahal 0.5.17 and newer) ----------------------------------------------------

function checkShaderDir(dir) {
  const files = readdirSync(join('shaders', dir));
  const file = `${dir}.agsl`;
  if (files.length !== 1 || files[0] !== file) return { problems: [`one file per folder, ${file}, found ${files.join(', ') || 'none'}`] };
  const path = `shaders/${dir}/${file}`;
  const bytes = readFileSync(path);
  const code = bytes.toString('utf8');
  const problems = [];
  if (!Buffer.from(code, 'utf8').equals(bytes)) problems.push('not UTF-8 text');
  // Shaders are not compiled here: Android has the compiler (and the website's Shader preview, Skia's own).
  const { kolahal, library, header } = checkShader({ name: dir, code });
  const all = [...kolahal, ...library].sort((a, b) => a.line - b.line);
  problems.push(...all.filter((x) => x.level === 'error').map(said));
  return {
    problems,
    warnings: all.filter((x) => x.level === 'warning').map(said),
    entry: {
      name: dir,
      path,
      title: header.title,
      desc: header.desc,
      author: header.author,
      version: header.version,
      license: header.license,
      tags: header.tags.map((t) => t.toLowerCase()),
      animated: header.animated,
      // It follows how the phone leans: Kolahal says so in Get more shaders.
      tilt: header.tilt,
      requires: header.requires,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

const folders = (root) => (existsSync(root) ? readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory()).sort() : []);
const dirs = folders('scripts');
let failed = false;
const entries = [];
for (const dir of dirs) {
  const { problems, warnings, entry } = check(dir);
  for (const w of warnings ?? []) console.log(`::warning file=scripts/${dir}::${dir}: ${w}`);
  if (problems.length) {
    failed = true;
    for (const p of problems) console.log(`::error file=scripts/${dir}::${dir}: ${p}`);
  } else {
    console.log(`ok  ${entry.path}  ${entry.title} ${entry.version}`);
    entries.push(entry);
  }
}
const shaders = [];
for (const dir of folders('shaders')) {
  const { problems, warnings, entry } = checkShaderDir(dir);
  for (const w of warnings ?? []) console.log(`::warning file=shaders/${dir}::${dir}: ${w}`);
  if (problems.length) {
    failed = true;
    for (const p of problems) console.log(`::error file=shaders/${dir}::${dir}: ${p}`);
  } else {
    console.log(`ok  ${entry.path}  ${entry.title} ${entry.version}`);
    shaders.push(entry);
  }
}
if (failed) process.exit(1);

const out = process.argv.indexOf('--out');
if (out > 0) {
  const site = process.argv[out + 1];
  for (const e of entries) {
    mkdirSync(join(site, 'scripts', e.name), { recursive: true });
    copyFileSync(e.path, join(site, e.path));
  }
  for (const s of shaders) {
    mkdirSync(join(site, 'shaders', s.name), { recursive: true });
    copyFileSync(s.path, join(site, s.path));
  }
  // `shaders` is beside `scripts` and format stays 1: a Kolahal from before shaders reads only `scripts`.
  const index = { format: 1, commit: process.env.GITHUB_SHA ?? null, scripts: entries, ...(shaders.length ? { shaders } : {}) };
  writeFileSync(join(site, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`wrote ${join(site, 'index.json')}: ${entries.length} scripts, ${shaders.length} shaders`);
}
