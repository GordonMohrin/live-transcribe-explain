import { test } from "node:test";
import assert from "node:assert/strict";
import { explainTerms, modelOf, cleanKey } from "../src/llm.js";

const ARGS = { lang: "de", context: "", fresh: "das EKG zeigte einen NSTEMI", candidates: ["EKG", "NSTEMI"], known: [] };

// Antwort von OpenAI als Server-Sent Events, absichtlich mitten im JSON zerschnitten.
function sse(text, cuts = [7, 30, 55]) {
  const parts = [];
  let last = 0;
  for (const c of [...cuts, text.length]) { parts.push(text.slice(last, c)); last = c; }
  const lines = parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
  lines.push(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 40 } })}\n\n`, "data: [DONE]\n\n");
  const raw = lines.join("");
  return new Response(new ReadableStream({
    start(c) { for (let i = 0; i < raw.length; i += 23) c.enqueue(new TextEncoder().encode(raw.slice(i, i + 23))); c.close(); },
  }));
}

test("OpenAI: Begriffe kommen einzeln aus dem Strom, Anfrage mit Schema und eigenem Key", async (t) => {
  const json = JSON.stringify({ terms: [
    { term: "EKG", expansion: "Elektrokardiogramm", definition: "Aufzeichnung der Herzströme." },
    { term: "NSTEMI", expansion: "Non-ST-Elevation Myocardial Infarction", definition: "Herzinfarkt ohne ST-Hebung." },
  ] });
  let req = null;
  t.mock.method(globalThis, "fetch", async (url, init) => { req = { url, init }; return sse(json); });
  const seen = [];
  const r = await explainTerms({ ...ARGS, provider: "openai", apiKey: "sk-test", model: "unbekannt", onTerm: (x) => seen.push(x.term) });
  assert.deepEqual(seen, ["EKG", "NSTEMI"]);
  assert.equal(r.terms.length, 2);
  assert.equal(r.usage.prompt_tokens, 900);
  assert.equal(req.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(req.init.headers.Authorization, "Bearer sk-test");
  const body = JSON.parse(req.init.body);
  assert.equal(body.model, "gpt-6-luna"); // unbekanntes Modell fällt auf den Standard zurück
  assert.equal(body.response_format.json_schema.strict, true);
  assert.match(body.messages[0].content, /Output language for definitions: German/);
});

test("OpenAI: Fehler mit Status (401 = Key ungültig)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 }));
  await assert.rejects(explainTerms({ ...ARGS, provider: "openai", apiKey: "x" }), (e) => e.status === 401 && /Incorrect/.test(e.message));
});

test("Modell und Key: Standard je Anbieter, Einfüge-Fehler entfernt", () => {
  assert.equal(modelOf("claude", undefined), "claude-haiku-5-5");
  assert.equal(modelOf("openai", "gpt-5.4-mini"), "gpt-5.4-mini");
  assert.equal(modelOf("gibtsnicht", "gpt-5.4-mini"), "claude-haiku-5-5");
  assert.equal(cleanKey(' OPENAI_API_KEY="sk-abc\n" '), "sk-abc");
});
