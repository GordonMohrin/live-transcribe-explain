// Service Worker: startet/stoppt die Sitzung, hält die Engine und verteilt Karten an das Overlay.
import { Engine } from "./engine.js";
import { explainTerms, checkKey, cleanKey, providerOf } from "./llm.js";
import { t, getLang } from "./i18n.js";
import { loadSwitches } from "./switches.js";

let session = null; // { tabId, mode, mic, engine, lang, display, hasKey, status }

// Felder der Options-Seite plus alle Auswahl-Einstellungen aus switches.js (asr, detail, …).
// Key und Modell gelten für den gewählten Anbieter (provider: "claude" | "openai").
async function settings() {
  const s = await chrome.storage.local.get(["provider", "claudeKey", "claudeModel", "openaiKey", "openaiModel",
    "glossary", "context", "neverExplain", "extraRules"]);
  const provider = providerOf(s.provider);
  return { ...s, provider, apiKey: cleanKey(s[provider + "Key"]), model: s[provider + "Model"], ...(await loadSwitches()), lang: await getLang() };
}

// one cache per language, so German definitions never show up in the English view
const cacheKey = (lang) => `termCache_${lang}`;

async function loadCache(lang) {
  return (await chrome.storage.local.get(cacheKey(lang)))[cacheKey(lang)] || {};
}

let cacheSaveTimer = null;
function saveCacheSoon(lang, cache) {
  clearTimeout(cacheSaveTimer);
  cacheSaveTimer = setTimeout(() => chrome.storage.local.set({ [cacheKey(lang)]: cache }), 1000);
}

function toOverlay(msg) {
  if (session) chrome.tabs.sendMessage(session.tabId, { to: "overlay", ...msg }).catch(() => {});
}

function setStatus(text, level = "info") {
  if (!session) return;
  session.status = text;
  toOverlay({ type: "status", text, level });
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["USER_MEDIA"],
    justification: "Tab-Audio für die Live-Transkription aufnehmen (nur im Speicher)",
  });
}

// display "subtitles": nur Untertitel, die KI wird nicht gefragt (kostet nichts)
const useLlm = (display, hasKey) => hasKey && display !== "subtitles";

async function start({ tabId, mic }) {
  if (session) await stop();
  const s = await settings();
  const { lang } = s;
  const mode = s.asr; // "browser" | "captions"
  const hasKey = !!s.apiKey;
  const engine = new Engine({
    cache: await loadCache(lang),
    glossaryText: s.glossary || "",
    neverText: s.neverExplain || "",
    useLlm: useLlm(s.display, hasKey),
    // Sprache aus der Sitzung, nicht von hier: ein Wechsel in den Optionen gilt sofort für neue Erklärungen
    explain: (args) => explainTerms({
      ...args, provider: s.provider, apiKey: s.apiKey, model: s.model, lang: session.lang, userContext: s.context,
      detail: s.detail, neverExplain: s.neverExplain, extraRules: s.extraRules,
    }),
    onCard: (card) => toOverlay({ type: "card", card }),
    onCacheUpdate: () => saveCacheSoon(session.lang, engine.cache),
    onError: (e) => setStatus(t(session.lang, "aiError", { msg: e.message || e }), "error"),
  });
  session = { tabId, mode, mic, engine, lang, display: s.display, hasKey, status: "", startedAt: Date.now() };

  await chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] });
  toOverlay({ type: "reset", lang });
  if (!hasKey && s.display !== "subtitles") setStatus(t(lang, "noKey"), "warn");

  if (mode === "captions") {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["captions.js"] });
    setStatus(t(lang, "readingCaptions"));
  } else {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    await ensureOffscreen();
    setStatus(t(lang, "startingBrowserAsr")); // vorher, sonst überschreibt es Meldungen des Offscreen-Dokuments
    await chrome.runtime.sendMessage({ to: "offscreen", cmd: "start", streamId, mic, lang, browserAsrLang: s.browserAsrLang });
  }
}

async function stop() {
  if (!session) return null;
  const { engine, tabId, mode } = session;
  engine.flush();
  if (mode === "captions") chrome.tabs.sendMessage(tabId, { to: "captions", cmd: "stop" }).catch(() => {});
  else if (await chrome.offscreen.hasDocument()) {
    await chrome.runtime.sendMessage({ to: "offscreen", cmd: "stop" }).catch(() => {});
    await chrome.offscreen.closeDocument().catch(() => {});
  }
  const summary = engine.summary();
  console.log("Sitzung beendet", summary);
  toOverlay({ type: "stopped", summary });
  session = null; // Transkript wird verworfen
  return summary;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.to !== "background") return;
  (async () => {
    switch (msg.cmd) {
      case "start":
        await start(msg);
        return { ok: true };
      case "stop":
        return { ok: true, summary: await stop() };
      case "status":
        return session
          ? { running: true, mode: session.mode, tabId: session.tabId, status: session.status, summary: session.engine.summary() }
          : { running: false };
      case "words": // vom Offscreen-Dokument (Spracherkennung) oder vom Untertitel-Leser
        session?.engine.addWords(msg.words);
        if (session && session.display !== "explain") toOverlay({ type: "words", words: msg.words.map((w) => w.w) });
        return {};
      case "partial":
        toOverlay({ type: "partial", text: msg.text });
        return {};
      case "asrStatus":
        setStatus(msg.text, msg.level);
        return {};
      case "checkKey":
        try {
          await checkKey(msg.provider, msg.apiKey, msg.model);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.status === 401 ? t(await getLang(), "keyInvalid") : e.message || String(e) };
        }
      case "clearCache":
        await chrome.storage.local.remove(["termCache", cacheKey("en"), cacheKey("de")]);
        if (session) session.engine.cache = {};
        return { ok: true };
    }
    return {};
  })()
    .then(reply)
    .catch((e) => reply({ ok: false, error: e.message || String(e) }));
  return true;
});

// Tab geschlossen -> Sitzung beenden. Neu geladen: Untertitel-Modus endet, im Audio-Modus Overlay neu einsetzen.
chrome.tabs.onRemoved.addListener((tabId) => session?.tabId === tabId && stop());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (session?.tabId !== tabId) return;
  if (info.status === "loading" && session.mode === "captions") stop();
  else if (info.status === "complete" && session.mode !== "captions") {
    chrome.scripting.executeScript({ target: { tabId }, files: ["overlay.js"] })
      .then(() => { toOverlay({ type: "reset", lang: session.lang }); setStatus(session.status); }).catch(() => {});
  }
});

// Einstellungen, die in einer laufenden Sitzung sofort wirken. Das Overlay hört selbst auf lang, display und
// die Untertitel-Einstellungen; hier geht es um KI, Cache und Spracherkennung.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !session) return;
  const sess = session;
  if (changes.lang) {
    sess.lang = changes.lang.newValue === "de" ? "de" : "en";
    sess.engine.cache = await loadCache(sess.lang); // neue Erklärungen in der neuen Sprache
    if (sess.mode === "browser") chrome.runtime.sendMessage({ to: "offscreen", cmd: "lang", lang: sess.lang }).catch(() => {});
  }
  if (changes.display) {
    sess.display = (await loadSwitches()).display;
    sess.engine.setLlm(useLlm(sess.display, sess.hasKey));
    if (!sess.hasKey && sess.display !== "subtitles") setStatus(t(sess.lang, "noKey"), "warn");
  }
  if (changes.browserAsrLang && sess.mode === "browser") {
    const { browserAsrLang } = await loadSwitches();
    setStatus(t(sess.lang, "asrLangChanged", { lang: browserAsrLang }));
    chrome.runtime.sendMessage({ to: "offscreen", cmd: "asrLang", browserAsrLang }).catch(() => {});
  }
});
