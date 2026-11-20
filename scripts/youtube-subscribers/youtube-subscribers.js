// youtube-subscribers.js — the subscribers of a YouTube channel, in a widget, every hour.
// @title YouTube subscribers
// @desc The subscribers of a YouTube channel, set by its channel option: a widget
// @author Kolahal
// @version 1.0
// @widget stat 2x1
// @every 1h
// @tags youtube, subscribers, number
// @requires 0.5.8
// @option channel "" The channel: its handle (@name) or its ID (UC…)
// @secret YOUTUBE_API_KEY www.googleapis.com A YouTube Data API key: console.cloud.google.com → APIs & Services → enable "YouTube Data API v3" → Credentials → Create credentials → API key
//
// Talks to: www.googleapis.com (the YouTube Data API), with your API key.
//
// The API is free: it gives each Google Cloud project 10,000 units a day, and one look at a channel
// costs 1. This looks once an hour. You make the key yourself (see the @secret line above), and set
// it on the phone: Scripts → tap this script → Secrets, or
//   script secret youtube-subscribers YOUTUBE_API_KEY
// It is kept encrypted, never in the code, backups or the log.
//
// Its widget, once you placed it on the widgets page, shows the subscribers large, with the
// channel's name under it. A tap opens the channel. Set the channel in the script's sheet
// (Options), or with:
//   script set youtube-subscribers channel @NASA
// YouTube rounds a public count to 3 figures, so the number moves in steps. It logs no number:
// the widget is what it is for.

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
    log(fmt.color("muted", "youtube-subscribers fills a widget: add it on the widgets page (+ at the top)"));
  }
  return;
}

// The card's heading: the same words as its @title line.
const TITLE = "YouTube subscribers";

// Not set up yet: no failure, so the card says what to set. It has no tap of its own, so a tap on
// it runs this again.
const key = secrets.get("YOUTUBE_API_KEY");
if (!key) {
  widget.show({ title: TITLE, icon: "play", value: "–", label: "Set its YOUTUBE_API_KEY secret, then tap here" });
  return;
}
// The channel: "@name", "name", an address such as youtube.com/@name or …/channel/UC…, or the ID.
const raw = (options.channel || "").trim().replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//i, "").replace(/^channel\//i, "").replace(/\/.*$/, "");
if (raw === "") {
  widget.show({ title: TITLE, icon: "play", value: "–", label: "Set its channel option, then tap here" });
  return;
}
const byId = /^UC[\w-]{22}$/.test(raw);
const handle = raw.replace(/^@/, "");
if (!byId && !/^[\w.-]{3,30}$/.test(handle)) return fail("No subscribers", "Its channel option must be a handle (@name) or a channel ID (UC…)");

const which = byId ? `id=${raw}` : `forHandle=${encodeURIComponent("@" + handle)}`;
let r;
try {
  r = await http.get(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${which}&key=${encodeURIComponent(key)}`);
} catch (e) {
  return fail("No subscribers", `Network error: ${e.message || e}`);
}

let data;
try {
  data = JSON.parse(r.body);
} catch (e) {
  return fail("No subscribers", `YouTube answered HTTP ${r.status}`);
}
if (!r.ok) {
  // The API says why, such as "API key not valid" or "has not been used in project …".
  const why = (data && data.error && data.error.message) || `HTTP ${r.status}`;
  return fail("No subscribers", `YouTube: ${String(why).replace(/<[^>]*>/g, "").slice(0, 160)}`);
}
const channel = data.items && data.items[0];
if (!channel) return fail("No subscribers", `YouTube has no channel ${byId ? raw : "@" + handle}`);

const title = (channel.snippet && channel.snippet.title) || (byId ? raw : "@" + handle);
const tap = { url: `https://www.youtube.com/channel/${channel.id}`, label: "Open the channel" };
const stats = channel.statistics || {};

// A channel can hide its count.
if (stats.hiddenSubscriberCount) {
  widget.show({ title: TITLE, icon: "play", value: "–", label: `${title} hides its count`, tap, staleAfter: 2 * 3600 });
  return;
}
const count = Number(stats.subscriberCount);
if (!Number.isFinite(count)) return fail("No subscribers", "YouTube sent no subscriber count");

// 1234 -> "1,234"; 12300 -> "12.3K"; 1230000 -> "1.23M": YouTube rounds to 3 figures anyway.
function compact(n) {
  const short = (v, unit) => `${Number(v.toPrecision(3))}${unit}`;
  if (n >= 1e9) return short(n / 1e9, "B");
  if (n >= 1e6) return short(n / 1e6, "M");
  if (n >= 1e4) return short(n / 1e3, "K");
  return n >= 1000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(n);
}

// Its timer fills it every hour, and it counts as old after two hours: after a run that was missed.
widget.show({ title: TITLE, icon: "play", value: compact(count), label: title, tap, staleAfter: 2 * 3600 });
