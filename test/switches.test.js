import { test } from "node:test";
import assert from "node:assert/strict";
import { SWITCHES, normalizeSwitches } from "../src/switches.js";

test("Schalter: Standardwerte und Rückfall bei unbekannten Werten", () => {
  const s = normalizeSwitches({ asr: "helper", detail: "gibtsnicht", browserAsrLang: "de-DE" });
  assert.equal(s.asr, "browser");
  assert.equal(s.detail, "normal");
  assert.equal(s.browserAsrLang, "de-DE");
});

test("Schalter: jeder Eintrag ist vollständig (Texte en/de, Standard unter den Werten)", () => {
  const keys = new Set();
  for (const sw of SWITCHES) {
    assert.ok(!keys.has(sw.key), `doppelt: ${sw.key}`);
    keys.add(sw.key);
    assert.ok(sw.label.en && sw.label.de, sw.key);
    assert.ok(sw.choices.some((c) => c.value === sw.default), sw.key);
    for (const c of sw.choices) assert.ok(c.en && c.de, `${sw.key}.${c.value}`);
    for (const k of Object.keys(sw.showIf || {})) assert.ok(SWITCHES.some((o) => o.key === k), `showIf ${k}`);
  }
});
