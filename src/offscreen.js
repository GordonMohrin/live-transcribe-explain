// Offscreen-Dokument: nimmt Tab-Audio (und optional das Mikrofon) auf, spielt das Tab-Audio weiter ab und
// lässt Chrome es auf dem Gerät erkennen. Tab und Mikrofon bekommen je eine eigene Erkennung.
// Nichts wird gespeichert.
import { t } from "./i18n.js";
import { recognize, chromeVersion } from "./browser-asr.js";

let ctx = null;
let streams = [];
let recognizers = []; // Promises auf { stop() }
let sources = []; // [{ track, source }]: Tab und ggf. Mikrofon, damit ein Sprachwechsel ohne neue Aufnahme geht
let runId = 0;
let keepAlive = null;
let stopped = true;
let lang = "en";

const toBg = (msg) => chrome.runtime.sendMessage({ to: "background", ...msg }).catch(() => {});
const status = (key, vars, level = "info") => toBg({ cmd: "asrStatus", text: t(lang, key, vars), level });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.to !== "offscreen") return;
  if (msg.cmd === "start") start(msg).then(() => reply({ ok: true }), (e) => { status("audioError", { msg: e.message }, "error"); reply({ ok: false }); });
  else if (msg.cmd === "stop") { stop(); reply({ ok: true }); }
  else if (msg.cmd === "lang") { lang = msg.lang; reply({ ok: true }); }
  else if (msg.cmd === "asrLang") { if (!stopped) startRecognizers(msg.browserAsrLang); reply({ ok: true }); }
  return true;
});

async function start({ streamId, mic, lang: l, browserAsrLang }) {
  stop();
  lang = l || "en";
  stopped = false;
  const tab = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
  });
  streams.push(tab);
  ctx = new AudioContext();
  ctx.createMediaStreamSource(tab).connect(ctx.destination); // sonst wäre der Tab stumm
  let m = null;
  if (mic) {
    try {
      m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streams.push(m);
    } catch (e) {
      status("micDenied", {}, "warn");
    }
  }

  const v = chromeVersion();
  if (v && v < 139) status("oldChrome", { v }, "warn");
  sources = [{ track: tab.getAudioTracks()[0], source: "remote" }];
  if (m) sources.push({ track: m.getAudioTracks()[0], source: "mic" });
  startRecognizers(browserAsrLang);
  keepAlive = setInterval(() => toBg({ cmd: "ping" }), 20000); // hält den Service Worker wach
}

// Erkennung für alle Quellen (neu) starten, auch beim Wechsel der gesprochenen Sprache. Nicht abwarten:
// ein Sprachpaket-Download kann dauern, das Popup soll nicht hängen. runId bricht eine wartende Erkennung ab.
function startRecognizers(asrLang) {
  for (const r of recognizers) r.then((x) => x.stop());
  const run = ++runId;
  const opts = { lang: asrLang, cancelled: () => stopped || run !== runId };
  recognizers = sources.map(({ track, source }) => browserPipe(track, source, opts));
}

// Eine Audioquelle -> eigene Erkennung. Statusmeldungen nur für die Tab-Quelle, außer Fehlern.
function browserPipe(track, source, opts) {
  const copy = track.clone(); // eigene Kopie, das Original spielt weiter den Ton ab
  return recognize(copy, {
    ...opts,
    onWords: (words) => toBg({ cmd: "words", words }),
    onPartial: (text) => source === "remote" && toBg({ cmd: "partial", text }),
    onState: (key, vars, level) => (source === "remote" || level === "error") && status(key, vars, level),
  }).then((r) => ({ stop() { r.stop(); copy.stop(); } }));
}

function stop() {
  stopped = true;
  clearInterval(keepAlive);
  for (const r of recognizers) r.then((x) => x.stop());
  recognizers = [];
  sources = [];
  for (const s of streams) s.getTracks().forEach((tr) => tr.stop());
  streams = [];
  ctx?.close();
  ctx = null;
}
