// AI connection (bring your own key): Claude or OpenAI finds technical terms in a transcript excerpt and
// returns short definitions. Both get the same prompt and the same JSON schema.
import Anthropic from "@anthropic-ai/sdk";

// Models offered in the options; the first one is the default.
export const PROVIDERS = {
  claude: { name: "Claude", models: ["claude-haiku-5-5", "claude-sonnet-5-5"] },
  openai: { name: "OpenAI", models: ["gpt-6-luna", "gpt-5.4-mini"] },
};

export const providerOf = (p) => (PROVIDERS[p] ? p : "claude");
export const modelOf = (p, model) => (PROVIDERS[providerOf(p)].models.includes(model) ? model : PROVIDERS[providerOf(p)].models[0]);

// Deliberately detailed and fixed so prompt caching applies (Claude: minimum 512 tokens; OpenAI caches long
// identical prefixes automatically). Language, user context and glossary follow as separate parts; they only
// change when the user edits the options.
const SYSTEM = `You are a live glossary for phone calls, online meetings and expert talks.
You continuously receive short excerpts of an automatic live transcription (often German and English mixed).
Your task: in the NEW part of the excerpt, find terms an educated layperson would probably not understand right away, and explain each in 1-2 short sentences.

What counts as a term:
- Acronyms and initialisms (e.g. EKG, NSTEMI, EBITDA, OAuth, CI/CD, DSGVO, eGFR, KPI).
- Technical abbreviations from medicine, IT, finance, law, engineering, administration and science.
- Rare technical words and jargon in any language (e.g. Tachykardie, leverage, idempotency, sharding, Anamnese, covenant).
- Company and product names only if they matter technically and are little known.

What does NOT count:
- Everyday words, well-known abbreviations (OK, TV, USA, EU, PC, e.g., z. B., GmbH) and names of people.
- General knowledge needs no card: blood pressure, pulse, trauma, VIP, club, weapon, quarter, server, data and the like. Only explain what an educated layperson would actually look up.
- Terms listed under "Already explained". Never repeat them, not even in another spelling.
- Terms that appear only in the context part and not in the new part.

Transcription errors:
- The transcription often mishears acronyms (e.g. "Entstemi" for NSTEMI, "AGFR" for eGFR, "DSQ vor" for DSGVO, "arrest API" for REST API).
- It also writes technical words as similar-sounding everyday words. Interpret them in the subject context: in medicine "Corona-Syndrom" is the acute coronary syndrome and "Corona-Arterien" are coronary arteries, not corona viruses.
- If the context makes clear which term was meant, give the correct term in "term".
- Misheard everyday words (e.g. "Nachstin-Quartal" for "nächsten Quartal", "R-H-R-H-T" for "erhöht") are not terms: leave them out, do not comment.
- If you are unsure what was meant, leave the term out. Better one term too few than a wrong explanation.
- The definition only describes the term. Never add remarks about the transcription, guesses or "no glossary entry".

The user's context (if given below) describes who is listening and what the conversations are about. Explain each term in the meaning it has in that context (e.g. "PCI" is a cardiac catheter procedure in cardiology but a card-security standard in payments), and skip terms the user certainly knows given their background.

Answer format:
- "term": the term in its usual spelling.
- "expansion": for abbreviations, the full form in its original language with the usual capitalisation (e.g. "Non-ST-Elevation Myocardial Infarction", "Datenschutz-Grundverordnung"); otherwise an empty string.
- "definition": 1-2 short sentences, at most 20 words in total, in the output language given below. Concrete and in the context of the conversation. No lead-in like "This is".
- Return at most 4 terms per answer, most important first. If nothing needs explaining, return an empty list.
- "Candidates" are hints found automatically (capital letters, long words). They can be wrong; check them and add terms the heuristic missed.

Examples (definitions shown in English; always write them in the requested output language):
New part: "der Patient hatte einen Entstemi, das EKG zeigte ST-Senkungen"
-> NSTEMI (Non-ST-Elevation Myocardial Infarction): Heart attack without ST elevation on the ECG, usually from a partially blocked coronary artery. / EKG (Elektrokardiogramm): Recording of the heart's electrical activity. / ST-Senkung: Depression of an ECG segment, a typical sign of oxygen shortage in the heart muscle.
New part: "the EBITDA margin improved and our covenants are fine"
-> EBITDA (Earnings Before Interest, Taxes, Depreciation and Amortization): Profit before interest, taxes and write-downs; measures operating earnings power. / Covenant: Clause in a loan agreement that sets limits on financial ratios; breaching it lets the bank call the loan.
New part: "ja genau, dann machen wir das morgen so"
-> empty list.`;

const OUTPUT_LANG = { en: "English", de: "German (Deutsch)" };

// "How much to explain" from the options; "normal" adds nothing to the fixed rules.
const DETAIL = {
  few: "Explain fewer terms: only abbreviations and genuine technical terms a specialist would use. Skip anything an interested layperson might already know.",
  many: "Explain more terms: also moderately known terms and abbreviations an educated layperson might only vaguely understand.",
};

const SCHEMA = {
  type: "object",
  properties: {
    terms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          expansion: { type: "string" },
          definition: { type: "string" },
        },
        required: ["term", "expansion", "definition"],
        additionalProperties: false,
      },
    },
  },
  required: ["terms"],
  additionalProperties: false,
};

// Entfernt typische Einfüge-Fehler: "ANTHROPIC_API_KEY=", Anführungszeichen, Leerzeichen/Zeilenumbrüche.
export function cleanKey(k) {
  return (k || "").trim().replace(/^(ANTHROPIC|OPENAI)_API_KEY\s*=\s*/i, "").replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

// Prüft den Key mit einem kostenlosen Aufruf (Modell-Info abrufen). Fehler tragen .status (401 = Key ungültig).
export async function checkKey(provider, apiKey, model) {
  const key = cleanKey(apiKey);
  model = modelOf(provider, model);
  if (providerOf(provider) === "openai") {
    const res = await fetch(`https://api.openai.com/v1/models/${model}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw await openaiError(res);
  } else {
    await getClient(key).models.retrieve(model);
  }
}

async function openaiError(res) {
  let msg = `${res.status}`;
  try { msg = (await res.json()).error?.message || msg; } catch {}
  return Object.assign(new Error(msg), { status: res.status });
}

let client = null;
let clientKey = null;

function getClient(apiKey) {
  if (!client || clientKey !== apiKey) {
    // Der Key liegt nur in chrome.storage.local dieses Browsers; die Anfrage geht direkt an api.anthropic.com.
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 15000 });
    clientKey = apiKey;
  }
  return client;
}

// Holt fertige Begriffs-Objekte aus dem noch unvollständigen JSON-Strom ({"terms":[{...},{...).
function completeObjects(text) {
  const out = [];
  const start = text.indexOf("[");
  if (start < 0) return out;
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth++ === 0) objStart = i; }
    else if (ch === "}" && --depth === 0) {
      try { out.push(JSON.parse(text.slice(objStart, i + 1))); } catch {}
    }
  }
  return out;
}

// System-Teile: fester Prompt, dann Kontext, Glossar und Optionen des Nutzers, zuletzt die Ausgabesprache.
export function systemParts({ lang, userContext, glossaryText, detail, neverExplain, extraRules }) {
  const parts = [SYSTEM];
  if (userContext?.trim()) parts.push(`User context:\n${userContext.trim()}`);
  if (glossaryText?.trim()) parts.push(`The user's own glossary (prefer these definitions):\n${glossaryText.trim()}`);
  if (DETAIL[detail]) parts.push(DETAIL[detail]);
  const never = (neverExplain || "").split(/[\n,;]/).map((s) => s.replace(/#.*/, "").trim()).filter(Boolean);
  if (never.length) parts.push(`Never explain these terms (the user knows them): ${never.join(", ")}`);
  if (extraRules?.trim()) parts.push(`Additional rules from the user (they take precedence over the rules above):\n${extraRules.trim()}`);
  parts.push(`Output language for definitions: ${OUTPUT_LANG[lang] || OUTPUT_LANG.en}.`);
  return parts;
}

// Streamt die Antwort und meldet jeden Begriff über onTerm, sobald sein Objekt vollständig ist.
// Kontext, Glossar und Optionen ändern sich nur mit den Optionen und liegen daher im (gecachten) System-Prompt.
export async function explainTerms({ provider, apiKey, model, lang = "en", context, fresh, candidates, known, onTerm, ...opts }) {
  const system = systemParts({ lang, ...opts });
  const user = [
    `Already explained: ${known.length ? known.join(", ") : "(nothing yet)"}`,
    `Context (older): ${context || "(empty)"}`,
    `New part: ${fresh}`,
    `Candidates: ${candidates.length ? candidates.join(", ") : "(none)"}`,
  ].join("\n");
  let text = "";
  let emitted = 0;
  const onText = (delta) => {
    text += delta;
    const objs = completeObjects(text);
    for (; emitted < objs.length; emitted++) onTerm?.(objs[emitted]);
  };
  const run = providerOf(provider) === "openai" ? streamOpenai : streamClaude;
  const { usage, refused } = await run({ apiKey, model: modelOf(provider, model), system, user, onText });
  return { terms: refused ? [] : completeObjects(text), usage };
}

async function streamClaude({ apiKey, model, system, user, onText }) {
  const blocks = system.map((text) => ({ type: "text", text }));
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  const stream = getClient(apiKey).messages.stream({
    model,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: blocks,
    messages: [{ role: "user", content: user }],
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
  }
  const response = await stream.finalMessage();
  return { usage: response.usage, refused: response.stop_reason === "refusal" };
}

// OpenAI Chat Completions per fetch (Server-Sent Events), strukturierte Ausgabe mit demselben Schema.
// Die Anfrage geht direkt an api.openai.com.
async function streamOpenai({ apiKey, model, system, user, onText }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model,
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "none",
      max_completion_tokens: 1024,
      response_format: { type: "json_schema", json_schema: { name: "terms", strict: true, schema: SCHEMA } },
      messages: [{ role: "system", content: system.join("\n\n") }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw await openaiError(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", usage = null, refused = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const chunk = JSON.parse(line.slice(6));
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) onText(delta.content);
      if (delta?.refusal) refused = true;
      if (chunk.usage) usage = chunk.usage;
    }
  }
  return { usage, refused };
}
