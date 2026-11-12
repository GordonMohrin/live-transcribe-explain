import { applyI18n, getLang, LANGS, t } from "./i18n.js";
import { cleanKey } from "./llm.js";
import { loadSwitches, renderSwitches } from "./switches.js";
import { packState, installPack } from "./browser-asr.js";

const $ = (s) => document.querySelector(s);
const FIELDS = ["provider", "claudeKey", "claudeModel", "openaiKey", "openaiModel",
  "glossary", "context", "neverExplain", "extraRules"]; // weitere Dropdowns: switches.js
let lang = "en";
let sw = {};

// Sprachpaket-Knopf nur zeigen, wenn Tab-Audio erkannt wird (nicht bei Untertiteln).
const showPackRow = () => {
  $("#packRow").hidden = sw.asr !== "browser";
  $("#packMsg").textContent = "";
};

// Nur Key und Modell des gewählten Anbieters zeigen.
const showProvider = () => {
  for (const el of document.querySelectorAll("[data-provider]")) el.hidden = el.dataset.provider !== $("#provider").value;
};
$("#provider").onchange = showProvider;

for (const [code, name] of Object.entries(LANGS)) $("#lang").append(new Option(name, code));

async function load() {
  lang = await getLang();
  applyI18n(lang);
  document.title = t(lang, "optTitle");
  $("#lang").value = lang;
  const s = await chrome.storage.local.get([...FIELDS, `termCache_${lang}`]);
  for (const f of FIELDS) if (s[f]) $(`#${f}`).value = s[f];
  showProvider();
  sw = await loadSwitches();
  renderSwitches($("#switches"), lang, sw, "options", showPackRow);
  showPackRow();
  $("#cacheInfo").textContent = t(lang, "cacheCount", { n: Object.keys(s[`termCache_${lang}`] || {}).length });
}

// switching the language applies to this page right away
$("#lang").onchange = async () => {
  await chrome.storage.local.set({ lang: $("#lang").value });
  load();
};

$("#save").onclick = async () => {
  for (const k of ["#claudeKey", "#openaiKey"]) $(k).value = cleanKey($(k).value);
  const data = Object.fromEntries(FIELDS.map((f) => [f, $(`#${f}`).value.trim()]));
  await chrome.storage.local.set({ ...data, lang: $("#lang").value });
  $("#msg").textContent = t(lang, "saved");
};

$("#check").onclick = async () => {
  $("#msg").textContent = t(lang, "checking");
  const p = $("#provider").value;
  const r = await chrome.runtime.sendMessage({ to: "background", cmd: "checkKey", provider: p, apiKey: $(`#${p}Key`).value, model: $(`#${p}Model`).value });
  $("#msg").textContent = r.ok ? t(lang, "keyOk") : t(lang, "error", { msg: r.error });
};

$("#file").onchange = async (e) => {
  const f = e.target.files[0];
  if (f) $("#glossary").value = (await f.text()).trim();
};

$("#mic").onclick = async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((tr) => tr.stop());
    $("#msg").textContent = t(lang, "micOk");
  } catch (e) {
    $("#msg").textContent = t(lang, "micDeniedOpt", { msg: e.message });
  }
};

// Prüft das Sprachpaket und lädt es bei Bedarf (hier mit Klick, falls Chrome dafür eine Nutzeraktion verlangt).
$("#pack").onclick = async () => {
  const l = sw.browserAsrLang;
  try {
    let state = await packState(l);
    if (state === "downloadable") {
      $("#packMsg").textContent = t(lang, "packInstalling", { lang: l });
      state = (await installPack(l)) ? "available" : "failed";
    }
    $("#packMsg").textContent = t(lang, `pack_${state}`, { lang: l });
  } catch (e) {
    $("#packMsg").textContent = t(lang, "error", { msg: e.message || e });
  }
};

$("#clear").onclick = async () => {
  await chrome.runtime.sendMessage({ to: "background", cmd: "clearCache" });
  load();
};

load();
