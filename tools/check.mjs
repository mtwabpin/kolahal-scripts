#!/usr/bin/env node
// Checks every script in scripts/, the way a pull request is checked. With `--out <dir>` it also
// writes what Kolahal reads from GitHub Pages: <dir>/index.json and <dir>/scripts/<name>/<file>.
//
//   node tools/check.mjs            check only
//   node tools/check.mjs --out _site
//
// No dependencies (Node 20 or newer). Lua syntax needs `luac5.4` or `luac`; without one, Lua
// scripts are only checked for syntax on GitHub.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// As Kolahal's ScriptMeta: what `@uses` and `@on` may name.
const USES = ['notifications', 'clipboard', 'apps', 'lan', 'commands', 'dnd', 'work'];
const EVENTS = ['unlock', 'charger', 'unplug', 'wifi', 'offline', 'notification', 'boot', 'headset'];
const NAME = /^[a-z0-9_-]{1,40}$/;
const VERSION = /^\d+(\.\d+){0,2}$/;
const MAX_BYTES = 64 * 1024;
const MAX_LINE = 300; // longer lines are usually minified code, which nobody can review
// Calls Kolahal stops unless the script declares them with `@uses`.
const NEEDS = [
  [/\bapps\.list\s*\(/, 'apps', 'apps.list()'],
  [/\bclipboard\.(get|set)\s*\(/, 'clipboard', 'clipboard.get() or .set()'],
  [/\bnotifications\.recent\s*\(/, 'notifications', 'notifications.recent()'],
  [/\blauncher\.run\s*\(/, 'commands', 'launcher.run()'],
  [/\bdevice\.(dnd|setDnd)\s*\(/, 'dnd', 'device.dnd() or .setDnd()'],
  [/\bdevice\.(work|setWork)\s*\(/, 'work', 'device.work() or .setWork()'],
];
const REQUIRED = ['title', 'desc', 'author', 'version'];
// As Kolahal's ScriptMeta.secrets: `@secret NAME site[,site] description`.
const SECRET_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SECRETS_SINCE = '0.4.0';
// fmt.*, md.* and logs(): an older Kolahal stops the script with an error.
const STYLES_SINCE = '0.4.1';
// @uses dnd and work, with device.dnd, setDnd, work and setWork.
const DEVICE_SINCE = '0.4.4';
// As Kolahal's ScriptMeta.options: `@option name default description`, read as options.name.
const OPTION_NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const OPTIONS_SINCE = '0.4.7';

const directive = (code, name) => {
  const m = code.match(new RegExp(`^\\s*(--|//)\\s*@${name}\\b[ \\t]*(.*)$`, 'm'));
  return m ? m[2].trim() : null;
};
const allLines = (code, name) =>
  [...code.matchAll(new RegExp(`^\\s*(--|//)\\s*@${name}\\b(.*)$`, 'gm'))]
    .flatMap((m) => m[2].split(/[,\s]+/)).map((s) => s.trim().toLowerCase()).filter(Boolean);
const has = (code, name) => new RegExp(`^\\s*(--|//)\\s*@${name}\\b`, 'm').test(code);

/** True when version a is older than b ("0.3.1" < "0.4.0"). */
const older = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
};

/** "15m", "2h", "1d" or minutes: minutes, or null. */
const interval = (v) => {
  const m = /^(\d+)([mhd]?)$/.exec((v ?? '').toLowerCase());
  if (!m) return null;
  const n = Number(m[1]) * ({ h: 60, d: 1440 }[m[2]] ?? 1);
  return n > 0 && n <= 7 * 1440 ? n : null;
};
const clock = (v) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
};

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

function check(dir) {
  const problems = [];
  const files = readdirSync(join('scripts', dir)).filter((f) => /\.(lua|js)$/.test(f));
  if (!NAME.test(dir)) problems.push('folder name: lowercase letters, digits, - and _ only, up to 40');
  if (files.length !== 1) return { problems: [...problems, `one .lua or .js file per folder, found ${files.length}`] };
  const file = files[0];
  const lang = file.endsWith('.js') ? 'js' : 'lua';
  if (file !== `${dir}.${lang}`) problems.push(`the file must be named ${dir}.${lang}`);
  const path = join('scripts', dir, file);
  const bytes = readFileSync(path);
  const code = bytes.toString('utf8');

  // Kolahal (Android) also breaks lines at \v, \f, U+0085, U+2028 and U+2029: a directive hidden behind
  // one would be read by the app and missed here, so only \n and \r\n are allowed.
  if (/[\v\f\u0085\u2028\u2029]|\r(?!\n)/.test(code)) problems.push('line breaks: only \\n or \\r\\n (no \\v, \\f, U+0085, U+2028, U+2029 or a lone \\r)');
  for (const name of REQUIRED) if (!directive(code, name)) problems.push(`needs a @${name} line`);
  const version = directive(code, 'version');
  if (version && !VERSION.test(version)) problems.push(`@version ${version}: use numbers like 1.2`);
  const requires = directive(code, 'requires');
  if (requires && !VERSION.test(requires)) problems.push(`@requires ${requires}: a Kolahal version like 0.4.0`);
  const uses = allLines(code, 'uses');
  const on = allLines(code, 'on');
  for (const u of uses) if (!USES.includes(u)) problems.push(`@uses ${u}: not something a script can ask for (${USES.join(', ')})`);
  for (const e of on) if (!EVENTS.includes(e)) problems.push(`@on ${e}: not an event (${EVENTS.join(', ')})`);
  for (const [call, what, shown] of NEEDS) if (call.test(code) && !uses.includes(what)) problems.push(`calls ${shown} but has no "@uses ${what}"`);
  if (on.includes('notification') && !uses.includes('notifications')) problems.push('@on notification needs "@uses notifications"');
  // API keys: named with @secret, sent only to a site it names, read with secrets.get.
  const secrets = [...code.matchAll(/^\s*(--|\/\/)\s*@secret\b(.*)$/gm)].map((m) => m[2].trim().split(/\s+/));
  for (const [name = '', hosts = '', ...desc] of secrets) {
    if (!SECRET_NAME.test(name)) problems.push(`@secret ${name}: a name like OWM_KEY (letters, digits and _, up to 40)`);
    const sites = hosts.toLowerCase().split(',').filter(Boolean);
    if (!sites.length) problems.push(`@secret ${name}: name the site it is sent to, like api.example.com`);
    for (const h of sites) if (!HOST.test(h)) problems.push(`@secret ${name} ${h}: name the site it is sent to, like api.example.com`);
    if (!desc.length) problems.push(`@secret ${name}: add a few words saying what it is and where to get one`);
  }
  const declared = secrets.map(([name]) => name);
  for (const m of code.matchAll(/\bsecrets\.get\s*\(\s*["'`]([^"'`]*)["'`]/g)) {
    if (!declared.includes(m[1])) problems.push(`calls secrets.get("${m[1]}") but has no "@secret ${m[1]} <site> <description>"`);
  }
  if ((secrets.length || /\bsecrets\.get\s*\(/.test(code)) && !(requires && VERSION.test(requires) && !older(requires, SECRETS_SINCE))) {
    problems.push(`uses secrets, so it needs "@requires ${SECRETS_SINCE}" or newer`);
  }
  if (/\b(fmt|md)\.\w+\s*\(|\blogs\s*\(/.test(code) && !(requires && VERSION.test(requires) && !older(requires, STYLES_SINCE))) {
    problems.push(`uses fmt, md or logs, so it needs "@requires ${STYLES_SINCE}" or newer`);
  }
  if ((uses.includes('dnd') || uses.includes('work')) && !(requires && VERSION.test(requires) && !older(requires, DEVICE_SINCE))) {
    problems.push(`uses dnd or work, so it needs "@requires ${DEVICE_SINCE}" or newer`);
  }
  // Settings: each named once, with a default and a description; each one the code reads declared
  // (a misspelt name reads as nil). Comment lines are left out, so a note about options.x isn't a read.
  const options = [...code.matchAll(/^\s*(--|\/\/)\s*@option\b(.*)$/gm)]
    .map((m) => /^(\S*)\s*("[^"]*"|\S*)\s*(.*)$/.exec(m[2].trim()));
  const optionNames = [];
  for (const [, name, def, desc] of options) {
    if (!OPTION_NAME.test(name)) problems.push(`@option ${name}: a name like city (letters, digits and _, up to 32)`);
    else if (optionNames.includes(name)) problems.push(`@option ${name}: named twice`);
    else if (!def) problems.push(`@option ${name}: give its default after the name ("" for none)`);
    else if (!desc) problems.push(`@option ${name}: add a few words saying what it sets`);
    optionNames.push(name);
  }
  const body = code.split('\n').filter((line) => !/^\s*(--|\/\/)/.test(line)).join('\n');
  const read = [...new Set([...body.matchAll(/\boptions\.(\w+)/g)].map((m) => m[1]))];
  for (const name of read) if (!optionNames.includes(name)) problems.push(`reads options.${name} but has no "@option ${name} <default> <description>"`);
  if ((options.length || read.length) && !(requires && VERSION.test(requires) && !older(requires, OPTIONS_SINCE))) {
    problems.push(`has options, so it needs "@requires ${OPTIONS_SINCE}" or newer`);
  }
  const every = directive(code, 'every');
  if (every && !interval(every)) problems.push(`@every ${every}: use 15m, 2h or 1d`);
  const at = (directive(code, 'at') ?? '').split(/[,\s]+/).filter(Boolean);
  for (const t of at) if (!clock(t)) problems.push(`@at ${t}: use HH:mm`);

  if (bytes.length > MAX_BYTES) problems.push(`${bytes.length} bytes: at most ${MAX_BYTES}`);
  code.split('\n').forEach((line, i) => {
    if (line.length > MAX_LINE) problems.push(`line ${i + 1} is ${line.length} characters: at most ${MAX_LINE}, so it can be read`);
  });
  const syntax = syntaxError(path, lang, code);
  if (syntax) problems.push(`syntax: ${syntax}`);

  return {
    problems,
    entry: {
      name: dir,
      lang,
      path: `scripts/${dir}/${file}`,
      title: directive(code, 'title'),
      desc: directive(code, 'desc'),
      author: directive(code, 'author'),
      version,
      tags: (directive(code, 'tags') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      uses: USES.filter((u) => uses.includes(u)),
      on: EVENTS.filter((e) => on.includes(e)),
      command: has(code, 'command'),
      every: every ? interval(every) : null,
      at: at.map(clock).filter(Boolean),
      notify: has(code, 'notify'),
      requires,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

const dirs = existsSync('scripts') ? readdirSync('scripts').filter((d) => statSync(join('scripts', d)).isDirectory()).sort() : [];
let failed = false;
const entries = [];
for (const dir of dirs) {
  const { problems, entry } = check(dir);
  if (problems.length) {
    failed = true;
    for (const p of problems) console.log(`::error file=scripts/${dir}::${dir}: ${p}`);
  } else {
    console.log(`ok  ${entry.path}  ${entry.title} ${entry.version}`);
    entries.push(entry);
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
  const index = { format: 1, commit: process.env.GITHUB_SHA ?? null, scripts: entries };
  writeFileSync(join(site, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  console.log(`wrote ${join(site, 'index.json')}: ${entries.length} scripts`);
}
