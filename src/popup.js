import { applyI18n, getLang, t } from "./i18n.js";
import { loadSwitches, renderSwitches } from "./switches.js";
import { packState, installPack } from "./browser-asr.js";

const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage({ to: "background", ...msg });
let lang = "en";

async function refresh() {
  const st = await send({ cmd: "status" });
  const btn = $("#toggle");
  btn.textContent = t(lang, st.running ? "stop" : "start");
  btn.classList.toggle("stop", !!st.running);
  if (st.running) {
    const s = st.summary;
    $("#status").textContent = `${st.status || ""}\n${t(lang, "running", { words: s.words, cards: s.cards, lat: s.latencyMedianMs })}`;
  }
}

$("#toggle").onclick = async () => {
  const st = await send({ cmd: "status" });
  if (st.running) {
    const r = await send({ cmd: "stop" });
    $("#status").textContent = r.summary ? t(lang, "stoppedSummary", { cards: r.summary.cards, lat: r.summary.latencyMedianMs }) : "";
  } else {
    await startPackDownload();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await send({ cmd: "start", tabId: tab.id, mic: $("#mic").checked }); // Quelle kommt aus den Schaltern
    if (!r.ok) $("#status").textContent = t(lang, "error", { msg: r.error });
    await chrome.storage.local.set({ lastMic: $("#mic").checked });
  }
  refresh();
};

// Fehlendes Sprachpaket für die Browser-Erkennung anstoßen. Das geht nur hier nach dem Klick (sticky activation),
// nicht im Offscreen-Dokument; das wartet dann, bis der Download fertig ist.
async function startPackDownload() {
  const sw = await loadSwitches();
  if (sw.asr !== "browser") return;
  try {
    if ((await packState(sw.browserAsrLang)) === "downloadable") installPack(sw.browserAsrLang).catch(() => {});
  } catch {}
}

(async () => {
  lang = await getLang();
  applyI18n(lang);
  // neue gesprochene Sprache: Sprachpaket gleich hier laden (Klick = Aktivierung), die laufende Sitzung wechselt sofort
  renderSwitches($("#switches"), lang, await loadSwitches(), "popup", (key) => key === "browserAsrLang" && startPackDownload());
  const { lastMic } = await chrome.storage.local.get("lastMic");
  $("#mic").checked = !!lastMic;
  refresh();
  setInterval(refresh, 1000);
})();
