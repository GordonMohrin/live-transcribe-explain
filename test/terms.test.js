import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateOf, findCandidates, markInitials, parseGlossary } from "../src/terms.js";

test("Akronyme und gemischte Schreibweisen", () => {
  for (const [w, exp] of [["EKG", "EKG"], ["CRP", "CRP"], ["eGFR,", "eGFR"], ["DSGVO-Vorgaben", "DSGVO"], ["OAuth", "OAuth"],
    ["CI/CD", "CI/CD"], ["EBITDA.", "EBITDA"], ["mRNA", "mRNA"], ["Kubernetes", null], ["Patient", null], ["OK", null],
    ["USA", null], ["z.B.", null], ["2024", null], ["Myokardinfarktdiagnostik", "Myokardinfarktdiagnostik"]]) {
    assert.equal(candidateOf(w), exp, w);
  }
});

test("Plural-s bei Akronymen fällt weg", () => {
  assert.deepEqual(findCandidates([{ w: "APIs", t: 1 }]).map((c) => c.term), ["API"]);
});

test("Glossar-Format", () => {
  const g = parseGlossary("# Kommentar\nKVP: Kontinuierlicher Verbesserungsprozess\nSLA = Service Level Agreement\n\nkaputt");
  assert.equal(g.kvp.definition, "Kontinuierlicher Verbesserungsprozess");
  assert.equal(g.sla.term, "SLA");
  assert.equal(Object.keys(g).length, 2);
});

test("Anfangsbuchstaben der Langform markieren", () => {
  // markierte Zeichen groß, alle anderen klein
  const show = (term, exp) => {
    const m = markInitials(term, exp);
    return m ? [...exp].map((c, i) => (m.has(i) ? c.toUpperCase() : c.toLowerCase())).join("") : null;
  };
  assert.equal(show("NSTEMI", "Non-ST-Elevation Myocardial Infarction"), "Non-ST-Elevation Myocardial Infarction"
    .toLowerCase().replace(/^n/, "N").replace("-st-", "-ST-").replace("-e", "-E").replace(" m", " M").replace(" i", " I"));
  assert.equal(show("EBITDA", "Earnings Before Interest, Taxes, Depreciation and Amortization"),
    "Earnings Before Interest, Taxes, Depreciation and Amortization");
  assert.equal(show("EKG", "Elektrokardiogramm"), "EleKtrokardioGramm");
  assert.equal(show("DSGVO", "Datenschutz-Grundverordnung"), "DatenSchutz-GrundVerOrdnung");
  assert.equal(show("eGFR", "estimated Glomerular Filtration Rate"), "Estimated Glomerular Filtration Rate");
  assert.equal(show("API", ""), null);
  assert.equal(show("XYZ", "Application Programming Interface"), null);
});
