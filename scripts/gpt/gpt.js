// @title GPT
// @desc Ask OpenAI's GPT a question with your own OpenAI API key: gpt <question>
// @author Kolahal
// @version 1.0
// @command
// @usage <question>
// @secret OPENAI_API_KEY api.openai.com An OpenAI API key: platform.openai.com → API keys
// @option model gpt-6-luna The model: gpt-6-luna, gpt-6.1-terra, gpt-6.2-sol or another
// @option system "" Instructions for every answer (empty: short answers in plain text)
// @tags ai, assistant
// @requires 0.5.23
//
// Talks to: api.openai.com (the Responses API), with your key. Sends only the question and the
// instructions, and asks OpenAI not to keep them (store: false).
//
//   gpt why is the sky blue     one question, one answer; nothing of it is kept
//
// Set the key once: `script secret gpt OPENAI_API_KEY`, or Scripts → gpt → Secrets. It is kept
// encrypted, and Kolahal puts it in the request to api.openai.com only: the script never sees it.
// A model: `script set gpt model gpt-6.1-terra`.
//
// claude, gemini, openrouter and ollama ask other models the same way.

const NAME = "GPT";
const SYSTEM = "Answer briefly, in plain text without Markdown: the answer is read on a phone.";

// A failure: what went wrong, then a hint a line. Copy gives the command a hint suggests.
const fail = (what, hints = [], copy) => log(fmt.color("bad", what), hints.join("\n") || null, copy ? { copy } : {});

const question = (argline || "").trim();
const model = (options.model || "").trim() || "gpt-6-luna";
if (!question) return log(fmt.color("muted", "Usage: gpt <question>"), `Model: ${model}`);

const key = secrets.get("OPENAI_API_KEY");
if (!key) {
  const set = "script secret gpt OPENAI_API_KEY";
  return fail("No OpenAI API key", ["Get one at platform.openai.com → API keys", `Then: ${set}`], set);
}

const body = {
  model,
  input: [
    { role: "developer", content: (options.system || "").trim() || SYSTEM },
    { role: "user", content: question },
  ],
  // Reasoning counts toward it. Kolahal waits about 20 seconds for an answer: low effort keeps within it.
  max_output_tokens: 8000,
  store: false,
};
// Reasoning models (GPT-5 and later, the o-series) take an effort; older ones refuse it.
if (/^(gpt-[5-9]|gpt-\d\d|o\d)/.test(model)) body.reasoning = { effort: "low" };

let r;
try {
  r = await http.request({
    url: "https://api.openai.com/v1/responses",
    method: "POST",
    body,
    headers: { Authorization: `Bearer ${key}` },
  });
} catch (e) {
  if (/time.?out/i.test(String(e.message || e))) {
    const faster = "script set gpt model gpt-6-luna";
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
  const code = error.code || "";
  if (r.status === 401 || code === "invalid_api_key") {
    const set = "script secret gpt OPENAI_API_KEY";
    return fail("OpenAI didn't accept the API key", [`Set it again: ${set}`], set);
  }
  // No credit, or a spending limit reached: waiting doesn't help.
  if (r.status === 429 && (code === "insufficient_quota" || error.type === "insufficient_quota" || /_(spend|usage)_limit_exceeded$/.test(code))) {
    return fail("The OpenAI account has no credit or quota left", ["Add some at platform.openai.com, then try again"]);
  }
  if (r.status === 429) return fail(`Too many questions to ${NAME} for now`, ["Try again in a moment"]);
  if (r.status === 404 || code === "model_not_found") {
    return fail(`${NAME} has no model called ${model}`, ["Choose another: script set gpt model <model>"], "script set gpt model ");
  }
  if (r.status >= 500) return fail(`${NAME} is busy`, ["Try again in a moment"]);
  return fail(`${NAME} answered with an error (HTTP ${r.status})`, error.message ? [String(error.message).slice(0, 300)] : []);
}
if (!json) return fail(`${NAME} sent something unexpected`, ["Try again"]);

if (json.status === "incomplete") {
  const reason = json.incomplete_details && json.incomplete_details.reason;
  if (reason === "content_filter") return fail(`${NAME} declined to answer this`);
  return fail("The answer was too long and was cut off", ["Ask for a shorter one"]);
}
// The output holds reasoning items too: only messages' text counts.
const parts = (json.output || []).filter((o) => o.type === "message").flatMap((m) => m.content || []);
const text = parts.filter((p) => p.type === "output_text").map((p) => p.text).join("").trim();
if (!text && parts.some((p) => p.type === "refusal")) return fail(`${NAME} declined to answer this`);
if (!text) return fail(`${NAME} gave an empty answer`, ["Try again"]);

// The answer, and the model that gave it muted under it. Copy text takes the whole answer.
log(text, json.model || model, { copy: text });
