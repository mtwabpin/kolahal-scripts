// @title Live chess
// @desc Live chess from Lichess broadcasts: the event option's game as its status line, to pin at the top of home; chess games lists the rounds
// @author Kolahal
// @version 1.4
// @command
// @usage [now|games|board|live|<player>]
// @widget versus 4x1
// @every 15m
// @tags sport, chess, live
// @requires 0.5.17
// @option event top The broadcast it follows: top, the highest-ranked one on now, or words from its name, such as "world championship"
// @option player any The player whose game it follows, such as Gukesh; any: the first board on
// @option refresh 60 Seconds between updates while home shows the game (30 at the fastest)
//
// Talks to: lichess.org, whose broadcasts relay the games of over-the-board events (world
// championships, opens, leagues) move by move, with the players' clocks.
//
// On its timer it looks in the event option's broadcast for a game of the player option that is
// on, and keeps its last move as its status line. Pin it (`script pin chess`) and the move shows at
// the top of home, fetched again every refresh seconds while home shows it. Once the game ends, its
// result stays two hours. Between rounds it asks nothing of Lichess until the next round is due.
//
// `chess now` shows the game: the last move, both clocks (the side to move's counting down), the
// match score in a match, the players and the opening; with no game on, the last result and when
// the next round starts, in the phone's time. `chess Gukesh` shows Gukesh's game in the event, and
// follows it if it's on. `chess board` draws the position in letters (white in capitals),
// `chess games` lists the event's rounds with their results or start times, and `chess live` lists
// every broadcast on now.
//
// Its widget, once you placed it on the widgets page, is the game: the two players with their
// initials, white first, and the last move large between them, or in a match the match score with
// the last move under it. While the game is on, both clocks are the bar between the players, the
// running one moving, with a dot by the player to move. While the page shows it, it is fetched again
// every refresh seconds. A tap shows the game in the log.

const API = "https://lichess.org";
const RESULT_HOURS = 2;
const want = (options.event || "top").trim();
const followsTop = want.toLowerCase() === "top";
const player = (options.player || "any").trim();
const every = Math.max(30, Number(options.refresh) || 60);
// A followed game is kept for the event and player options it was found with.
const following = `${want}|${player}`;

// A second or later widget has options of its own, so it keeps its own game, in keys of its own,
// and leaves the status line to the script's own options.
const slot = event && event.instance ? `.${event.instance}` : "";
const read = (key) => {
  try {
    return JSON.parse(store.get(key + slot) || "null");
  } catch (e) {
    return null;
  }
};
const keep = (key, value) => store.set(key + slot, value == null ? null : JSON.stringify(value));

// An error with words for the log: its first line, then a hint.
const said = (text) => Object.assign(new Error(text), { lichess: true });

// One request to Lichess: JSON with [json], else text; null for a 404. Lichess asks for one request
// at a time, so each waits for the one before, and for a minute's pause after HTTP 429.
async function get(path, json) {
  if (Date.now() < Number(store.get("pause") || 0)) throw said("Too many requests to Lichess\nTry again in a minute");
  const r = await http.get(API + path, json ? { Accept: "application/json" } : {});
  if (r.status === 404) return null;
  if (r.status === 429) {
    store.set("pause", String(Date.now() + 60000));
    throw said("Too many requests to Lichess\nTry again in a minute");
  }
  if (!r.ok) throw said(`Lichess sent an error\nHTTP ${r.status}`);
  return json ? JSON.parse(r.body) : r.body;
}

// The first of the highest tier: Lichess ranks official broadcasts from 1 to 5.
const best = (list) => list.reduce((a, b) => ((b.tour.tier || 0) > (a.tour.tier || 0) ? b : a), list[0]) || null;

// The broadcast the event option names, as Lichess gives it ({ tour, rounds }), or null. Words are
// looked up in Lichess's top broadcasts once, and the broadcast is kept while the option stays; top
// is looked up each time, as another broadcast may be on by then.
async function findEvent() {
  const memo = read("event");
  if (!followsTop && memo && memo.for === want) {
    const t = await get(`/api/broadcast/${memo.id}`, true);
    if (t) return t;
  }
  const top = (await get("/api/broadcast/top", true)) || {};
  const active = top.active || [];
  let found;
  if (followsTop) {
    const on = active.filter((b) => b.round && b.round.ongoing);
    found = best(on.length ? on : active);
  } else {
    const words = want.toLowerCase().split(/\s+/);
    const all = [...active, ...(top.upcoming || []), ...((top.past && top.past.currentPageResults) || [])];
    found = best(all.filter((b) => words.every((w) => b.tour.name.toLowerCase().includes(w))));
  }
  if (!found) return null;
  keep("event", { for: want, id: found.tour.id });
  return get(`/api/broadcast/${found.tour.id}`, true);
}

const liveRound = (t) => t.rounds.find((r) => r.ongoing) || null;
const lastRound = (t) => [...t.rounds].reverse().find((r) => r.finished) || null;
// A round not played yet; one due more than six hours ago that never started doesn't count.
const nextRound = (t) => t.rounds.find((r) => !r.ongoing && !r.finished && (!r.startsAt || r.startsAt > Date.now() - 6 * 3600000)) || null;
const isMatch = (tour) => /\bmatch\b/i.test((tour.info && tour.info.format) || "");

// The game of [who] in [games] (words from a player's name; any: every game), one still on first.
function pick(games, who) {
  const words = who.toLowerCase().split(/\s+/);
  const theirs = words[0] === "any" ? games
    : games.filter((g) => (g.players || []).some((p) => words.every((w) => (p.name || "").toLowerCase().includes(w))));
  return theirs.find((g) => g.status === "*") || theirs[0] || null;
}

const tag = (pgn, name) => (pgn.match(new RegExp(`^\\[${name} "(.*)"\\]`, "m")) || [])[1] || "";

// The moves of a game's PGN, in standard notation: ["e4", "e5", "Nf3"…].
const sans = (pgn) => pgn.replace(/^\[.*$/gm, " ").replace(/\{[^}]*\}|\([^)]*\)/g, " ").split(/\s+/)
  .map((w) => w.replace(/^\d+\.+/, "")).filter((w) => w && !/^(\*|1-0|0-1|1\/2-1\/2|\$\d+)$/.test(w));

// A game as it is shown: the round's data for it (players, clocks, status, position), with its moves
// and opening from its PGN; null when it's gone. [data] is the round, when it was fetched already.
async function load(roundId, gameId, data) {
  const round = data || (await get(`/api/broadcast/-/-/${roundId}`, true));
  const g = round && (round.games || []).find((x) => x.id === gameId);
  if (!g) return null;
  const pgn = (await get(`/api/study/${roundId}/${gameId}.pgn`)) || "";
  return { ...g, round: round.round || {}, moves: sans(pgn), opening: tag(pgn, "Opening") };
}

// The game to show for [who] in the event: in the round on now, else (unless [onlyLive]) the latest
// round played. { t, game, g }: game is what is kept to follow it, g the game, null when there's none.
async function locate(who, onlyLive) {
  const t = await findEvent();
  const r = t && (liveRound(t) || (onlyLive ? null : lastRound(t)));
  const data = r && (await get(`/api/broadcast/-/-/${r.id}`, true));
  const found = data && pick(data.games || [], who);
  if (!found || (onlyLive && found.status !== "*")) return { t, g: null };
  // A match's score, from Lichess's players: it counts a game once it has ended.
  const game = { for: following, event: t.tour.name, name: data.round.name, round: data.round.id, game: found.id, counted: found.status !== "*" };
  if (isMatch(t.tour)) {
    game.score = {};
    for (const p of (await get(`/broadcast/${t.tour.id}/players`, true)) || []) game.score[p.name] = p.score || 0;
  }
  return { t, game, g: await load(game.round, game.game, data) };
}

const side = (g, i) => (g.players && g.players[i]) || {};
const short = (p) => (p.name || "?").split(",")[0].trim();
const full = (p) => (p.name || "?").split(",").map((s) => s.trim()).reverse().join(" ");
const pair = (g) => `${short(side(g, 0))} v ${short(side(g, 1))}`;
const live = (g) => g.status === "*";
const pad = (n) => String(n).padStart(2, "0");
// The side to move (0 white, 1 black) and the moves played by both, from the position.
const toMove = (g) => ((g.fen || "").split(" ")[1] === "b" ? 1 : 0);
const plies = (g) => (Number((g.fen || "").split(" ")[5]) || 1) * 2 - 2 + toMove(g);

// "17. b3" for white's move, "17... Be6" for black's. A PGN a move behind the position gives way to
// the move as Lichess sends it with the position ("b2-b3").
function lastMove(g) {
  const n = plies(g);
  if (!n) return "No moves yet";
  const move = g.moves.length === n ? g.moves[n - 1] : (g.lastMove || "").replace(/^(..)(..)/, "$1-$2");
  return `${Math.ceil(n / 2)}${n % 2 ? "." : "..."} ${move}`;
}
const state = (g) => (live(g) ? lastMove(g) : g.status);
const line = (g) => `${pair(g)} · ${state(g)}`;

// A player's time left in seconds, null when Lichess has none: the side to move's counts the time it
// has thought since.
function secondsLeft(g, i) {
  const c = side(g, i).clock;
  if (c == null) return null;
  return Math.max(0, Math.floor(c / 100) - (live(g) && i === toMove(g) ? g.thinkTime || 0 : 0));
}

// A player's clock, "1:18:08" or "47:45".
function clock(g, i) {
  const s = secondsLeft(g, i);
  if (s == null) return "–";
  const h = Math.floor(s / 3600);
  return h ? `${h}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// The match score, white's first ("1½–½"), with the game's result if the kept score doesn't count
// it yet; null outside a match.
const POINTS = { "1-0": [1, 0], "0-1": [0, 1], "½-½": [0.5, 0.5] };
const half = (n) => (n >= 1 ? String(Math.floor(n)) : n ? "" : "0") + (n % 1 ? "½" : "");
function score(g, game) {
  if (!game.score) return null;
  const add = (!game.counted && POINTS[g.status]) || [0, 0];
  return [0, 1].map((i) => half((game.score[side(g, i).name] || 0) + add[i])).join("–");
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// A start in the phone's time: "today 19:30", "Wed 25 Nov 19:30".
function when(ms) {
  if (!ms) return "time not announced";
  const d = new Date(ms);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.toDateString() === new Date().toDateString() ? `today ${hm}` : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`;
}

// A tap on its widget shows the game in the log.
const TAP = { args: "now", page: "log", label: "The game" };

// A player's mark on the card: the initials, the given name's first ("Carlsen, Magnus" is MC, "Lopez
// Rayo, Sergio" SL); a name without a comma, its first and last words' ("Gukesh D" is GD). Two
// players with the same initials get the first two letters of their surnames instead.
const initials = (p) => {
  const [surname = "", given = ""] = (p.name || "").split(",").map((s) => s.trim());
  const words = surname.split(/\s+/).filter(Boolean);
  const two = given ? [given, surname] : words.length > 1 ? [words[0], words[words.length - 1]] : [surname];
  return two.map((w) => w.charAt(0)).join("").toUpperCase();
};
function marks(g) {
  const m = [0, 1].map((i) => initials(side(g, i)));
  return m[0] !== m[1] ? m : [0, 1].map((i) => short(side(g, i)).slice(0, 2));
}

// Its widget for a game: the players, white first, each with its initials; between them the last move
// large (the result once it ends), or in a match the match score, with the last move as the line
// under it. LIVE or RESULT at the top. While it's on: both clocks as the bar between the players (the
// time each has left), the running one moving, and a dot by the player to move.
function card(g, game) {
  const on = live(g);
  const s = score(g, game);
  const mark = marks(g);
  const left = [0, 1].map((i) => secondsLeft(g, i));
  const clocks = on && left.every((n) => n != null);
  const d = {
    kind: "versus",
    icon: "♞",
    score: s || state(g),
    sides: [0, 1].map((i) => ({
      name: short(side(g, i)),
      ...(mark[i] ? { mark: mark[i] } : {}),
      ...(clocks ? { value: left[i], text: clock(g, i) } : {}),
    })),
    badge: on ? "LIVE" : "RESULT",
    tap: TAP,
    staleAfter: on ? 60 : 900,
  };
  if (s) d.caption = state(g);
  if (on) {
    d.turn = toMove(g) + 1;
    d.moving = true;
    d.color = "good";
    d.refresh = every;
  }
  return d;
}

// Its status line and widget: the game's line, run again every refresh seconds while it's on.
function showGame(g, game) {
  if (!slot && live(g)) status(line(g), { refresh: every });
  else if (!slot) status(line(g));
  widget.show(card(g, game));
}

// No game to follow: no status line, and its widget says when the next round starts, as one big value.
function showNone(t) {
  if (!slot) status(null);
  const r = t && nextRound(t);
  widget.show({ kind: "stat", icon: "♞", value: "–", label: r ? `${r.name}: ${when(r.startsAt)}` : "No live game", tap: TAP, staleAfter: 900 });
}

// Fetches the followed game again: its line while it's on, its result for a while after.
async function update(game) {
  const g = await load(game.round, game.game);
  if (!g) {
    keep("game", null);
    showNone();
    return null;
  }
  if (!live(g)) {
    if (!game.ended) keep("game", { ...game, ended: Date.now() });
    else if (Date.now() - game.ended > RESULT_HOURS * 3600000) {
      keep("game", null);
      showNone();
      return g;
    }
  }
  showGame(g, game);
  return g;
}

function follow(at) {
  keep("game", at.game);
  showGame(at.g, at.game);
}

const words = (argline || "").trim();
const kept = read("game");
const game = kept && kept.for === following ? kept : null;

if (event && event.name === "refresh") {
  // A failed fetch leaves the line as it was until the next refresh.
  try {
    if (game) await update(game);
    else showNone();
  } catch (e) {}
  return;
}

// The widgets page asked for this run. It is as quiet as a refresh: it logs nothing.
const forWidget = !!event && event.name === "widget";

if (!words) {
  // The timer: the followed game while it's on, then the player option's next game that is on.
  // Between rounds of a named event it asks nothing until 15 minutes before the next one is due. A
  // failed fetch leaves the pinned line as it was until the next run, without a line every 15 minutes.
  try {
    if (game) {
      const g = await update(game);
      if (g && live(g)) return;
    }
    const next = read("next");
    if (!game && next && next.for === following && Date.now() < next.at - 15 * 60000) return;
    const at = await locate(player, true);
    if (at.g && (!game || at.game.game !== game.game)) follow(at);
    else if (!game) {
      if (at.t && !followsTop) keep("next", { for: following, at: (nextRound(at.t) || {}).startsAt || 0 });
      showNone(at.t);
    }
  } catch (e) {
    // Tried again at the next run. A run for the widget fails instead, so its card says so.
    if (forWidget) throw e;
  }
  return;
}

// A typed command shows "Fetching games…" at once, which turns into the answer in place.
const pending = log(fmt.color("muted", "Fetching games…"));
const show = (...a) => pending.set(...a);
const noEvent = () => show(fmt.color("muted", followsTop ? "No broadcasts on Lichess now" : `No broadcast matches ${want}`), "'chess live' lists those on now", { copy: "chess live" });
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Every broadcast on now, the highest-ranked first.
async function showLive() {
  const top = (await get("/api/broadcast/top", true)) || {};
  const on = (top.active || []).filter((b) => b.round && b.round.ongoing);
  if (!on.length) return show(fmt.color("muted", "No broadcasts on Lichess now"));
  const rows = on.map((b) => [cut(b.tour.name, 24), b.round.name]);
  show(`${on.length} broadcasts on`, `${fmt.table(rows)}\n'script set chess event <words>' follows one`);
}

// The event's rounds: in a match each game's players and result, from the event's PGN (one
// request); in other events whether each round is on or done. Rounds to come show when they start.
async function showRounds() {
  const t = await findEvent();
  if (!t) return noEvent();
  const games = {};
  const points = {};
  if (isMatch(t.tour)) {
    for (const one of ((await get(`/api/broadcast/${t.tour.id}.pgn`)) || "").split(/(?=^\[Event )/m)) {
      const [white, black] = [tag(one, "White"), tag(one, "Black")];
      const result = tag(one, "Result").replace("1/2-1/2", "½-½");
      games[tag(one, "GameURL").split("/").slice(-2)[0]] = { white, black, result };
      for (const [name, p] of [[white, 0], [black, 1]]) points[name] = (points[name] || 0) + (POINTS[result] ? POINTS[result][p] : 0);
    }
  }
  const rows = t.rounds.map((r) => {
    const m = games[r.id];
    const who = m ? `${short({ name: m.white })} v ${short({ name: m.black })}` : "";
    if (m && POINTS[m.result]) return [r.name, `${who}, ${m.result}`];
    if (r.ongoing) return [r.name, m ? `${who}, live` : "On now"];
    return [r.name, r.finished ? "Finished" : cap(when(r.startsAt))];
  });
  // The match score as one figure, so neither side is drawn larger.
  const [a, b, more] = Object.keys(points);
  const big = b && !more ? fmt.stats([[`${half(points[a])}–${half(points[b])}`, `${short({ name: a })} v ${short({ name: b })}`]]) : "";
  show(t.tour.name, [big, fmt.table(rows)].filter(Boolean).join("\n"), { url: t.tour.url });
}

// A game in the log: the players and the last move (or the result) as the title; the clocks and the
// match score large; then the players in full, the opening, and the event and round.
function showOne(at, board) {
  const { g, game } = at;
  const url = g.round.url ? { url: `${g.round.url}/${g.id}` } : {};
  if (board) {
    const rows = (g.fen || "").split(" ")[0].split("/").map((row, i) => `${8 - i} ${row.replace(/\d/g, (n) => ".".repeat(Number(n))).split("").join(" ")}`);
    return show(`${pair(g)}: ${state(g)}`, [...rows, "  a b c d e f g h"].join("\n"), { mono: "1", ...url });
  }
  const s = score(g, game);
  const n = Math.ceil(plies(g) / 2);
  const winner = g.status === "1-0" ? short(side(g, 0)) : g.status === "0-1" ? short(side(g, 1)) : null;
  const numbers = live(g) ? [0, 1].map((i) => [clock(g, i), short(side(g, i)) + (i === toMove(g) ? " to move" : "")]) : [];
  if (s) numbers.push([s, "match"]);
  const next = !live(g) && at.t && nextRound(at.t);
  const body = [
    live(g) ? "" : winner ? `${winner} won in ${n} moves` : `Drawn in ${n} moves`,
    numbers.length ? fmt.stats(numbers) : "",
    next ? `${next.name} starts ${when(next.startsAt)}` : "",
    ...[0, 1].map((i) => {
      const p = side(g, i);
      return `${i ? "Black" : "White"}: ${[p.title, full(p)].filter(Boolean).join(" ")}${[p.fed, p.rating].filter(Boolean).map((v) => `, ${v}`).join("")}`;
    }),
    g.opening,
    `${game.event}, ${game.name}`,
  ];
  const head = live(g) ? fmt.tag("bad", "LIVE") : fmt.tag("muted", "RESULT");
  show(`${head} ${pair(g)}: ${state(g)}`, body.filter(Boolean).join("\n"), url);
}

try {
  const asked = words.toLowerCase();
  if (asked === "live") return await showLive();
  if (asked === "games") return await showRounds();
  // now and board: the followed game while it's on; else, and for a player, the game in the event.
  const mine = asked === "now" || asked === "board";
  let at = null;
  if (mine && game && !game.ended) {
    const g = await load(game.round, game.game);
    if (g) at = { game, g };
  }
  if (!at) at = await locate(mine ? player : words);
  if (!at.t && !at.g) return noEvent();
  if (!at.g) {
    const next = nextRound(at.t);
    if (!mine) return show(fmt.color("muted", `No game for ${words}`), `In ${at.t.tour.name}`);
    return show(next ? `${next.name} starts ${when(next.startsAt)}` : fmt.color("muted", "No more rounds"), at.t.tour.name);
  }
  showOne(at, asked === "board");
  if (live(at.g)) follow(at);
} catch (e) {
  const [what, ...why] = String((e && e.message) || e).split("\n");
  if (e && e.lichess) show(fmt.color("bad", what), why.join("\n"));
  else show(fmt.color("bad", "Can't reach Lichess"), what);
}
