// @title Claude
// @desc Ask Claude a question with your own Anthropic API key: claude <question>
// @author Kolahal
// @version 1.0
// @command
// @usage <question>
// @secret ANTHROPIC_API_KEY api.anthropic.com An Anthropic API key: platform.claude.com → API keys
// @option model claude-sonnet-5-5 The model: claude-sonnet-5-5, claude-opus-5-5, claude-haiku-5-5 or another
// @option system "" Instructions for every answer (empty: short answers in plain text)
// @tags ai, assistant
// @requires 0.5.23
//
// Talks to: api.anthropic.com (the Messages API), with your key. Sends only the question and the
// instructions.
//
//   claude why is the sky blue     one question, one answer; nothing of it is kept
//
// Set the key once: `script secret claude ANTHROPIC_API_KEY`, or Scripts → claude → Secrets. It is
// kept encrypted, and Kolahal puts it in the request to api.anthropic.com only: the script never
// sees it. A model: `script set claude model claude-haiku-5-5`.
//
// gpt, gemini, openrouter and ollama ask other models the same way.

const NAME = "Claude";
const SYSTEM = "Answer briefly, in plain text without Markdown: the answer is read on a phone.";
// Sonnet and Opus take Anthropic's server-side fallback: a question one of them declines is asked again
// of the model Anthropic picks for it.
const FALLBACK = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-2", "claude-fable-5-1"];

// A failure: what went wrong, then a hint a line. Copy gives the command a hint suggests.
const fail = (what, hints = [], copy) => log(fmt.color("bad", what), hints.join("\n") || null, copy ? { copy } : {});

const question = (argline || "").trim();
const model = (options.model || "").trim() || "claude-sonnet-5-5";
if (!question) return log(fmt.color("muted", "Usage: claude <question>"), `Model: ${model}`);

const key = secrets.get("ANTHROPIC_API_KEY");
if (!key) {
  const set = "script secret claude ANTHROPIC_API_KEY";
  return fail("No Anthropic API key", ["Get one at platform.claude.com → API keys", `Then: ${set}`], set);
}

const body = {
  model,
  // Kolahal waits about 20 seconds for an answer: low effort and a short answer keep within it.
  max_tokens: 8000,
  system: (options.system || "").trim() || SYSTEM,
  messages: [{ role: "user", content: question }],
  output_config: { effort: "low" },
};
const headers = { "x-api-key": key, "anthropic-version": "2026-10-21" };
if (FALLBACK.includes(model)) {
  body.fallbacks = "default";
  headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
}

let r;
try {
  r = await http.request({ url: "https://api.anthropic.com/v1/messages", method: "POST", body, headers });
} catch (e) {
  if (/time.?out/i.test(String(e.message || e))) {
    const faster = "script set claude model claude-haiku-5-5";
    // Already that model: only the first hint.
    if (faster.endsWith(` ${model}`)) return fail(`${NAME} took too long to answer`, ["Ask for a shorter answer"]);
    return fail(`${NAME} took too long to answer`, ["Ask for a shorter answer", `Or a faster model: ${faster}`], faster);
  }
  return fail(`Couldn't reach ${NAME}`, ["Check the connection and try again"]);
}

let json = null;
try { json = JSON.parse(r.body); } catch (e) { /* an error page: the status says enough */ }

if (!r.ok) {
  const type = (json && json.error && json.error.type) || "";
  const message = (json && json.error && json.error.message) || "";
  if (r.status === 401 || r.status === 403 || type === "authentication_error" || type === "permission_error") {
    const set = "script secret claude ANTHROPIC_API_KEY";
    return fail("Anthropic didn't accept the API key", [`Set it again: ${set}`], set);
  }
  // A monthly spend limit is a 429 too, and waiting doesn't lift it.
  if (r.status === 402 || type === "billing_error" || /credit balance|spend/i.test(message)) {
    return fail("The Anthropic account has no credit left", ["Add some at platform.claude.com, then try again"]);
  }
  if (r.status === 429) return fail(`Too many questions to ${NAME} for now`, ["Try again in a moment"]);
  if (r.status === 404 || type === "not_found_error") {
    return fail(`${NAME} has no model called ${model}`, ["Choose another: script set claude model <model>"], "script set claude model ");
  }
  if (r.status >= 500) return fail(`${NAME} is busy`, ["Try again in a moment"]);
  return fail(`${NAME} answered with an error (HTTP ${r.status})`, message ? [message.slice(0, 300)] : []);
}
if (!json) return fail(`${NAME} sent something unexpected`, ["Try again"]);

// A refusal is a normal answer: read its reason before its text.
if (json.stop_reason === "refusal") return fail(`${NAME} declined to answer this`);
if (json.stop_reason === "max_tokens") return fail("The answer was too long and was cut off", ["Ask for a shorter one"]);
const text = (json.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
if (!text) return fail(`${NAME} gave an empty answer`, ["Try again"]);

// The answer, and the model that gave it muted under it. Copy text takes the whole answer.
log(text, json.model || model, { copy: text });
