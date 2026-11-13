// Auswahl-Einstellungen: jede steht hier an genau einer Stelle (Texte en/de, Werte, Standard).
// Popup und Options-Seite bauen ihre Dropdowns daraus, der Rest liest die Werte über loadSwitches().
//
// Felder: key (Name in chrome.storage.local), where ("popup"/"options"), default, label, hint (optional),
// choices [{value, en, de}], showIf {andererKey: wert oder [werte]} (nur sichtbar, wenn der andere Schalter so steht).

export const SWITCHES = [
  {
    key: "display",
    where: ["popup", "options"],
    default: "explain",
    label: { en: "Show", de: "Anzeigen" },
    choices: [
      { value: "explain", en: "Explanations of terms", de: "Erklärungen der Begriffe" },
      { value: "subtitles", en: "Subtitles only (no AI, free)", de: "Nur Untertitel (ohne KI, kostenlos)" },
      { value: "both", en: "Subtitles and explanations", de: "Untertitel und Erklärungen" },
    ],
  },
  {
    key: "subtitleWords",
    where: ["popup", "options"],
    showIf: { display: ["subtitles", "both"] },
    default: "15",
    label: { en: "Subtitle length", de: "Untertitel-Länge" },
    hint: {
      en: "Drag the subtitles anywhere, also over the video. Size and length can be changed on the subtitles too.",
      de: "Die Untertitel lassen sich überallhin ziehen, auch übers Video. Größe und Länge gehen auch direkt an den Untertiteln.",
    },
    choices: [
      { value: "8", en: "8 words – one short line", de: "8 Wörter – eine kurze Zeile" },
      { value: "15", en: "15 words – about one sentence", de: "15 Wörter – etwa ein Satz" },
      { value: "25", en: "25 words", de: "25 Wörter" },
      { value: "40", en: "40 words – two to three sentences", de: "40 Wörter – zwei bis drei Sätze" },
      { value: "60", en: "60 words", de: "60 Wörter" },
    ],
  },
  {
    key: "asr",
    where: ["popup", "options"],
    default: "browser",
    label: { en: "Listen to", de: "Zuhören über" },
    choices: [
      { value: "browser", en: "Tab audio (Chrome speech recognition)", de: "Tab-Audio (Spracherkennung von Chrome)" },
      { value: "captions", en: "The page's captions (YouTube, Meet, Teams, Zoom)", de: "Untertitel der Seite (YouTube, Meet, Teams, Zoom)" },
    ],
  },
  {
    key: "browserAsrLang",
    where: ["popup", "options"],
    showIf: { asr: "browser" },
    default: "en-US",
    label: { en: "Spoken language", de: "Gesprochene Sprache" },
    hint: {
      en: "Chrome recognises one language at a time, on this device. The speech pack is downloaded once.",
      de: "Chrome erkennt immer eine Sprache, auf diesem Gerät. Das Sprachpaket wird einmalig geladen.",
    },
    choices: [
      { value: "en-US", en: "English (US)", de: "Englisch (US)" },
      { value: "en-GB", en: "English (UK)", de: "Englisch (UK)" },
      { value: "de-DE", en: "German", de: "Deutsch" },
    ],
  },
  {
    key: "detail",
    where: ["options"],
    default: "normal",
    label: { en: "How much to explain", de: "Wie viel erklären" },
    choices: [
      { value: "few", en: "Few – only abbreviations and real technical terms", de: "Wenig – nur Abkürzungen und echte Fachbegriffe" },
      { value: "normal", en: "Normal", de: "Normal" },
      { value: "many", en: "Many – also moderately known terms", de: "Viel – auch mittelbekannte Begriffe" },
    ],
  },
];

// Gespeicherte Werte prüfen: unbekannte oder entfernte Auswahl fällt auf den Standard zurück.
export function normalizeSwitches(stored = {}) {
  const out = {};
  for (const sw of SWITCHES) {
    const v = stored[sw.key];
    out[sw.key] = sw.choices.some((c) => c.value === v) ? v : sw.default;
  }
  return out;
}

// Erfüllt values die showIf-Bedingung von sw? (Wert oder Liste erlaubter Werte)
export const shown = (sw, values) =>
  !sw.showIf || Object.entries(sw.showIf).every(([k, v]) => [v].flat().includes(values[k]));

export async function loadSwitches() {
  return normalizeSwitches(await chrome.storage.local.get(SWITCHES.map((sw) => sw.key)));
}

// Baut die Dropdowns für "popup" oder "options" in root. Jede Änderung wird sofort gespeichert.
export function renderSwitches(root, lang, values, where, onChange) {
  root.replaceChildren();
  const rows = [];
  const update = () => {
    for (const [sw, row] of rows) row.hidden = !shown(sw, values);
  };
  for (const sw of SWITCHES.filter((s) => s.where.includes(where))) {
    const row = document.createElement("div");
    row.className = "switch";
    const label = document.createElement("label");
    label.htmlFor = `sw_${sw.key}`;
    label.textContent = sw.label[lang] ?? sw.label.en;
    const sel = document.createElement("select");
    sel.id = label.htmlFor;
    for (const c of sw.choices) sel.append(new Option(c[lang] ?? c.en, c.value));
    sel.value = values[sw.key];
    sel.onchange = async () => {
      values[sw.key] = sel.value;
      await chrome.storage.local.set({ [sw.key]: sel.value });
      update();
      onChange?.(sw.key, sel.value);
    };
    row.append(label, sel);
    if (sw.hint) {
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.textContent = sw.hint[lang] ?? sw.hint.en;
      row.append(hint);
    }
    root.append(row);
    rows.push([sw, row]);
  }
  update();
}
