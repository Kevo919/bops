// Tests for lib/chat-error.ts: a chat model's provider saying no, said in plain words for the chat's error card.
// Each common case maps to its own kind and line: out of credit or quota (402, 429 insufficient_quota, "no credits
// remaining"), rate limited (429), a bad key (401), no such model (404), the provider down (5xx), and anything else;
// the provider's own words are kept for Details, and no key ever shows, given or only shaped like one.
// Usage: node --experimental-strip-types scripts/test-chat-error.mjs
import assert from "node:assert/strict";
import { AI_PLANS, chatErrorKind, chatErrorOf, providerName, withoutKeys } from "../lib/chat-error.ts";

let passed = 0;
const check = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};
// Fake keys are built from pieces, so no secret scanner reads this file as holding one.
const fake = (...parts) => parts.join("");
const KEY = ["sk", "proj", "SECRET" + "x".repeat(24)].join("-");

check("Kevin's case: the OpenAI SDK's '429 You have no credits remaining' with a URL is out of credit, in plain words", () => {
  const e = chatErrorOf({ provider: "openai", status: 429, message: "429 You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing", model: "gpt-5.5", bot: "Boppy" });
  assert.equal(e.kind, "credit");
  assert.equal(e.title, "Out of credit");
  assert.equal(e.text, `Your OpenAI account is out of credit, so Boppy can't answer. Add credit at platform.openai.com, Billing, or pick another model in ${AI_PLANS}.`);
  assert.ok(!/^429/.test(e.text) && !e.text.includes("https://"), "no raw status or URL in the line");
  assert.match(e.details, /no credits remaining/, "the raw words are kept for Details");
  assert.equal(e.provider, "OpenAI");
  assert.equal(e.status, 429);
});

check("out of credit or quota: 402, 429 insufficient_quota (by code or words), quota exceeded", () => {
  assert.equal(chatErrorKind({ status: 402, message: "Payment Required" }), "credit");
  assert.equal(chatErrorKind({ status: 429, code: "insufficient_quota", message: "429 Request failed" }), "credit");
  assert.equal(chatErrorKind({ status: 429, message: "You exceeded your current quota, please check your plan and billing details." }), "credit");
  assert.equal(chatErrorKind({ status: 429, message: "Insufficient balance or no resource package. Please recharge. (code 1113)" }), "credit");
  assert.equal(chatErrorKind({ message: "429 You have no credits remaining" }), "credit", "the status read from the words");
  const e = chatErrorOf({ provider: "anthropic", status: 400, code: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API.", bot: "Rook" });
  // Anthropic says low credit with a 400.
  assert.equal(e.kind, "credit");
  assert.equal(e.text, `Your Anthropic account is out of credit, so Rook can't answer. Add credit at console.anthropic.com, Billing, or pick another model in ${AI_PLANS}.`);
  assert.equal(chatErrorKind({ status: 500, message: "billing service error" }), "down", "a 5xx is the provider's side, whatever its words");
  assert.equal(chatErrorOf({ provider: "anthropic", status: 403, message: "Your credit balance is too low" }).kind, "credit");
});

check("rate limited: a 429 that isn't about credit says to try again in a moment", () => {
  const e = chatErrorOf({ provider: "openai", status: 429, code: "rate_limit_exceeded", message: "Rate limit reached for gpt-5.5 on tokens per min (TPM): Limit 30000. Please try again in 2s.", bot: "Boppy" });
  assert.equal(e.kind, "rate");
  assert.equal(e.text, `OpenAI is getting too many requests right now, so Boppy can't answer yet. Try again in a moment, or pick another model in ${AI_PLANS}.`);
  assert.equal(chatErrorKind({ message: "Too many requests" }), "rate");
});

check("bad key: 401 (and a 403 about the key) says the key wasn't accepted", () => {
  const e = chatErrorOf({ provider: "openai", status: 401, message: `401 Incorrect API key provided: ${KEY}. You can find your API key at https://platform.openai.com/account/api-keys.`, bot: "Boppy" });
  assert.equal(e.kind, "key");
  assert.equal(e.title, "Key not accepted");
  assert.match(e.text, /^OpenAI didn't accept your API key, so Boppy can't answer\. Check the key in Keys, or pick another model in Settings → AI subscriptions\.$/);
  assert.ok(!e.details.includes(KEY) && !e.details.includes("SECRET"), "never the key, even one Bops wasn't told about");
  assert.equal(chatErrorKind({ status: 403, message: "invalid x-api-key" }), "key");
});

check("model not found: 404 (or model_not_found) names the model, without its provider", () => {
  const e = chatErrorOf({ provider: "openai", status: 404, code: "model_not_found", message: "The model `gpt-9` does not exist or you do not have access to it.", model: "openai/gpt-9", bot: "Boppy" });
  assert.equal(e.kind, "model");
  assert.equal(e.text, `OpenAI doesn't have the model "gpt-9", so Boppy can't answer. Pick another model in ${AI_PLANS}.`);
  assert.equal(chatErrorKind({ status: 400, message: "Unknown model: foo" }), "model");
});

check("provider down: any 5xx, and an overloaded or bad gateway answer with no status", () => {
  for (const status of [500, 502, 503, 529]) assert.equal(chatErrorKind({ status, message: "upstream" }), "down", `${status}`);
  assert.equal(chatErrorKind({ message: "Service Unavailable" }), "down");
  const e = chatErrorOf({ provider: "zai-coding", status: 503, message: "Service temporarily unavailable", bot: "Boppy" });
  assert.equal(e.title, "Z.ai is down");
  assert.equal(e.text, `Z.ai is having trouble on its side right now, so Boppy can't answer. Try again in a minute, or pick another model in ${AI_PLANS}.`);
});

check("anything else: plain, still pointing at AI subscriptions, with its words behind Details", () => {
  const e = chatErrorOf({ provider: "openrouter", status: 400, message: "Bad request: messages[0] invalid", bot: "pip" });
  assert.equal(e.kind, "other");
  assert.equal(e.text, `Pip couldn't answer: OpenRouter turned the request down. Try again, or pick another model in ${AI_PLANS}.`);
  assert.match(e.details, /^400 Bad request/);
  const unknown = chatErrorOf({ status: 500 });
  assert.equal(unknown.details, undefined, "no words: no Details");
  assert.match(unknown.text, /^The AI provider is having trouble/);
});

check("keys: the ones given and anything shaped like one go, in URLs and headers too", () => {
  const given = fake("zai-test-", "SECRET456");
  const ant = fake("sk-ant-", "api03-", "A".repeat(16));
  const out = withoutKeys(`key ${given} Bearer abcdefghijklmnop https://x.test/v1?api_key=hunter2hunter2&b=1 ${ant} ${KEY}`, [given]);
  for (const bad of [given, "abcdefghijklmnop", "hunter2", "AAAAAAAAAAAAAAAA", "SECRETxxx"]) assert.ok(!out.includes(bad), `${bad} shows: ${out}`);
  assert.match(out, /api_key=…&b=1/);
  const e = chatErrorOf({ provider: "openai", status: 429, message: `429 You have no credits remaining (key ${given})` }, [given]);
  assert.ok(!e.details.includes(given) && !e.text.includes(given));
});

check("rate limits stay rate limits: OpenAI's rate_limit_exceeded linking billing, and 'Used 1113' in a TPM message", () => {
  const billing = chatErrorOf({ provider: "openai", status: 429, code: "rate_limit_exceeded", message: "429 Rate limit reached for gpt-5.5 in organization org-x on requests per min (RPM): Limit 500, Used 500. Visit https://platform.openai.com/account/billing to add a payment method.", bot: "Boppy" });
  assert.equal(billing.kind, "rate");
  assert.equal(billing.title, "Too many requests");
  const tpm = chatErrorOf({ provider: "openai", status: 429, code: "rate_limit_exceeded", message: "Rate limit reached for gpt-5.5 on tokens per min (TPM): Limit 30000, Used 1113, Requested 29000. Please try again in 2s." });
  assert.equal(tpm.kind, "rate");
  // The same words with no code: still a rate limit (1113 counts only as a code; "billing" alone isn't credit).
  assert.equal(chatErrorKind({ status: 429, message: "Rate limit reached on tokens per min (TPM): Limit 30000, Used 1113. Visit https://platform.openai.com/account/billing" }), "rate");
  assert.equal(chatErrorKind({ status: 400, message: "Used 1113 tokens" }), "other");
  // The code decides over the words: insufficient_quota is credit even if its words talk about limits; 1113 as a code is credit.
  assert.equal(chatErrorKind({ status: 429, code: "insufficient_quota", message: "Rate limit: you exceeded your current quota" }), "credit");
  assert.equal(chatErrorKind({ status: 429, code: "1113", message: "Please recharge" }), "credit");
  assert.equal(chatErrorKind({ status: 429, code: "rate_limit_exceeded", message: "You have no credits remaining" }), "rate");
});

check("every form of key goes, each on its own", () => {
  const forms = [
    ["a bare Google key", fake("AIza", "B".repeat(35)), (o) => !o.includes("BBBBBBBBBB")],
    ["a GitHub token (ghp_)", fake("ghp", "_", "C".repeat(36)), (o) => !o.includes("CCCCCCCCCC")],
    ["a GitHub OAuth token (gho_)", fake("gho", "_", "D".repeat(36)), (o) => !o.includes("DDDDDDDDDD")],
    ["a GitHub fine-grained token", fake("github", "_pat_", "E".repeat(40)), (o) => !o.includes("EEEEEEEEEE")],
    ["a live secret key (sk_live_)", fake("sk", "_live_", "F".repeat(24)), (o) => !o.includes("FFFFFFFFFF")],
    ["a test secret key (sk_test_)", fake("sk", "_test_", "G".repeat(24)), (o) => !o.includes("GGGGGGGGGG")],
    ["a restricted key (rk_live_)", fake("rk", "_live_", "H".repeat(24)), (o) => !o.includes("HHHHHHHHHH")],
    ["a JSON api_key", `{"api_key": "${fake("val", "J".repeat(12))}"}`, (o) => !o.includes("JJJJ") && o.includes('"api_key": "…"')],
    ["a JSON apiKey", `{"apiKey":"${fake("val", "K".repeat(12))}"}`, (o) => !o.includes("KKKK") && o.includes('"apiKey":"…"')],
    ["a JSON token", `{"token": "${fake("val", "L".repeat(12))}"}`, (o) => !o.includes("LLLL")],
    ["a JSON secret", `{"secret": "${fake("val", "M".repeat(12))}"}`, (o) => !o.includes("MMMM")],
    ["an x-api-key header", `x-api-key: ${fake("val", "N".repeat(12))}`, (o) => !o.includes("NNNN") && /^x-api-key: …$/.test(o)],
    ["an authorization header", `authorization: Bearer ${fake("val", "P".repeat(12))}`, (o) => !o.includes("PPPP") && /^authorization: …$/.test(o)],
    ["a URL's user:password@", `https://${fake("ava", ":", "Q".repeat(10))}@api.example.test/v1`, (o) => !o.includes("QQQQ") && !o.includes("ava:") && o.includes("https://…api.example.test/v1")],
    ["a key= query param", `https://api.example.test/v1?key=${fake("R".repeat(14))}&b=1`, (o) => !o.includes("RRRR") && o.includes("?key=…&b=1")],
    ["a token= query param", `https://api.example.test/v1?a=1&token=${fake("S".repeat(14))}`, (o) => !o.includes("SSSS") && o.includes("&token=…")],
    ["a Z.ai <id>.<secret> key not in the environment", fake("0123456789abcdef".repeat(2), ".", "T".repeat(16)), (o) => !o.includes("0123456789abcdef") && !o.includes("TTTT")],
  ];
  for (const [what, raw, ok] of forms) {
    const out = withoutKeys(raw);
    assert.ok(ok(out), `${what}: ${out}`);
  }
  // Every configured provider key, at any length: a short one too.
  const short = fake("z", "k", "9");
  assert.equal(withoutKeys(`the key ${short} was refused`, [short]), "the key … was refused");
  const e = chatErrorOf({ provider: "zai", status: 401, message: `401 bad key ${fake("0123456789abcdef".repeat(2), ".", "U".repeat(20))} (x-api-key: ${short})` }, [short]);
  assert.ok(!e.details.includes("UUUU") && !e.details.includes(short), e.details);
});

check("provider names: routes and names both", () => {
  assert.equal(providerName("openai"), "OpenAI");
  assert.equal(providerName("OpenAI"), "OpenAI");
  assert.equal(providerName("zai-coding-cn"), "Z.ai");
  assert.equal(providerName("Acme AI"), "Acme AI");
  assert.equal(providerName(""), undefined);
});

console.log(`\nchat errors: ${passed} passed`);
