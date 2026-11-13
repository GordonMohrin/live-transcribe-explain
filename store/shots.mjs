// Store-Bilder aus der echten Oberfläche: Overlay, Popup und Optionen aus dist/ laufen mit einem
// nachgebauten chrome.*-Objekt in Beispielszenen; headless Chrome fotografiert sie.
// Aufruf: npm run shots (vorher npm run build). Ergebnis: store/*.png
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(".");
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && existsSync(p));

// chrome.* für Seiten außerhalb der Erweiterung. Speicherwerte kommen als JSON im Hash; set() meldet
// Änderungen wie Chrome an onChanged (das Overlay übernimmt Einstellungen sofort).
const STUB = `
const DATA = JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}"));
const CHANGED = [];
window.chrome = {
  storage: {
    local: {
      get: async () => DATA,
      set: async (o) => {
        const c = {};
        for (const k in o) { c[k] = { oldValue: DATA[k], newValue: o[k] }; DATA[k] = o[k]; }
        CHANGED.forEach((f) => f(c, "local"));
      },
      remove: async () => {},
    },
    onChanged: { addListener: (f) => CHANGED.push(f) },
  },
  runtime: { sendMessage: async () => ({ running: false }), onMessage: { addListener: (f) => (window.__send = f) } },
  tabs: { query: async () => [{ id: 1 }] },
};`;

const card = (term, expansion, definition, source = "ai", s = 1.3) =>
  ({ type: "card", card: { term, expansion, definition, source, spokenAt: 1000, shownAt: 1000 + s * 1000 } });

const SCENES = {
  // 1: englischer Fachvortrag im Video-Player
  lecture: {
    lang: "en",
    body: `
      <div class="player">
        <div class="slide">
          <div class="kicker">Cardiology Grand Rounds</div>
          <h1>Managing NSTEMI in patients<br>with reduced kidney function</h1>
          <ul><li>Early invasive strategy vs. conservative</li><li>Contrast load and eGFR thresholds</li><li>Timing of PCI after troponin rise</li></ul>
        </div>
        <div class="bar"><span class="play">▶</span><div class="track"><div class="done"></div></div><span>18:42 / 51:07</span></div>
      </div>
      <div class="below"><b>Managing NSTEMI with reduced kidney function – Grand Rounds</b><br><span>University Heart Center · 12K views</span></div>`,
    msgs: [
      { type: "status", text: "Browser speech recognition running (en-US)" },
      card("NSTEMI", "Non-ST-Elevation Myocardial Infarction", "Heart attack without ST elevation on the ECG, usually from a partly blocked coronary artery.", "ai", 1.4),
      card("eGFR", "estimated Glomerular Filtration Rate", "Estimate of how much blood the kidneys filter per minute; the main measure of kidney function.", "ai", 1.1),
      card("PCI", "Percutaneous Coronary Intervention", "Opening a narrowed coronary artery with a balloon and stent through a catheter.", "cache", 0.3),
      card("Troponin", "", "Heart muscle protein released into the blood when heart cells are damaged.", "ai", 1.6),
      { type: "partial", text: "so if the eGFR is below thirty we usually delay the PCI and" },
    ],
  },
  // 2: deutsches IT-Meeting
  meeting: {
    lang: "de",
    body: `
      <div class="meet">
        ${["Anna K.", "Jonas", "Dr. Weber", "Lea M.", "Tim", "Du"].map((n, i) => `<div class="tile t${i}"><div class="av">${n[0]}</div><span>${n}</span></div>`).join("")}
        <div class="meetbar"><span>10:32 · Architektur-Review Login</span><span class="btns">🎙 📷 🖥 <b>⏏</b></span></div>
      </div>`,
    msgs: [
      { type: "status", text: "Browser-Spracherkennung läuft (de-DE)" },
      card("DSGVO", "Datenschutz-Grundverordnung", "EU-Verordnung, die regelt, wie personenbezogene Daten verarbeitet werden dürfen.", "glossar", 0.1),
      card("OAuth", "Open Authorization", "Standard, mit dem eine App Zugriff auf ein Konto bekommt, ohne das Passwort zu sehen.", "ai", 1.2),
      card("SLA", "Service Level Agreement", "Vertraglich zugesicherte Verfügbarkeit und Reaktionszeit eines Dienstes.", "ai", 0.9),
      card("Idempotenz", "", "Eine Anfrage hat denselben Effekt, egal ob sie einmal oder mehrfach ausgeführt wird.", "ai", 1.5),
      { type: "partial", text: "der Token-Endpunkt muss idempotent sein, sonst bekommen wir beim Retry" },
    ],
  },
  // 4: Video ohne Untertitel, nur der Untertitel-Modus (ohne KI)
  subtitles: {
    lang: "en",
    data: { display: "subtitles", subtitleWords: "15", subtitleSize: 3, subtitlePos: { left: 0.07, top: 0.6, width: 0.58 } },
    body: `
      <div class="player">
        <div class="reef"><div class="sun"></div><div class="hill h1"></div><div class="hill h2"></div><div class="sea"></div></div>
        <div class="bar"><span class="play">❚❚</span><div class="track"><div class="done" style="width:22%"></div></div><span>07:15 / 32:40</span><span class="cc">CC</span></div>
      </div>
      <div class="below"><b>How coral reefs recover – field notes from the outer reef</b><br><span>Ocean Lab · 48K views · no captions available</span></div>`,
    msgs: [
      { type: "status", text: "Browser speech recognition running (en-US)" },
      { type: "words", words: "and what surprised us most was the speed. So the reason the reef recovers this quickly is that the larvae drift in from neighbouring reefs".split(" ") },
      { type: "partial", text: "and settle within a few weeks" },
    ],
  },
};

const SCENE_CSS = `
  * { box-sizing: border-box; } body { margin: 0; width: 1280px; height: 800px; overflow: hidden; font-family: system-ui, "Segoe UI", sans-serif; background: #0f0f0f; color: #f1f1f1; }
  .player { margin: 24px 0 0 24px; width: 860px; height: 620px; background: #000; position: relative; border-radius: 12px; overflow: hidden; }
  .slide { position: absolute; inset: 0 0 44px; background: linear-gradient(135deg, #f7f9fc, #e3ebf6); color: #10233f; padding: 80px 64px; }
  .slide .kicker { color: #b4232c; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 15px; }
  .slide h1 { font-size: 42px; line-height: 1.2; margin: 16px 0 34px; } .slide li { font-size: 25px; margin: 14px 0; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 44px; display: flex; align-items: center; gap: 14px; padding: 0 16px; background: #000c; font-size: 14px; }
  .track { flex: 1; height: 4px; background: #555; border-radius: 2px; } .done { width: 37%; height: 100%; background: #f00; }
  .below { margin: 16px 24px; width: 860px; font-size: 18px; line-height: 1.6; } .below span { color: #aaa; font-size: 14px; }
  .meet { position: absolute; inset: 0; background: #202124; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: 1fr 1fr; gap: 10px; padding: 16px 16px 80px; }
  .tile { border-radius: 10px; position: relative; display: flex; align-items: center; justify-content: center; }
  .tile span { position: absolute; left: 12px; bottom: 10px; font-size: 14px; } .av { width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; font-size: 36px; font-weight: 600; color: #fff; }
  .t0 { background: #3c4043; } .t0 .av { background: #8e44ad; } .t1 { background: #35363a; outline: 3px solid #8ab4f8; } .t1 .av { background: #16a085; }
  .t2 { background: #3c4043; } .t2 .av { background: #d35400; } .t3 { background: #35363a; } .t3 .av { background: #2980b9; }
  .t4 { background: #3c4043; } .t4 .av { background: #c0392b; } .t5 { background: #35363a; } .t5 .av { background: #7f8c8d; }
  .meetbar { position: absolute; left: 0; right: 0; bottom: 0; height: 72px; display: flex; justify-content: space-between; align-items: center; padding: 0 24px; font-size: 15px; }
  .meetbar b { background: #ea4335; padding: 6px 14px; border-radius: 20px; }
  .reef { position: absolute; inset: 0 0 44px; background: linear-gradient(#f6b26b, #f9d9a8 45%, #8fd3e8 46%, #1c6e8c); overflow: hidden; }
  .sun { position: absolute; left: 560px; top: 120px; width: 120px; height: 120px; border-radius: 50%; background: #fff3c4; box-shadow: 0 0 80px #ffe08a; }
  .hill { position: absolute; bottom: 52%; background: #6b5b4b; } .h1 { left: -40px; width: 420px; height: 140px; clip-path: polygon(0 100%, 45% 0, 100% 100%); }
  .h2 { left: 260px; width: 380px; height: 90px; background: #7d6a57; clip-path: polygon(0 100%, 55% 0, 100% 100%); }
  .sea { position: absolute; left: 0; right: 0; bottom: 0; height: 54%; background: repeating-linear-gradient(170deg, #ffffff14 0 2px, transparent 2px 26px); }
  .cc { border: 1px solid #fff8; padding: 0 5px; border-radius: 3px; font-size: 12px; text-decoration: line-through; opacity: .7; }`;

function scenePage(name) {
  const s = SCENES[name];
  return `<!doctype html><meta charset="utf-8"><style>${SCENE_CSS}</style>${s.body}
    <script>${STUB}</script><script type="module" src="/dist/overlay.js"></script>
    <script type="module">
      const msgs = ${JSON.stringify([{ type: "reset", lang: s.lang }, ...SCENES[name].msgs])};
      for (const m of msgs) window.__send({ to: "overlay", ...m });
    </script>`;
}

// 3: Popup und Optionen nebeneinander, beide echt aus dist/
const SETUP_DATA = {
  lang: "en", provider: "claude", claudeKey: "sk-ant-api03-xxxxxxxxxxxxxxxx", claudeModel: "claude-haiku-5-5", lastMic: true,
  asr: "browser", browserAsrLang: "en-US", detail: "normal",
  context: "I work in hospital IT. Meetings are about cardiology systems and data protection.",
  neverExplain: "API\nKPI", termCache_en: Object.fromEntries([...Array(37)].map((_, i) => [i, {}])),
};
const hash = (d) => "#" + encodeURIComponent(JSON.stringify(d));
const setupPage = () => `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; width: 1280px; height: 800px; overflow: hidden; background: linear-gradient(135deg, #1f6feb, #6e40c9); font-family: system-ui, "Segoe UI", sans-serif; display: flex; gap: 40px; padding: 48px; box-sizing: border-box; }
  .col { display: flex; flex-direction: column; gap: 18px; color: #fff; }
  h2 { margin: 0; font-size: 30px; line-height: 1.25; } p { margin: 0; font-size: 17px; line-height: 1.5; opacity: .92; max-width: 320px; }
  iframe { border: 0; background: #fff; border-radius: 12px; box-shadow: 0 16px 48px #0006; }
</style>
<div class="col"><h2>Bring your own key.<br>Claude or OpenAI.</h2><p>Speech is recognised on your device by Chrome. Only short text excerpts go to the AI you chose.</p>
  <iframe src="/stub/popup.html${hash(SETUP_DATA)}" width="330" height="480"></iframe></div>
<iframe src="/stub/options.html${hash(SETUP_DATA)}" width="780" height="704"></iframe>`;

const tilePage = () => `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; width: 440px; height: 280px; overflow: hidden; background: linear-gradient(135deg, #1f6feb, #6e40c9); color: #fff;
    font-family: system-ui, "Segoe UI", sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 14px; text-align: center; }
  img { width: 96px; height: 96px; filter: drop-shadow(0 6px 16px #0005); } b { font-size: 26px; } span { font-size: 15px; opacity: .9; }
</style><img src="/icons/128.png"><b>Live Transcribe &amp; Explain</b><span>Acronyms explained while you listen</span>`;

const TYPES = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".json": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let body, type = "text/html";
  if (url.pathname.startsWith("/scene/")) body = scenePage(url.pathname.slice(7));
  else if (url.pathname === "/setup") body = setupPage();
  else if (url.pathname === "/tile") body = tilePage();
  else if (url.pathname.startsWith("/stub/")) {
    body = readFileSync(join(ROOT, "dist", url.pathname.slice(6)), "utf8")
      .replace("<meta charset=\"utf-8\">", `<meta charset="utf-8"><base href="/dist/"><script>${STUB}</script>`);
  } else {
    const p = join(ROOT, url.pathname);
    if (!p.startsWith(ROOT) || !existsSync(p)) { res.writeHead(404).end(); return; }
    body = readFileSync(p);
    type = TYPES[extname(p)] || "application/octet-stream";
  }
  res.writeHead(200, { "Content-Type": type }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const shots = [
  ["store/screenshot-1-lecture.png", "/scene/lecture", 1280, 800],
  ["store/screenshot-2-meeting.png", "/scene/meeting", 1280, 800],
  ["store/screenshot-3-setup.png", "/setup", 1280, 800],
  ["store/screenshot-4-subtitles.png", "/scene/subtitles" + hash(SCENES.subtitles.data), 1280, 800],
  ["store/tile-440x280.png", "/tile", 440, 280],
];
for (const [out, path, w, h] of shots) {
  // asynchron, damit der Server oben weiter antworten kann
  await promisify(execFile)(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--force-prefers-reduced-motion",
    `--window-size=${w},${h}`, "--virtual-time-budget=4000", `--screenshot=${resolve(out)}`, base + path]);
  console.log(out);
}
server.close();
