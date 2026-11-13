import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine } from "../src/engine.js";

const words = (s, t = 1000) => s.split(" ").map((w, i) => ({ w, t: t + i * 300 }));

test("Glossar-Treffer erscheint sofort, Claude-Ergebnis danach, keine Doppelten", async () => {
  const cards = [];
  const calls = [];
  const engine = new Engine({
    glossaryText: "EKG: Elektrokardiogramm",
    onCard: (c) => cards.push(c),
    explain: async (a) => { calls.push(a); return { terms: [{ term: "NSTEMI", expansion: "", definition: "Herzinfarkt." }, { term: "EKG", expansion: "", definition: "x" }] }; },
  });
  engine.addWords(words("der Patient hatte einen NSTEMI und das EKG war auffällig"));
  assert.equal(cards[0].term, "EKG");
  assert.equal(cards[0].source, "glossar");
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].candidates, ["NSTEMI"]);
  assert.deepEqual(cards.map((c) => c.term), ["EKG", "NSTEMI"]);
  assert.equal(cards[1].spokenAt, 1000 + 4 * 300);
  assert.equal(engine.cache.nstemi.definition, "Herzinfarkt.");
});

test("Nie-erklären-Liste: weder Kandidat noch Karte, auch wenn Claude den Begriff liefert", async () => {
  const cards = [];
  const calls = [];
  const engine = new Engine({
    neverText: "api, KPI\n# Kommentar\nCluster",
    onCard: (c) => cards.push(c),
    explain: async (a) => { calls.push(a); return { terms: [{ term: "API", expansion: "", definition: "x" }, { term: "OAuth", expansion: "", definition: "Login-Standard." }] }; },
  });
  engine.addWords(words("die API nutzt OAuth und der KPI steigt"));
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls[0].candidates, ["OAuth"]);
  assert.deepEqual(cards.map((c) => c.term), ["OAuth"]);
});

test("Nur Untertitel: keine KI; nach dem Umschalten nur neue Wörter fragen, ältere als Kontext", async () => {
  const calls = [];
  const engine = new Engine({
    useLlm: false,
    onCard: () => {},
    explain: async (a) => { calls.push(a); return { terms: [] }; },
  });
  engine.addWords(words("der Patient hatte einen NSTEMI"));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 0);
  engine.setLlm(true);
  engine.addWords(words("und dann ein EKG", 5000));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fresh, "und dann ein EKG");
  assert.deepEqual(calls[0].candidates, ["EKG"]);
  assert.equal(calls[0].context, "der Patient hatte einen NSTEMI");
});
