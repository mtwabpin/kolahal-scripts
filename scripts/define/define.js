// @title Define
// @desc Define an English word: define <word>
// @author Kolahal
// @version 1.0
// @command
// @usage <word>
// @tags dictionary, words
// @requires 0.4.1
//
// Talks to: api.dictionaryapi.dev (the Free Dictionary API, no key).
// `define serendipity`: the word and how it sounds, then one line per meaning with its part of
// speech first and an example muted under it. Tap a line to open the entry on Wiktionary.

// A failure: what didn't work, in the theme's bad colour, and why under it.
const fail = (what, why) => log(fmt.color("bad", what), why);

const word = (argline || "").trim().toLowerCase();
if (!word) return log(fmt.color("muted", "Usage: define <word>"));
if (!/^[a-z][a-z' -]{0,40}$/.test(word)) return fail("No definition", `'${word}' isn't a word`);

let r;
try {
  r = await http.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
} catch (e) {
  return fail("No definition", `Network error: ${e.message || e}`);
}
if (r.status === 404) return log(fmt.color("muted", `No entry for '${word}'`));
if (!r.ok) return fail("No definition", `The dictionary answered HTTP ${r.status}`);

let entries;
try {
  entries = JSON.parse(r.body);
} catch (e) {
  return fail("No definition", "The dictionary sent something unexpected");
}
if (!Array.isArray(entries) || entries.length === 0) return log(fmt.color("muted", `No entry for '${word}'`));

const entry = entries[0];
const headword = entry.word || word;
const phonetic = entry.phonetic || (entry.phonetics || []).map((p) => p.text).find(Boolean) || "";
const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(headword)}`;

log(fmt.bold(headword) + (phonetic ? `  ${fmt.color("muted", phonetic)}` : ""), null, { url, copy: headword });

// At most two definitions per part of speech, six in all: enough to know the word.
const MAX = 6;
let shown = 0;
for (const meaning of entry.meanings || []) {
  for (const d of (meaning.definitions || []).slice(0, 2)) {
    if (shown++ >= MAX) break;
    const example = d.example ? `“${d.example}”` : null;
    log(`${fmt.color("accent", meaning.partOfSpeech)}  ${d.definition}`, example, { url });
  }
}
