// @title Ollama
// @desc Ask a model on your own Ollama server a question: ollama <question>
// @author Kolahal
// @version 1.0
// @command
// @usage <question>
// @option url http://localhost:11434 Your Ollama server's address
// @option model "" The model, as `ollama list` names it (empty: the first one the server has)
// @option system "" Instructions for every answer (empty: short answers in plain text)
// @tags ai, assistant
// @requires 0.5.23
//
// Talks to: your Ollama server only, at its url option (its /api/chat), with no key. Sends only the
// question and the instructions.
//
//   ollama why is the sky blue     one question, one answer; nothing of it is kept
//
// A server on this phone (in Termux, say) answers at the default address. One on another computer:
// start it with OLLAMA_HOST=0.0.0.0 so it listens beyond itself, then
// `script set ollama url http://192.168.1.20:11434`. On Android 17 and newer, Android itself blocks
// the local network, and a request to a computer on it fails after a timeout.
// A model: `script set ollama model llama3.2`.
//
// claude, gpt, gemini and openrouter ask other models the same way, each with its company's key.

const NAME = "Ollama";
const SYSTEM = "Answer briefly, in plain text without Markdown: the answer is read on a phone.";

// A failure: what went wrong, then a hint a line. Copy gives the command a hint suggests.
const fail = (what, hints = [], copy) => log(fmt.color("bad", what), hints.join("\n") || null, copy ? { copy } : {});

const question = (argline || "").trim();
const base = (options.url || "").trim().replace(/\/+$/, "") || "http://localhost:11434";
let model = (options.model || "").trim();
if (!question) return log(fmt.color("muted", "Usage: ollama <question>"), `Server: ${base}\nModel: ${model || "the first one it has"}`);
if (!/^https?:\/\/[^\s/?#]+(\/[^\s?#]*)?$/.test(base)) {
  return fail(`${base} isn't a server's address`, ["Set one such as: script set ollama url http://localhost:11434"], "script set ollama url http://localhost:11434");
}

// A failed request: a timeout, or no server there.
function unreachable(e) {
  if (/time.?out/i.test(String(e.message || e))) {
    return fail(`${model || NAME} took too long to answer`, ["Ask for a shorter answer", "Or try a smaller model"]);
  }
  return fail(`Couldn't reach Ollama at ${base}`, ["Check that it runs there and listens beyond its own computer", "Or set its address: script set ollama url <address>"], "script set ollama url ");
}

// No model set: the first one the server has.
if (!model) {
  let tags;
  try {
    tags = await http.get(`${base}/api/tags`);
  } catch (e) {
    return unreachable(e);
  }
  let models = [];
  try { models = JSON.parse(tags.body).models || []; } catch (e) { /* not Ollama: the next check says so */ }
  if (!tags.ok) return fail(`${base} answered with an error (HTTP ${tags.status})`, ["Check that it is an Ollama server"]);
  if (!models.length) return fail(`Ollama at ${base} has no models`, ["Get one on the server: ollama pull <model>"]);
  model = models[0].name || models[0].model;
}

const body = {
  model,
  messages: [
    { role: "system", content: (options.system || "").trim() || SYSTEM },
    { role: "user", content: question },
  ],
  stream: false,
};

let r;
try {
  r = await http.request({ url: `${base}/api/chat`, method: "POST", body });
} catch (e) {
  return unreachable(e);
}

let json = null;
try { json = JSON.parse(r.body); } catch (e) { /* an error page: the status says enough */ }

if (!r.ok || (json && json.error)) {
  const message = String((json && json.error) || "");
  if (r.status === 404 || /not found/i.test(message)) {
    return fail(`Ollama has no model called ${model}`, [`Get it on the server: ollama pull ${model}`, "Or choose another: script set ollama model <model>"], `ollama pull ${model}`);
  }
  return fail(`Ollama answered with an error (HTTP ${r.status})`, message ? [message.slice(0, 300)] : []);
}
if (!json) return fail(`${base} sent something unexpected`, ["Check that it is an Ollama server"]);

// A thinking model's thoughts are apart from its answer: only the answer is shown.
const text = String((json.message && json.message.content) || "").trim();
if (json.done_reason === "length") return fail("The answer was too long and was cut off", ["Ask for a shorter one"]);
if (!text) return fail(`${model} gave an empty answer`, ["Try again"]);

// The answer, and the model that gave it muted under it. Copy text takes the whole answer.
log(text, json.model || model, { copy: text });
