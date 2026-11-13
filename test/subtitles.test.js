import { test } from "node:test";
import assert from "node:assert/strict";
import { lastWords, step, clampPos } from "../src/subtitles.js";
import { SWITCHES, shown } from "../src/switches.js";

test("Untertitel: letzte n Wörter, Zwischenstand zählt mit", () => {
  const final = "eins zwei drei vier fünf".split(" ");
  assert.deepEqual(lastWords(final, "", 3), { done: "drei vier fünf", pending: "" });
  assert.deepEqual(lastWords(final, " sechs  sieben ", 3), { done: "fünf", pending: "sechs sieben" });
  assert.deepEqual(lastWords(final, "a b c d", 3), { done: "", pending: "b c d" });
  assert.deepEqual(lastWords([], "", 8), { done: "", pending: "" });
});

test("Untertitel: Stufen bleiben am Rand stehen, Unbekanntes fällt auf den ersten Wert", () => {
  const steps = ["8", "15", "25"];
  assert.equal(step(steps, "15", 1), "25");
  assert.equal(step(steps, "25", 1), "25");
  assert.equal(step(steps, "8", -1), "8");
  assert.equal(step(steps, "99", 1), "8");
});

test("Untertitel: Position bleibt im Fenster", () => {
  assert.deepEqual(clampPos({ left: 0.1, top: 0.5, width: 0.5 }, 50, 1000, 800), { left: 100, top: 400, width: 500 });
  // zu weit rechts/unten (z. B. nach Verkleinern des Fensters) -> an den Rand geschoben
  assert.deepEqual(clampPos({ left: 0.9, top: 0.99, width: 0.5 }, 50, 1000, 800), { left: 500, top: 750, width: 500 });
  assert.deepEqual(clampPos({ left: -1, top: -1, width: 2 }, 50, 1000, 800), { left: 0, top: 0, width: 1000 });
});

test("Schalter: showIf mit Liste von Werten", () => {
  const words = SWITCHES.find((s) => s.key === "subtitleWords");
  assert.equal(shown(words, { display: "explain" }), false);
  assert.equal(shown(words, { display: "subtitles" }), true);
  assert.equal(shown(words, { display: "both" }), true);
  const lang = SWITCHES.find((s) => s.key === "browserAsrLang");
  assert.equal(shown(lang, { asr: "browser" }), true);
  assert.equal(shown(lang, { asr: "captions" }), false);
});
