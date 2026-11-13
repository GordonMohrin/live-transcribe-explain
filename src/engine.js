// Kern der Begriffserkennung, unabhängig von Chrome (läuft auch im Node-Testlauf).
// Nimmt bestätigte Wörter {w, t} entgegen, schlägt Glossar/Cache nach, ruft gebündelt das LLM auf
// und meldet Karten {term, expansion, definition, source, spokenAt, shownAt} über onCard.
import { findCandidates, normTerm, parseGlossary, parseTermList } from "./terms.js";

const CONTEXT_WORDS = 40; // so viele ältere Wörter gehen als Kontext mit
const MAX_FRESH = 40; // höchstens so viele neue Wörter pro LLM-Aufruf
const IDLE_FLUSH_WORDS = 6; // ohne Kandidat nach so vielen Wörtern trotzdem fragen (seltene Wörter) …
const IDLE_FLUSH_MS = 700; // … oder spätestens, wenn das älteste ungefragte Wort so lange wartet
const MIN_GAP_MS = 250; // Mindestabstand zwischen LLM-Aufrufen
const MAX_INFLIGHT = 3; // parallele LLM-Aufrufe, damit neue Wörter nicht auf alte Antworten warten

export class Engine {
  constructor({ explain, cache = {}, glossaryText = "", neverText = "", onCard, onCacheUpdate, onError, useLlm = true }) {
    this.explain = explain; // async ({context, fresh, candidates, known, glossaryText}) => {terms}
    this.cache = cache; // norm -> {term, expansion, definition}
    this.glossaryText = glossaryText;
    this.glossary = parseGlossary(glossaryText);
    this.never = parseTermList(neverText); // Begriffe, die der Nutzer nie erklärt haben will
    this.onCard = onCard;
    this.onCacheUpdate = onCacheUpdate || (() => {});
    this.onError = onError || console.error;
    this.useLlm = useLlm;
    this.words = []; // alle Wörter dieser Sitzung (nur im Speicher)
    this.sentIdx = 0; // ab hier noch nicht ans LLM geschickt
    this.shown = new Map(); // norm -> Karte
    this.pendingCands = [];
    this.inflight = 0;
    this.lastCall = 0;
    this.timer = null;
    this.stats = { llmCalls: 0, llmMs: [], firstTermMs: [], latencies: [], inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
  }

  addWords(incoming) {
    // Die Erkennung liefert "DSGVO" + "-Vorgaben" als zwei Wörter (auch über Nachrichten hinweg): zusammenführen.
    const words = [];
    for (const w of incoming) {
      const prev = words.at(-1) || (words.length === 0 && this.words.length > this.sentIdx ? this.words.at(-1) : null);
      if (w.w.startsWith("-") && prev) prev.w += w.w;
      else words.push({ ...w });
    }
    if (!words.length) return;
    if (this.sentIdx === this.words.length) this.pendingSince = Date.now();
    this.words.push(...words);
    for (const c of findCandidates(words)) {
      const key = normTerm(c.term);
      if (this.shown.has(key) || this.never.has(key)) continue;
      const hit = this.glossary[key] || this.cache[key];
      if (hit) this.show({ ...hit, expansion: hit.expansion || "" }, hit === this.glossary[key] ? "glossar" : "cache", c.t);
      else this.pendingCands.push(c.term);
    }
    this.schedule();
  }

  schedule() {
    if (!this.useLlm || this.inflight >= MAX_INFLIGHT) return;
    const fresh = this.words.length - this.sentIdx;
    if (!fresh) return;
    let wait = Math.max(0, this.lastCall + MIN_GAP_MS - Date.now());
    if (!this.pendingCands.length && fresh < IDLE_FLUSH_WORDS) wait = Math.max(wait, this.pendingSince + IDLE_FLUSH_MS - Date.now());
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.callLlm(), wait);
  }

  // KI während der Sitzung ein- oder ausschalten (Anzeige-Modus). Beim Einschalten erst ab jetzt fragen,
  // die älteren Wörter gehen nur als Kontext mit.
  setLlm(on) {
    if (on && !this.useLlm) {
      this.sentIdx = this.words.length;
      this.pendingCands = [];
    }
    this.useLlm = on;
  }

  // Am Ende einer Sitzung den Rest noch prüfen lassen.
  flush() {
    if (this.words.length > this.sentIdx && this.useLlm) this.callLlm();
  }

  async callLlm() {
    if (this.inflight >= MAX_INFLIGHT) return;
    const end = Math.min(this.words.length, this.sentIdx + MAX_FRESH);
    const freshWords = this.words.slice(this.sentIdx, end);
    if (!freshWords.length) return;
    const context = this.words.slice(Math.max(0, this.sentIdx - CONTEXT_WORDS), this.sentIdx).map((w) => w.w).join(" ");
    const candidates = [...new Set(this.pendingCands)];
    this.sentIdx = end;
    this.pendingSince = Date.now();
    this.pendingCands = [];
    this.inflight++;
    this.lastCall = Date.now();
    const t0 = performance.now();
    try {
      let gotFirst = false;
      const take = (t) => {
        if (!t.term || !t.definition) return;
        const key = normTerm(t.term);
        if (this.shown.has(key) || this.never.has(key)) return;
        this.cache[key] = { term: t.term, expansion: t.expansion || "", definition: t.definition };
        this.onCacheUpdate(key, this.cache[key]);
        this.show(this.cache[key], "ai", spokenAt(freshWords, t.term));
      };
      const { terms, usage } = await this.explain({
        context,
        fresh: freshWords.map((w) => w.w).join(" "),
        candidates,
        known: [...this.shown.values()].map((c) => c.term),
        glossaryText: this.glossaryText,
        onTerm: (t) => {
          if (!gotFirst) { gotFirst = true; this.stats.firstTermMs.push(performance.now() - t0); }
          take(t);
        }, // Karten schon während des Streamings zeigen
      });
      this.stats.llmCalls++;
      this.stats.llmMs.push(performance.now() - t0);
      if (usage) {
        this.stats.inputTokens += usage.input_tokens || 0;
        this.stats.cachedTokens += usage.cache_read_input_tokens || 0;
        this.stats.outputTokens += usage.output_tokens || 0;
      }
      terms.forEach(take);
    } catch (e) {
      this.onError(e);
    } finally {
      this.inflight--;
      this.schedule();
    }
  }

  show(entry, source, spokenAtMs) {
    const key = normTerm(entry.term);
    if (this.shown.has(key)) return;
    const card = { ...entry, source, spokenAt: spokenAtMs, shownAt: Date.now() };
    this.shown.set(key, card);
    if (spokenAtMs) this.stats.latencies.push(card.shownAt - spokenAtMs);
    this.onCard(card);
  }

  summary() {
    const lat = [...this.stats.latencies].sort((a, b) => a - b);
    const llm = [...this.stats.llmMs].sort((a, b) => a - b);
    const med = (a) => (a.length ? Math.round(a[Math.floor(a.length / 2)]) : null);
    const mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
    return {
      words: this.words.length,
      cards: this.shown.size,
      latencyMedianMs: med(lat),
      latencyMeanMs: mean(lat),
      latencyMaxMs: lat.length ? Math.round(lat.at(-1)) : null,
      llmCalls: this.stats.llmCalls,
      llmMedianMs: med(llm),
      llmFirstTermMedianMs: med([...this.stats.firstTermMs].sort((a, b) => a - b)),
      inputTokens: this.stats.inputTokens,
      cachedTokens: this.stats.cachedTokens,
      outputTokens: this.stats.outputTokens,
    };
  }
}

// Zeitpunkt, zu dem der Begriff gesprochen wurde: passendes Wort, sonst (z. B. bei verhörten
// Akronymen) das erste neue Wort – dann ist die gemessene Latenz eher zu hoch als zu niedrig.
function spokenAt(words, term) {
  const key = normTerm(term).replace(/[^a-z0-9äöüß]/g, "");
  for (const w of words) {
    const n = normTerm(w.w).replace(/[^a-z0-9äöüß]/g, "");
    if (n && (n === key || n.startsWith(key) || (key.startsWith(n) && n.length >= 3))) return w.t;
  }
  return words[0]?.t;
}
