// @title OpenRouter
// @desc Ask any of OpenRouter's models a question with your own OpenRouter API key: openrouter <question>
// @author Kolahal
// @version 1.0
// @command
// @usage <question>
// @secret OPENROUTER_API_KEY openrouter.ai An OpenRouter API key: openrouter.ai → Keys
// @option model openai/gpt-6-luna The model, as openrouter.ai/models names it: openai/gpt-6-luna, anthropic/claude-haiku-5.5…
// @option system "" Instructions for every answer (empty: short answers in plain text)
// @tags ai, assistant
// @requires 0.5.23
//
// Talks to: openrouter.ai (its chat completions API), with your key. OpenRouter passes the question
// and the instructions on to the model's own company.
//
//   openrouter why is the sky blue     one question, one answer; nothing of it is kept
//
// One key and one balance for models of many companies. Set the key once:
// `script secret openrouter OPENROUTER_API_KEY`, or Scripts → openrouter → Secrets. It is kept
// encrypted, and Kolahal puts it in the request to openrouter.ai only: the script never sees it.
// A model: `script set openrouter model google/gemini-3.5-flash-lite`.
//
// claude, gpt, gemini and ollama ask models the same way, each with its company's own key.

const NAME = "OpenRouter";
const SYSTEM = "Answer briefly, in plain text without Markdown: the answer is read on a phone.";

// A failure: what went wrong, then a hint a line. Copy gives the command a hint suggests.
const fail = (what, hints = [], copy) => log(fmt.color("bad", what), hints.join("\n") || null, copy ? { copy } : {});

const question = (argline || "").trim();
const model = (options.model || "").trim() || "openai/gpt-6-luna";
if (!question) return log(fmt.color("muted", "Usage: openrouter <question>"), `Model: ${model}`);

const key = secrets.get("OPENROUTER_API_KEY");
if (!key) {
  const set = "script secret openrouter OPENROUTER_API_KEY";
  return fail("No OpenRouter API key", ["Get one at openrouter.ai → Keys", `Then: ${set}`], set);
}

const body = {
  model,
  messages: [
    { role: "system", content: (options.system || "").trim() || SYSTEM },
    { role: "user", content: question },
  ],
  // A request waits up to 60 seconds (timeout below): low reasoning effort keeps within it. Models that
  // don't reason leave it out.
  max_tokens: 8000,
  reasoning: { effort: "low" },
};

let r;
try {
  r = await http.request({
    url: "https://openrouter.ai/api/v1/chat/completions",
    method: "POST",
    body,
    headers: { Authorization: `Bearer ${key}` },
    timeout: 60,
  });
} catch (e) {
  if (/time.?out/i.test(String(e.message || e))) {
    const faster = "script set openrouter model openai/gpt-6-luna";
    // Already that model: only the first hint.
    if (faster.endsWith(` ${model}`)) return fail(`${model} took too long to answer`, ["Ask for a shorter answer"]);
    return fail(`${model} took too long to answer`, ["Ask for a shorter answer", `Or a faster model: ${faster}`], faster);
  }
  return fail(`Couldn't reach ${NAME}`, ["Check the connection and try again"]);
}

let json = null;
try { json = JSON.parse(r.body); } catch (e) { /* an error page: the status says enough */ }

// OpenRouter can also answer 200 with an error in place of the answer.
const error = (json && (json.error || (json.choices && json.choices[0] && json.choices[0].error))) || null;
if (!r.ok || error) {
  const status = r.ok ? Number(error.code) || 0 : r.status;
  const message = String((error && error.message) || "");
  if (status === 401) {
    const set = "script secret openrouter OPENROUTER_API_KEY";
    return fail("OpenRouter didn't accept the API key", [`Set it again: ${set}`], set);
  }
  if (status === 402) return fail("The OpenRouter account has no credit left", ["Add some at openrouter.ai, then try again"]);
  // A moderation or guardrail block.
  if (status === 403) return fail(`${model} declined to answer this`, message ? [message.slice(0, 300)] : []);
  if (status === 429) return fail(`Too many questions to ${model} for now`, ["Try again in a moment, or choose another model"]);
  if (status === 404 || /not a valid model|no endpoints found/i.test(message)) {
    return fail(`${NAME} has no model called ${model}`, ["Choose another: script set openrouter model <model>"], "script set openrouter model ");
  }
  if (status >= 500) return fail(`${model} is busy`, ["Try again in a moment, or choose another model"]);
  return fail(`${NAME} answered with an error (HTTP ${status})`, message ? [message.slice(0, 300)] : []);
}
if (!json) return fail(`${NAME} sent something unexpected`, ["Try again"]);

const choice = (json.choices || [])[0];
if (!choice) return fail(`${model} gave an empty answer`, ["Try again"]);
if (choice.finish_reason === "length") return fail("The answer was too long and was cut off", ["Ask for a shorter one"]);
if (choice.finish_reason === "content_filter") return fail(`${model} declined to answer this`);
const message = choice.message || {};
const text = String(message.content || "").trim();
if (!text && message.refusal) return fail(`${model} declined to answer this`);
if (!text) return fail(`${model} gave an empty answer`, ["Try again"]);

// The answer, and the model that gave it muted under it. Copy text takes the whole answer.
log(text, json.model || model, { copy: text });
