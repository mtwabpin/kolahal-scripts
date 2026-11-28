// @title Gemini
// @desc Ask Google's Gemini a question with your own Gemini API key: gemini <question>
// @author Kolahal
// @version 1.0
// @command
// @usage <question>
// @secret GEMINI_API_KEY generativelanguage.googleapis.com A Gemini API key: aistudio.google.com → Get API key
// @option model gemini-3.5-flash-lite The model: gemini-3.5-flash-lite, gemini-3.8-flash, gemini-4-hydrogen or another
// @option system "" Instructions for every answer (empty: short answers in plain text)
// @tags ai, assistant
// @requires 0.5.23
//
// Talks to: generativelanguage.googleapis.com (generateContent), with your key. Sends only the
// question and the instructions.
//
//   gemini why is the sky blue     one question, one answer; nothing of it is kept
//
// Set the key once: `script secret gemini GEMINI_API_KEY`, or Scripts → gemini → Secrets. It is kept
// encrypted, and Kolahal puts it in the request to Google only, in a header (never the address): the
// script never sees it. A model: `script set gemini model gemini-3.8-flash`.
//
// claude, gpt, openrouter and ollama ask other models the same way.

const NAME = "Gemini";
const SYSTEM = "Answer briefly, in plain text without Markdown: the answer is read on a phone.";

// A failure: what went wrong, then a hint a line. Copy gives the command a hint suggests.
const fail = (what, hints = [], copy) => log(fmt.color("bad", what), hints.join("\n") || null, copy ? { copy } : {});

const question = (argline || "").trim();
const model = (options.model || "").trim() || "gemini-3.5-flash-lite";
if (!question) return log(fmt.color("muted", "Usage: gemini <question>"), `Model: ${model}`);
// The model's name is in the address: only the characters a name has, so it can't change the path.
if (!/^[A-Za-z0-9._-]+$/.test(model)) {
  return fail(`${model} isn't a model name`, ["Choose another: script set gemini model <model>"], "script set gemini model ");
}

const key = secrets.get("GEMINI_API_KEY");
if (!key) {
  const set = "script secret gemini GEMINI_API_KEY";
  return fail("No Gemini API key", ["Get one at aistudio.google.com → Get API key", `Then: ${set}`], set);
}

// Kolahal waits about 20 seconds for an answer: a low thinking level keeps within it. Gemini 3 and
// later take one; older models refuse it.
const config = { maxOutputTokens: 8000 };
if (!/^gemini-[12][.-]/.test(model)) config.thinkingConfig = { thinkingLevel: "LOW" };
const body = {
  systemInstruction: { parts: [{ text: (options.system || "").trim() || SYSTEM }] },
  contents: [{ role: "user", parts: [{ text: question }] }],
  generationConfig: config,
};

let r;
try {
  r = await http.request({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    method: "POST",
    body,
    headers: { "x-goog-api-key": key },
  });
} catch (e) {
  if (/time.?out/i.test(String(e.message || e))) {
    const faster = "script set gemini model gemini-3.5-flash-lite";
    // Already that model: only the first hint.
    if (faster.endsWith(` ${model}`)) return fail(`${NAME} took too long to answer`, ["Ask for a shorter answer"]);
    return fail(`${NAME} took too long to answer`, ["Ask for a shorter answer", `Or a faster model: ${faster}`], faster);
  }
  return fail(`Couldn't reach ${NAME}`, ["Check the connection and try again"]);
}

let json = null;
try { json = JSON.parse(r.body); } catch (e) { /* an error page: the status says enough */ }

if (!r.ok) {
  const error = (json && json.error) || {};
  const message = String(error.message || "");
  const quota = r.status === 429 || error.status === "RESOURCE_EXHAUSTED";
  if (r.status === 401 || r.status === 403 || /API key/.test(message) || /API_KEY_INVALID/.test(JSON.stringify(error.details || ""))) {
    const set = "script secret gemini GEMINI_API_KEY";
    return fail("Google didn't accept the API key", [`Set it again: ${set}`], set);
  }
  // A daily quota, or none at all for this model ("limit: 0"): waiting a moment doesn't lift it.
  if (r.status === 402 || (quota && /limit:\s*0\b|PerDay/.test(message + JSON.stringify(error.details || "")))) {
    return fail("The Gemini quota is used up for today", ["Try again tomorrow, or set up billing at aistudio.google.com"]);
  }
  if (quota) return fail(`Too many questions to ${NAME} for now`, ["Try again in a moment"]);
  if (r.status === 404 || error.status === "NOT_FOUND") {
    return fail(`${NAME} has no model called ${model}`, ["Choose another: script set gemini model <model>"], "script set gemini model ");
  }
  if (r.status >= 500) return fail(`${NAME} is busy`, ["Try again in a moment"]);
  return fail(`${NAME} answered with an error (HTTP ${r.status})`, message ? [message.slice(0, 300)] : []);
}
if (!json) return fail(`${NAME} sent something unexpected`, ["Try again"]);

// No candidates: the question itself was blocked.
const candidate = (json.candidates || [])[0];
if (!candidate) return fail(`${NAME} declined to answer this`);
const reason = candidate.finishReason || "";
if (reason === "MAX_TOKENS") return fail("The answer was too long and was cut off", ["Ask for a shorter one"]);
if (!["", "STOP", "FINISH_REASON_UNSPECIFIED"].includes(reason)) return fail(`${NAME} declined to answer this`);
const parts = (candidate.content && candidate.content.parts) || [];
const text = parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim();
if (!text) return fail(`${NAME} gave an empty answer`, ["Try again"]);

// The answer, and the model that gave it muted under it. Copy text takes the whole answer.
log(text, json.modelVersion || model, { copy: text });
