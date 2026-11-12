// Heuristische Begriffserkennung: findet Kandidaten (Akronyme, Abkürzungen, lange Fachwörter)
// in einem Wortstrom. Die endgültige Entscheidung trifft Glossar, Cache oder das LLM.

// Sehr geläufige Abkürzungen, die niemand erklärt haben will.
const STOP = new Set([
  "OK", "OKAY", "TV", "USA", "US", "EU", "UK", "PC", "ID", "CD", "DVD", "SMS", "WLAN", "USB",
  "AG", "GMBH", "BZW", "ZB", "DH", "USW", "CA", "NR", "MR", "MRS", "DR", "PROF", "I", "A",
  "AM", "PM", "TV", "IT", "ICH", "DU", "ER", "SIE", "ES", "WIR", "IHR", "THE", "AND", "OF",
]);

const PUNCT = /^[\s"'„“”‚‘’«»()[\]{}<>,;:!?…]+|[\s"'„“”‚‘’«»()[\]{}<>,;:!?…]+$/g;

export function normTerm(s) {
  return s.replace(PUNCT, "").replace(/\.$/, "").toLowerCase();
}

function upperCount(s) {
  return (s.match(/[A-ZÄÖÜ]/g) || []).length;
}

// Prüft ein einzelnes Token und gibt den Kandidaten (ggf. gekürzt) oder null zurück.
export function candidateOf(raw) {
  const tok = raw.replace(PUNCT, "").replace(/\.$/, "");
  if (tok.length < 2) return null;

  // Bindestrich-Komposita: "DSGVO-Vorgaben" -> "DSGVO" (kurze wie "ST-Senkungen" überlässt man dem LLM)
  const parts = tok.split("-");
  if (parts.length > 1 && isAcronym(parts[0]) && parts[0].length >= 3) return parts[0];

  if (isAcronym(tok)) return tok;
  // gemischte Schreibweise mit Großbuchstaben im Wortinneren: eGFR, OAuth, mRNA, pH
  if (/^[a-zäöü]{1,3}[A-ZÄÖÜ]{2,}/.test(tok)) return tok;
  if (tok.length <= 8 && (/^[A-Z]{2,}[a-z]+\d*$/.test(tok) || /^[A-Z][a-z]{1,3}[A-Z][A-Za-z]*$/.test(tok))) return tok;
  // lange Wörter (deutsche Fachkomposita, Fremdwörter) als Hinweis für das LLM
  if (tok.length >= 14 && /^[A-Za-zÄÖÜäöüß-]+$/.test(tok)) return tok;
  return null;
}

function isAcronym(tok) {
  if (STOP.has(tok.toUpperCase().replace(/[./&-]/g, ""))) return false;
  if (!/^[A-ZÄÖÜ0-9][A-ZÄÖÜ0-9&/.\-]{1,11}[a-z]?$/.test(tok)) return false; // "PCIs", "APIs" erlaubt
  if (upperCount(tok) < 2) return false;
  if (/^\d+$/.test(tok)) return false;
  return true;
}

export function findCandidates(words) {
  const out = [];
  for (const w of words) {
    const c = candidateOf(w.w);
    if (c) out.push({ term: /^[A-Z0-9]{2,}s$/.test(c) ? c.slice(0, -1) : c, t: w.t }); // "APIs" -> "API"
  }
  return out;
}

// Glossar-Datei: "BEGRIFF: Definition" oder "BEGRIFF = Definition", eine pro Zeile; # = Kommentar.
export function parseGlossary(text) {
  const map = {};
  for (const line of (text || "").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+)$/);
    if (m) map[normTerm(m[1])] = { term: m[1].trim(), definition: m[2].trim() };
  }
  return map;
}

// Begriffsliste, ein Begriff pro Zeile (auch Komma/Semikolon); "#" leitet einen Kommentar ein.
export function parseTermList(text) {
  const set = new Set();
  for (const line of (text || "").split(/\r?\n/)) {
    for (const part of line.replace(/#.*/, "").split(/[,;]/)) if (part.trim()) set.add(normTerm(part));
  }
  return set;
}

// Which characters of the long form make up the abbreviation? Returns a Set of character indices or null.
// Tries capitalised word starts first (skips "and", "of" …), then any word starts, each plus following
// capitals ("ST" in "Non-ST-Elevation"), then any subsequence ("Elektrokardiogramm" for EKG).
export function markInitials(term, expansion) {
  const letters = [...(term || "").replace(/[^\p{L}\p{N}]/gu, "").toUpperCase()];
  if (letters.length < 2 || !expansion) return null;
  for (const capsOnly of [true, false]) {
    const marks = new Set();
    let i = 0;
    for (const m of expansion.matchAll(/[\p{L}\p{N}]+/gu)) {
      if (i >= letters.length) break;
      const w = m[0];
      if (w[0].toUpperCase() !== letters[i] || (capsOnly && !/[\p{Lu}\p{N}]/u.test(w[0]))) continue;
      marks.add(m.index);
      i++;
      for (let k = 1; k < w.length && i < letters.length && /[\p{Lu}\p{N}]/u.test(w[k]) && w[k].toUpperCase() === letters[i]; k++) {
        marks.add(m.index + k);
        i++;
      }
    }
    if (i === letters.length) return marks;
  }
  const marks = new Set();
  let i = 0;
  for (let k = 0; k < expansion.length && i < letters.length; k++) {
    if (expansion[k].toUpperCase() === letters[i]) {
      marks.add(k);
      i++;
    }
  }
  return i === letters.length ? marks : null;
}
