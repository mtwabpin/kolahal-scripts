// github-stars.js — the stars of a GitHub repository, in a widget, every hour.
// @title GitHub stars
// @desc The stars of a GitHub repository, set by its repo option: a widget
// @author Kolahal
// @version 1.0
// @widget stat 2x1
// @every 1h
// @tags github, stars, number
// @requires 0.5.8
// @option repo "" The repository, as owner/name, such as mtwabpin/kolahal
//
// Talks to: api.github.com, with no key. GitHub allows 60 such requests an hour from a phone, and
// this asks once an hour.
//
// Its widget, once you placed it on the widgets page, shows the stars large, with the repository
// under it. A tap opens the repository. Set it up in the script's sheet (Options), or with:
//   script set github-stars repo mtwabpin/kolahal
// It logs no number: the widget is what it is for.

// The widgets page asked for this run.
const quiet = !!event && event.name === "widget";

// A failure: what didn't work, in the theme's bad colour, and why under it. In a run for the
// widget it is an error instead, so the run counts as failed and the card says so. The card keeps
// the number it had.
const fail = (what, why) => {
  if (quiet) throw new Error(`${what}: ${why}`);
  log(fmt.color("bad", what), why);
};

// Only a placed widget is filled. Until then its timer has nothing to do, so it asks no site.
const placed = typeof widget !== "undefined" && (quiet || allowed("widget"));
if (!placed) {
  // Say once where the widget is, for a run by hand. Later runs say nothing.
  if (!store.get("told")) {
    store.set("told", "1");
    log(fmt.color("muted", "github-stars fills a widget: add it on the widgets page (+ at the top)"));
  }
  return;
}

// The card's heading: the same words as its @title line.
const TITLE = "GitHub stars";

// "owner/name", also from a pasted address: "https://github.com/owner/name".
const repo = (options.repo || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$|\/+$/g, "");

// Not set up yet. This is no failure, so the card says what to set. It has no tap of its own, so
// a tap on it runs this again.
if (repo === "") {
  widget.show({ title: TITLE, icon: "star", value: "–", label: "Set its repo option, then tap here" });
  return;
}
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail("No stars", "Its repo option must be owner/name, such as mtwabpin/kolahal");

let r;
try {
  // Kept for 10 minutes: a tap right after a run asks GitHub nothing new.
  r = await http.cached(`https://api.github.com/repos/${repo}`, 600);
} catch (e) {
  return fail("No stars", `Network error: ${e.message || e}`);
}
if (r.status === 404) return fail("No stars", `GitHub has no public repository ${repo}`);
if (r.status === 403 || r.status === 429) return fail("No stars", "GitHub asks to wait: too many requests from this network");
if (!r.ok) return fail("No stars", `GitHub answered HTTP ${r.status}`);

let data;
try {
  data = JSON.parse(r.body);
} catch (e) {
  return fail("No stars", "GitHub didn't send JSON");
}
if (typeof data.stargazers_count !== "number") return fail("No stars", "GitHub sent no star count");

// 12345 -> "12,345": commas from 10,000 up, so 2026 stays "2026".
const stars = data.stargazers_count;
const value = stars >= 10000 ? String(stars).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(stars);

// Its timer fills it every hour, and it counts as old after two hours: after a run that was missed.
widget.show({
  title: TITLE,
  icon: "star",
  value,
  label: data.full_name || repo,
  tap: { url: data.html_url || `https://github.com/${repo}`, label: "Open the repository" },
  staleAfter: 2 * 3600,
});
