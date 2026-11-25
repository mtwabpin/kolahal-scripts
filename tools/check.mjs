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

// As Kolahal's ScriptMeta: what `@uses` and `@on` may name.
const USES = ['notifications', 'clipboard', 'apps', 'commands', 'dnd', 'work', 'todos', 'notes', 'reminders', 'calendar', 'feeds', 'usage', 'screen', 'effects'];
const EVENTS = ['unlock', 'charger', 'unplug', 'wifi', 'offline', 'notification', 'boot', 'headset'];
// As Kolahal's ScriptCheck: every `@` line a script's header may have. Any other is a typo (`@evrey`).
const DIRECTIVES = ['command', 'desc', 'usage', 'on', 'uses', 'secret', 'option', 'title', 'author', 'version', 'tags', 'every', 'at', 'notify', 'requires', 'widget', 'gives'];
const NAME = /^[a-z0-9_-]{1,40}$/;
// As Kolahal 0.5.17's CommandCatalog.RESERVED_NAMES: the built-in commands and their other names. Kolahal
// doesn't install a script of one of these names. Each version branch has the list of its Kolahal.
const RESERVED = [
  'activity', 'agenda', 'alarm', 'alarms', 'alias', 'allow', 'apps', 'backup', 'bluetooth', 'boot', 'brightness',
  'bt', 'cal', 'call', 'calls', 'clear', 'clock', 'cls', 'config', 'contact', 'contacts', 'crashes', 'data', 'date',
  'decode', 'dial', 'dnd', 'echo', 'edit', 'fastfetch', 'fav', 'favs', 'feed', 'feeds', 'fetch', 'font', 'fresh', 'g',
  'help', 'hide', 'history', 'home', 'info', 'installs', 'js', 'launch', 'lock', 'log', 'ls', 'lua', 'map', 'maps',
  'matrix', 'media', 'mp', 'neofetch', 'next', 'nfc', 'note', 'notes', 'notifications', 'notifs', 'open', 'pin',
  'pins', 'pipes', 'play', 'prefs', 'prev', 'private', 'reboot', 'remind', 'reminders', 'rename', 'restart', 'ring',
  'rotate', 'rss', 'scramble', 'screen', 'screen-timeout', 'screentime', 'script', 'scripts', 'search', 'set',
  'settings', 'setup', 'shade', 'shader', 'shortcuts', 'sl', 'sms', 'source', 'status', 'stopwatch', 'storage',
  'store', 'system', 'text', 'theme', 'time', 'timer', 'todo', 'toggles', 'top', 'torch', 'tour', 'unalias', 'unfav',
  'unhide', 'uninstall', 'unlocks', 'unpin', 'update', 'updates', 'url', 'usage', 'vol', 'volume', 'wallpaper', 'web',
  'widget', 'widgets', 'wifi', 'wiki', 'work', 'youtube', 'yt',
];
const VERSION = /^\d+(\.\d+){0,2}$/;
const MAX_BYTES = 64 * 1024;
const MAX_LINE = 300; // longer lines are usually minified code, which nobody can review
// As Kolahal's ScriptCheck.NEEDS: calls Kolahal stops unless the script declares them with `@uses`.
// Comment lines are left out, as a note about a call is not one.
const NEEDS = [
  [/(?<![.\w])notifications\s*\.\s*recent\b/, 'notifications', 'notifications.recent()'],
  [/(?<![.\w])clipboard\s*\.\s*\w+/, 'clipboard', 'clipboard.get() or .set()'],
  [/(?<![.\w])apps\s*\.\s*list\b/, 'apps', 'apps.list()'],
  [/(?<![.\w])launcher\s*\.\s*run\b/, 'commands', 'launcher.run()'],
  [/(?<![.\w])device\s*\.\s*(dnd|setDnd)\b/, 'dnd', 'device.dnd() or .setDnd()'],
  [/(?<![.\w])device\s*\.\s*(work|setWork)\b/, 'work', 'device.work() or .setWork()'],
  [/(?<![.\w])todos\s*\.\s*(list|setDone)\b/, 'todos', 'todos.list() or .setDone()'],
  [/(?<![.\w])notes\s*\.\s*list\b/, 'notes', 'notes.list()'],
  [/(?<![.\w])reminders\s*\.\s*list\b/, 'reminders', 'reminders.list()'],
  [/(?<![.\w])calendar\s*\.\s*events\b/, 'calendar', 'calendar.events()'],
  [/(?<![.\w])feeds\s*\.\s*unread\b/, 'feeds', 'feeds.unread()'],
  [/(?<![.\w])usage\s*\.\s*(today|days|data|summary|unused)\b/, 'usage', 'usage.today(), .days(), .data(), .summary() or .unused()'],
  [/(?<![.\w])tty\s*\.\s*screen\b/, 'screen', 'tty.screen()'],
  [/(?<![.\w])shader\s*\.\s*play\b/, 'effects', 'shader.play()'],
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
// A full-screen screen of its own (`@uses screen`, tty.screen), one-off shaders (`@uses effects`,
// shader.play) and values for shaders (`@gives`, shader.give).
const SCREEN_SINCE = '0.5.17';
// As Kolahal's ScriptMeta.isScreen and ScriptCheck.SCREEN_REFUSES: a script with a screen of its own runs
// only when you start it, so these lines would count for nothing in it.
const SCREEN_REFUSES = ['every', 'at', 'on', 'widget'];
// As Kolahal's ShaderValues: a value's name on a `@gives` line, and how many a script may give.
const GIVES_NAME = /^[a-z][a-z0-9_-]{0,19}$/;
const GIVES_MAX = 8;
// As Kolahal's WidgetKind.forScripts and WidgetSize: `@widget <kind> [<size>]`.
const WIDGET_KINDS = ['stat', 'text', 'list', 'progress', 'chart', 'countdown', 'buttons', 'toggles', 'clock', 'agenda', 'image', 'versus', 'sky'];
const WIDGET_SIZES = ['1x1', '2x1', '2x2', '4x1', '4x2', '4x4'];
// As Kolahal's WidgetKind.sizes: the sizes each kind is made for. Kolahal takes any of WIDGET_SIZES on the
// line, so another one is a warning, not an error.
const WIDGET_SIZES_OF = {
  stat: ['1x1', '2x1', '2x2', '4x1'],
  text: ['2x1', '2x2', '4x1', '4x2'],
  list: ['2x2', '4x2', '4x4'],
  progress: ['1x1', '2x1', '2x2', '4x1', '4x2'],
  chart: ['2x1', '2x2', '4x2'],
  countdown: ['1x1', '2x1', '2x2'],
  buttons: ['2x1', '2x2', '4x1', '4x2'],
  toggles: ['2x1', '2x2', '4x1'],
  clock: ['2x1', '2x2', '4x1'],
  agenda: ['2x2', '4x2', '4x4'],
  image: ['2x1', '2x2', '4x2', '4x4'],
  versus: ['2x1', '2x2', '4x1', '4x2'],
  sky: ['2x1', '2x2'],
};
// Widgets of Kolahal 0.5.17: the versus and sky kinds, a progress widget's gauge, rings and stages, and a
// stat's scene, each found in the code with its kind or field. A stat's `points` and a ring's `unit` and
// `moving` are 0.5.17's too, but their names are also older fields' (a chart's points), so they aren't looked for.
const WIDGETS_SINCE = '0.5.17';
const NOT_DECLARED = '(?<!\\b(?:local|const|let|var)\\s+)(?<![.\\w$])["\']?';
const WIDGETS_NEW = [
  [new RegExp(`${NOT_DECLARED}kind["']?\\s*[:=]\\s*["'\`]\\s*versus\\s*["'\`]`, 'i'), 'a versus widget'],
  [new RegExp(`${NOT_DECLARED}kind["']?\\s*[:=]\\s*["'\`]\\s*sky\\s*["'\`]`, 'i'), 'a sky widget'],
  [new RegExp(`${NOT_DECLARED}style["']?\\s*[:=]\\s*["'\`]\\s*(gauge|rings)\\s*["'\`]`, 'i'), 'a progress widget\'s gauge or rings'],
  [new RegExp(`${NOT_DECLARED}stages["']?\\s*[:=](?!=)`), 'a progress widget\'s stages'],
  [new RegExp(`${NOT_DECLARED}scene["']?\\s*[:=](?!=)`), 'a stat\'s scene'],
];

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
  const warnings = [];
  const files = readdirSync(join('scripts', dir)).filter((f) => /\.(lua|js)$/.test(f));
  if (!NAME.test(dir)) problems.push('folder name: lowercase letters, digits, - and _ only, up to 40');
  if (RESERVED.includes(dir)) problems.push(`folder name: ${dir} is a Kolahal command, so Kolahal doesn't install a script of that name`);
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
  // The code with its comment lines emptied: a note about `options.x` or `tty.screen` is not a use of it.
  const body = code.split('\n').map((line) => (/^\s*(--|\/\/)/.test(line) ? '' : line)).join('\n');
  for (const name of REQUIRED) if (!directive(code, name)) problems.push(`needs a @${name} line`);
  const named = [...code.matchAll(/^\s*(--|\/\/)\s*@(\w+)\b/gm)].map((m) => m[2]);
  for (const name of new Set(named)) if (!DIRECTIVES.includes(name)) problems.push(`@${name}: not a line Kolahal reads (${DIRECTIVES.map((d) => `@${d}`).join(', ')})`);
  const version = directive(code, 'version');
  if (version && !VERSION.test(version)) problems.push(`@version ${version}: use numbers like 1.2`);
  const requires = directive(code, 'requires');
  if (requires && !VERSION.test(requires)) problems.push(`@requires ${requires}: a Kolahal version like 0.4.0`);
  const uses = allLines(code, 'uses');
  const on = allLines(code, 'on');
  for (const u of uses) if (!USES.includes(u)) problems.push(`@uses ${u}: not something a script can ask for (${USES.join(', ')})`);
  for (const e of on) if (!EVENTS.includes(e)) problems.push(`@on ${e}: not an event (${EVENTS.join(', ')})`);
  for (const [call, what, shown] of NEEDS) if (call.test(body) && !uses.includes(what)) problems.push(`calls ${shown} but has no "@uses ${what}"`);
  if (on.includes('notification') && !uses.includes('notifications')) problems.push('@on notification needs "@uses notifications"');
  // A full-screen screen of its own: a command, and nothing else.
  const screen = uses.includes('screen');
  if (screen) {
    for (const name of SCREEN_REFUSES) if (has(code, name)) problems.push(`@${name} doesn't work with @uses screen: a script that draws a full screen runs only when you start it`);
  }
  // Values for shaders: each name on a @gives line, and each one shader.give names declared there.
  const gives = allLines(code, 'gives');
  for (const g of gives) if (!GIVES_NAME.test(g)) problems.push(`@gives ${g}: a name like rain (small letters, digits, - and _, up to 20)`);
  if (new Set(gives).size > GIVES_MAX) problems.push(`@gives: at most ${GIVES_MAX} values`);
  for (const m of body.matchAll(/(?<![.\w])shader\s*\.\s*give\s*\(\s*["'`]([^"'`]*)["'`]/g)) {
    if (!gives.includes(m[1].toLowerCase())) problems.push(`calls shader.give("${m[1]}") but has no "@gives ${m[1].toLowerCase()}"`);
  }
  if (/(?<![.\w])shader\s*\.\s*give\b/.test(body) && !gives.length) problems.push('calls shader.give() but has no @gives line');
  if ((screen || uses.includes('effects') || has(code, 'gives')) && !(requires && VERSION.test(requires) && !older(requires, SCREEN_SINCE))) {
    problems.push(`uses screen, effects or @gives, so it needs "@requires ${SCREEN_SINCE}" or newer`);
  }
  // As Kolahal's ScriptCheck: the first @widget line names a kind a script can fill, and maybe its size.
  const widget = directive(code, 'widget');
  if (widget !== null) {
    const [kind = '', size] = widget.split(/\s+/);
    const k = kind.toLowerCase();
    const s = (size ?? '').toLowerCase().replace('×', 'x');
    if (!WIDGET_KINDS.includes(k)) problems.push(`@widget ${kind}: not a kind of widget (${WIDGET_KINDS.join(', ')})`);
    else if (size && !WIDGET_SIZES.includes(s)) problems.push(`@widget ${kind} ${size}: not a size (${WIDGET_SIZES.join(', ')})`);
    else if (size && !WIDGET_SIZES_OF[k].includes(s)) warnings.push(`@widget ${kind} ${size}: ${k} is made for ${WIDGET_SIZES_OF[k].join(', ')}; Kolahal draws it at ${s} all the same`);
    // A kind or field of 0.5.17's widgets: an older Kolahal stops widget.show with an error.
    const found = [
      ...(['versus', 'sky'].includes(k) ? [`a ${k} widget`] : []),
      ...WIDGETS_NEW.filter(([re]) => re.test(body)).map(([, what]) => what),
    ];
    if (found.length && !(requires && VERSION.test(requires) && !older(requires, WIDGETS_SINCE))) {
      problems.push(`uses ${[...new Set(found)].join(', ')}, so it needs "@requires ${WIDGETS_SINCE}" or newer`);
    }
  }
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
    warnings,
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
      // One with a screen of its own is a command, as Kolahal reads it.
      command: has(code, 'command') || screen,
      every: every ? interval(every) : null,
      at: at.map(clock).filter(Boolean),
      notify: has(code, 'notify'),
      requires,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  };
}

// ---- shaders (AGSL, Kolahal 0.5.17 and newer) ----------------------------------------------------

// As Kolahal's ShaderCatalog: a shader's name is one word at the prompt, and none of the `shader`
// command's own words (WORDS). Those that come with Kolahal (BUNDLED) can't be shared under their names,
// and `template-…` is for the templates it has (TEMPLATES).
const SHADER_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const SHADER_WORDS = ['ls', 'use', 'on', 'off', 'set', 'reset', 'follow', 'values', 'play', 'words', 'get', 'check', 'reload', 'save', 'edit', 'rm', 'delete'];
const SHADER_BUNDLED = [
  'crt', 'lcd', 'eink', 'paper', 'riso', 'graph', 'foil', 'lamp', 'dusk', 'frost',
  'mountains', 'pond', 'dunes', 'rain', 'snowfall', 'grove-snow', 'grove-autumn', 'aurora', 'night', 'fireflies',
  'contour', 'ink', 'aura', 'day-ring', 'lanterns', 'kintsugi', 'record', 'candle', 'hourglass', 'windows',
  'seismograph', 'hearts', 'pulse',
];
const SHADERS_SINCE = '0.5.17';
// As Kolahal's ShaderMeta: how many numbers each type holds, and the uniforms Kolahal sets, with theirs.
const FLOATS = {
  float: 1, half: 1, float2: 2, half2: 2, vec2: 2, float3: 3, half3: 3, vec3: 3, float4: 4, half4: 4, vec4: 4,
};
const UNIFORMS = {
  resolution: 2, cell: 2, grid: 2, origin: 2, time: 1, touch: 2, touchAge: 1, dark: 1, date: 4, tilt: 2,
  pressed: 1, battery: 1, charging: 1, progress: 1, wallpaper: 1, corner: 1, cutout: 4,
  bg: 4, surface: 4, fg: 4, dim: 4, accent: 4, error: 4, warn: 4, good: 4, info: 4, link: 4,
};
const SHADER_REQUIRED = [['name', 'title'], ['description', 'desc'], ['author'], ['version'], ['license'], ['requires']];
// As Kolahal's ShaderParam: `// @param amount 0.0..2.0 = 1.0 Title [@follow value]` or `shape a|b = a Title`.
const PARAMS_MAX = 8;
const PARAM_LINE = /^([A-Za-z_]\w{0,39})\s+(\S+)\s*=\s*(\S+)\s*(.*)$/;
const PARAM_FOLLOW = /(?:^|\s+)@follow\s+(\S.*?)\s*$/;
const PARAM_RANGE = /^(-?\d+(?:\.\d+)?)\.\.(-?\d+(?:\.\d+)?)$/;
const PARAM_CHOICE = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
// As Kolahal's ShaderValues and UsageValues: the values a parameter can follow. Kolahal's own are one word,
// or one of its usage values; a script's is `<script>.<name>`, from the script's @gives line.
const USAGE_VALUES = [
  'unlocks', 'unlocks.usual', ...[1, 2, 3, 4, 5, 6, 7].map((d) => `unlocks.d${d}`),
  'screen', 'screen.usual', ...[1, 2, 3, 4, 5, 6, 7].map((d) => `screen.d${d}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((h) => `screen.h${h}`), 'away',
];
const OWN_VALUES = ['battery', 'charging', 'day', 'night', ...USAGE_VALUES];
const VALUE_GROUPS = ['unlocks', 'screen'];
const VALUE_ID = /[a-z0-9_][a-z0-9_-]*\.[a-z][a-z0-9_-]*|[a-z][a-z0-9_]*/g;
// As Kolahal's ShaderClock: `@fps` 1 to 30, `@settles` 0.5 to 60 seconds. One that can't be read is a
// warning, as in Kolahal: the shader works without it.
const FPS_MAX = 30;
const SETTLES = [0.5, 60];

/** The shader's header, as Kolahal's ShaderMeta reads it: each `// @name value`, the first of a name. */
function shaderHeader(code) {
  const tags = new Map();
  for (const line of code.split('\n')) {
    const m = /^\s*\/\/\s*@([A-Za-z]+)\b[ \t]*(.*)$/.exec(line);
    if (m && !tags.has(m[1].toLowerCase())) tags.set(m[1].toLowerCase(), m[2].trim());
  }
  return tags;
}

/** What is wrong with the text after `@param`, or null when Kolahal reads it ([ShaderParam.read]). */
function paramProblem(line) {
  const m = PARAM_LINE.exec(line.trim());
  if (!m) return 'can\'t be read';
  const [, , values, first] = m;
  const range = PARAM_RANGE.exec(values);
  if (range) {
    const [min, max] = [Number(range[1]), Number(range[2])];
    if (!NUMBER.test(first)) return `its default ${first} isn't a number`;
    if (min >= max) return `${values}: the first number must be the smaller`;
    if (Number(first) < min || Number(first) > max) return `its default ${first} isn't in ${values}`;
    return null;
  }
  const choices = values.split('|');
  if (choices.length < 2 || choices.length > 4) return `${values}: a range like 0.0..2.0, or two to four words like a|b`;
  if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) return `${values}: a word is there twice`;
  if (!choices.every((c) => PARAM_CHOICE.test(c))) return `${values}: words of letters, digits and -, up to 20`;
  if (!choices.includes(first)) return `its default ${first} isn't one of ${values}`;
  return null;
}

/** What is wrong with the value a `@follow` names ([ShaderValues.parse]), or null when Kolahal reads one. */
function followProblem(text) {
  const id = [...text.toLowerCase().matchAll(VALUE_ID)].map((m) => m[0])
    .find((w) => OWN_VALUES.includes(w) || w.includes('.'));
  if (!id) return `names no value: ${OWN_VALUES.slice(0, 4).join(', ')}, unlocks, screen, away… or a script's, such as weather.rain`;
  if (VALUE_GROUPS.includes(id.split('.')[0]) && !OWN_VALUES.includes(id)) return `${id} isn't one of Kolahal's values`;
  return null;
}

function checkShader(dir) {
  const problems = [];
  const warnings = [];
  const files = readdirSync(join('shaders', dir));
  if (!SHADER_NAME.test(dir)) problems.push('folder name: lowercase letters, digits, - and _ only, up to 40, starting with a letter or digit');
  if (SHADER_WORDS.includes(dir)) problems.push(`folder name: ${dir} is a word of the shader command`);
  if (SHADER_BUNDLED.includes(dir)) problems.push(`folder name: ${dir} comes with Kolahal`);
  if (dir.startsWith('template-')) problems.push('folder name: template-… names are for the templates that come with Kolahal');
  const file = `${dir}.agsl`;
  if (files.length !== 1 || files[0] !== file) return { problems: [...problems, `one file per folder, ${file}, found ${files.join(', ') || 'none'}`] };
  const path = `shaders/${dir}/${file}`;
  const bytes = readFileSync(path);
  const code = bytes.toString('utf8');

  if (!Buffer.from(code, 'utf8').equals(bytes)) problems.push('not UTF-8 text');
  if (/[\v\f\u0085\u2028\u2029]|\r(?!\n)/.test(code)) problems.push('line breaks: only \\n or \\r\\n (no \\v, \\f, U+0085, U+2028, U+2029 or a lone \\r)');
  const tags = shaderHeader(code);
  const said = (...names) => names.map((n) => tags.get(n)).find((v) => v) ?? null;
  for (const names of SHADER_REQUIRED) if (!said(...names)) problems.push(`needs a // @${names[0]} line`);
  const version = said('version');
  if (version && !VERSION.test(version)) problems.push(`@version ${version}: use numbers like 1.2`);
  const requires = said('requires');
  if (requires && (!VERSION.test(requires) || older(requires, SHADERS_SINCE))) problems.push(`@requires ${requires}: ${SHADERS_SINCE} or newer, the first Kolahal with shaders`);
  // A one-off shader (`@once 6`) moves, as an @animated one does.
  const once = said('once');
  const animated = tags.has('animated') || (once !== null && NUMBER.test(once));
  const fps = tags.get('fps');
  if (fps !== undefined && !(/^[-+]?\d+$/.test(fps) && Number(fps) >= 1 && Number(fps) <= FPS_MAX)) warnings.push(`@fps ${fps}: a whole number from 1 to ${FPS_MAX}; Kolahal leaves the line out`);
  const settles = tags.get('settles');
  if (settles !== undefined && !(NUMBER.test(settles) && Number(settles) >= SETTLES[0] && Number(settles) <= SETTLES[1])) warnings.push(`@settles ${settles}: the seconds, from ${SETTLES[0]} to ${SETTLES[1]}; Kolahal leaves the line out`);

  // The uniforms, outside comments: content is the only input, and those Kolahal sets have its types.
  const body = code.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ' ');
  const uniforms = [...body.matchAll(/(layout\s*\(\s*color\s*\)\s*)?\buniform\s+([A-Za-z_]\w*)\s+([^;]+);/g)]
    .flatMap((m) => m[3].split(',').map((n) => n.trim()).filter(Boolean)
      .map((n) => ({ name: n.replace(/\[.*/, '').trim(), type: m[2], color: !!m[1], array: n.includes('[') })));
  const floatsOf = (u) => (u.array ? 0 : FLOATS[u.type] ?? 0);

  // Parameters: each read as Kolahal reads it, with a float uniform of its name, which then is set.
  const paramLines = code.split('\n').map((line) => /^\s*\/\/\s*@([A-Za-z]+)\b[ \t]*(.*)$/.exec(line))
    .filter((m) => m && m[1].toLowerCase() === 'param').map((m) => m[2].trim());
  if (paramLines.length > PARAMS_MAX) problems.push(`${paramLines.length} parameters: at most ${PARAMS_MAX}`);
  const params = [];
  for (const line of paramLines) {
    const problem = paramProblem(line);
    if (problem) {
      problems.push(`@param ${line}: ${problem}. Write "@param amount 0.0..2.0 = 1.0 Title" or "@param shape a|b = a Title"`);
      continue;
    }
    const [, name, , , rest] = PARAM_LINE.exec(line);
    if (UNIFORMS[name] || name === 'content') problems.push(`@param ${name}: Kolahal sets ${name}, so it can't be a parameter`);
    else if (params.includes(name)) problems.push(`@param ${name}: named twice`);
    else if (!uniforms.some((u) => u.name === name && floatsOf(u) === 1)) problems.push(`@param ${name}: needs "uniform float ${name};"`);
    params.push(name);
    const follow = PARAM_FOLLOW.exec(rest)?.[1];
    const problem2 = follow && followProblem(follow);
    if (problem2) warnings.push(`@param ${name} @follow ${follow}: ${problem2}; Kolahal leaves it out`);
  }

  if (!uniforms.some((u) => u.name === 'content' && u.type === 'shader' && !u.array)) problems.push('needs "uniform shader content;", the surface it draws over');
  for (const u of uniforms) {
    if (u.name === 'content' || params.includes(u.name)) continue;
    const floats = floatsOf(u);
    if (u.type === 'shader') problems.push(`uniform ${u.name}: the only shader input is content`);
    else if (UNIFORMS[u.name] && floats !== UNIFORMS[u.name]) problems.push(`uniform ${u.name}: must hold ${UNIFORMS[u.name]} number(s), not ${u.type}${u.array ? '[]' : ''}`);
    else if (!UNIFORMS[u.name]) problems.push(`uniform ${u.name}: Kolahal doesn't set it, so it stays 0: make it a const, or a @param`);
    if (u.color && floats < 3) problems.push(`uniform ${u.name}: layout(color) needs three or four numbers`);
  }
  if (uniforms.some((u) => u.name === 'time') && !animated) problems.push('reads time, which only moves in a shader with // @animated (or @once)');
  if (!/\bhalf4\s+main\s*\(|\bfloat4\s+main\s*\(|\bvec4\s+main\s*\(/.test(body)) problems.push('needs a "half4 main(float2 xy)" function');

  if (bytes.length > MAX_BYTES) problems.push(`${bytes.length} bytes: at most ${MAX_BYTES}`);
  code.split('\n').forEach((line, i) => {
    if (line.length > MAX_LINE) problems.push(`line ${i + 1} is ${line.length} characters: at most ${MAX_LINE}, so it can be read`);
  });

  return {
    problems,
    warnings,
    entry: {
      name: dir,
      path,
      title: said('name', 'title'),
      desc: said('description', 'desc'),
      author: said('author'),
      version,
      license: said('license'),
      tags: (said('tags') ?? '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      animated,
      // It follows how the phone leans: Kolahal says so in Get more shaders.
      tilt: uniforms.some((u) => u.name === 'tilt'),
      requires,
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
  const { problems, warnings, entry } = checkShader(dir);
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
