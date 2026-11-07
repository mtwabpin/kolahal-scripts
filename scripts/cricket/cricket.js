// @title Live cricket
// @desc Live cricket scores: the team option's live match as its status line, to pin at the top of home; cricket live lists them all
// @author Kolahal
// @version 1.2
// @command
// @usage [live|<team>]
// @every 15m
// @tags sport, cricket, live
// @requires 0.4.7
// @option team any The team whose live match it follows, such as India or Mumbai; any: the first live international
// @option refresh 30 Seconds between updates while home shows the match (10 at the fastest)
//
// Talks to: site.web.api.espn.com, ESPN's scores. It isn't a documented API, so it can change
// without notice.
//
// On its timer it looks for a live match of the team option and keeps its score as its status
// line, the overs as the bar. Pin it (`script pin cricket`) and the score shows at the top of home,
// fetched again every refresh seconds while home shows it (from Kolahal 0.4.14; older ones show the
// line in the header, updated on the timer). Once the match ends, its result stays two hours.
// `cricket India` shows India's match and follows it if it's on; `cricket live` lists every live
// match.
//
// From Kolahal 0.4.16, `cricket live` and a team's match show as tables (fmt.table); an older
// Kolahal shows them as lines, as before.

const PANEL = "https://site.web.api.espn.com/apis/site/v2/sports/cricket/scorepanel";
const BOARD = (league) => `https://site.web.api.espn.com/apis/site/v2/sports/cricket/${league}/scoreboard`;
const RESULT_HOURS = 2;

async function getJson(url) {
  const r = await http.get(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.body);
}

// Every match the panel has, each with its league: [{ league, event }].
async function allMatches() {
  const panel = await getJson(PANEL);
  return (panel.scores || []).flatMap((s) => {
    const league = s.leagues && s.leagues[0] ? s.leagues[0].id : null;
    return (s.events || []).map((event) => ({ league, event }));
  });
}

const teams = (event) => (event.competitions && event.competitions[0] && event.competitions[0].competitors) || [];
const state = (event) => (event.status && event.status.type && event.status.type.state) || "";
const international = (event) => {
  const c = event.competitions && event.competitions[0] && event.competitions[0].class;
  return !!c && c.internationalClassId && c.internationalClassId !== "0";
};

// Whether a team named like [name] plays in the match: its name, short name or abbreviation.
function plays(event, name) {
  const want = name.toLowerCase();
  return teams(event).some((c) => {
    const t = c.team || {};
    return [t.displayName, t.shortDisplayName, t.name, t.abbreviation]
      .filter(Boolean).some((n) => n.toLowerCase() === want || n.toLowerCase().startsWith(want + " "));
  });
}

// A score without what the line can do without: "42/1 (8.5/50 ov, target 186)" is "42/1 (8.5 ov)".
const shortScore = (s) => (s || "").replace(/\((\d+(?:\.\d)?)\/\d+ ov(?:, target \d+)?\)/, "($1 ov)").replace(/, target \d+/, "");

// "NZ 185 v IND 42/1 (8.5 ov) · India require 144 runs"
function line(event) {
  const sides = teams(event).map((c) => `${(c.team && c.team.abbreviation) || "?"} ${shortScore(c.score)}`.trim());
  const summary = (event.status && event.status.summary) || "";
  return sides.join(" v ") + (summary ? ` · ${summary}` : "");
}

// How far the batting side's innings is, 0 to 1, from its overs out of the most it may bowl;
// null without a limit (a Test).
function progress(event) {
  for (const c of teams(event)) {
    const m = (c.score || "").match(/\((\d+)(?:\.(\d))?\/(\d+) ov/);
    if (m) return Math.min(1, (Number(m[1]) * 6 + Number(m[2] || 0)) / (Number(m[3]) * 6));
  }
  return null;
}

// Its status line: the match's line, its bar when there's a limit, and runs again while it's live.
function showMatch(event) {
  if (state(event) === "in") {
    const p = progress(event);
    const every = Math.max(10, Number(options.refresh) || 30);
    status(line(event), p == null ? { refresh: every } : { progress: p, refresh: every });
  } else {
    status(line(event));
  }
}

// The followed match ({ league, id, ended }) and what it shows now.
const kept = () => {
  try {
    return JSON.parse(store.get("match") || "null");
  } catch (e) {
    return null;
  }
};

async function followed(match) {
  const board = await getJson(BOARD(match.league));
  return (board.events || []).find((e) => e.id === match.id) || null;
}

// Fetches the followed match again: its line while it's on, its result for a while after.
async function update(match) {
  const event = await followed(match);
  if (!event) {
    store.set("match", null);
    return status(null);
  }
  if (state(event) === "post") {
    if (!match.ended) store.set("match", JSON.stringify({ ...match, ended: Date.now() }));
    else if (Date.now() - match.ended > RESULT_HOURS * 3600000) {
      store.set("match", null);
      return status(null);
    }
  }
  showMatch(event);
}

function follow(league, event) {
  store.set("match", JSON.stringify({ league, id: event.id }));
  showMatch(event);
}

const words = (argline || "").trim();
const match = kept();

if (event && event.name === "refresh") {
  // While home shows the score: only the followed match's league, a few KB.
  if (match) await update(match);
  else status(null);
  return;
}

if (!words) {
  // The timer: the followed match while it's on, then the team option's next live one. A failed
  // fetch leaves the pinned score as it was until the next run, without a line every 15 minutes.
  try {
    if (match && !match.ended) return await update(match);
    if (match) await update(match);
    const team = (options.team || "any").trim();
    const live = (await allMatches()).filter((m) => state(m.event) === "in");
    const found = team.toLowerCase() === "any" ? live.find((m) => international(m.event)) : live.find((m) => plays(m.event, team));
    if (found && (!match || found.event.id !== match.id)) follow(found.league, found.event);
  } catch (e) {
    // Tried again at the next run.
  }
  return;
}

let matches;
try {
  matches = await allMatches();
} catch (e) {
  return log(fmt.color("bad", "No cricket scores"), `${e.message || e}`);
}

// Tables need Kolahal 0.4.16. An older one has no fmt.table, and gets lines as before.
const tables = typeof fmt.table === "function";
const abbr = (c) => (c.team && c.team.abbreviation) || "?";
const summary = (event) => (event.status && event.status.summary) || "";

if (words.toLowerCase() === "live") {
  const live = matches.filter((m) => state(m.event) === "in");
  if (!live.length) return log(fmt.color("muted", "No live matches"));
  if (!tables) return logs(live.map((m) => line(m.event)));
  // One row a match: who plays, the scores, and how it stands.
  const rows = live.map((m) => {
    const sides = teams(m.event);
    // Each side's score in its place, "–" for one that hasn't batted, so a score is never the wrong side's.
    const each = sides.map((c) => shortScore(c.score));
    const scores = each.some(Boolean) ? each.map((s) => s || "–").join(" · ") : "";
    return [sides.map(abbr).join(" v "), scores, summary(m.event)];
  });
  return log(`${live.length} live`, fmt.table([["Match", "Score", "Status"], ...rows], { header: true }));
}

// A team: its live match first, then the latest or next one.
const theirs = matches.filter((m) => plays(m.event, words));
const found = theirs.find((m) => state(m.event) === "in") || theirs[0];
if (!found) return log(fmt.color("muted", `No match for ${words}`), "cricket live lists the live ones");
const e = found.event;
const when = state(e) === "pre" ? `Starts ${new Date(e.date).toLocaleString()}` : (e.status && e.status.type && e.status.type.detail) || "";
const about = [e.competitions && e.competitions[0] && e.competitions[0].description, when].filter(Boolean).join(" · ");
if (tables) {
  // The match as its title, how it stands, then each side's score.
  const card = fmt.table([["Team", "Score"], ...teams(e).map((c) => [(c.team && c.team.displayName) || abbr(c), c.score || "—"])], { header: true });
  log(e.name || line(e), [summary(e), card, about].filter(Boolean).join("\n"));
} else {
  log(line(e), [e.name, about].filter(Boolean).join(" · "));
}
if (state(e) === "in") follow(found.league, e);
