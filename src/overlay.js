// Overlay in the tab: small movable panel at the top right with term cards (newest first) and the legal note,
// plus (display = "subtitles" / "both") a subtitle box that can be dragged anywhere, also over the video.
// Injected via chrome.scripting; injecting it twice is harmless. Settings changes apply immediately.
import { t } from "./i18n.js";
import { markInitials } from "./terms.js";
import { SWITCHES, normalizeSwitches } from "./switches.js";
import { KEEP_WORDS, SIZES, lastWords, step as stepIn, clampPos } from "./subtitles.js";

(() => {
  if (window.__liveErklaerung) return;
  window.__liveErklaerung = true;
  let lang = "en";

  const CSS = `
  :host { all: initial; }
  .box { position: fixed; right: 16px; top: 16px; width: 360px; max-height: 70vh; z-index: 2147483647;
    display: flex; flex-direction: column; font: 13px/1.45 system-ui, "Segoe UI", sans-serif;
    background: rgba(255,255,255,.97); color: #1b1f24; border: 1px solid #d0d7de; border-radius: 10px;
    box-shadow: 0 6px 24px rgba(0,0,0,.18); overflow: hidden;
    --accent: #0969da; --muted: #57606a; --line: #eaeef2; --exp-bg: #f2f7ff; }
  @media (prefers-color-scheme: dark) {
    .box { background: rgba(28,31,36,.97); color: #e6e8eb; border-color: #3a4048;
      --accent: #58a6ff; --muted: #9aa4ae; --line: #3a4048; --exp-bg: #1d2a3b; }
    .legal { background: #3d3415 !important; color: #f3d77a !important; }
  }
  .head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: move; font-weight: 600; user-select: none; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #d1242f; animation: pulse 1.5s infinite; }
  .dot.off { background: #8c959f; animation: none; }
  @keyframes pulse { 50% { opacity: .3; } }
  .head button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; padding: 0 4px; }
  .head .min-btn { margin-left: auto; }
  .legal { padding: 6px 10px; font-size: 11.5px; background: #fff8c5; color: #4d3800; }
  .status { padding: 4px 10px 0; font-size: 11.5px; color: var(--muted); }
  .status.error { color: #d1242f; } .status.warn { color: #9a6700; }
  .partial { padding: 2px 10px 6px; color: var(--muted); font-style: italic; font-size: 12px; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; direction: rtl; text-align: left; min-height: 1em; }
  .list { overflow-y: auto; padding: 0 10px 8px; border-top: 1px solid var(--line); }
  .card { border-bottom: 1px solid var(--line); padding: 9px 0; }
  .card:last-child { border-bottom: 0; }
  .card.new { animation: flash 1s; }
  @keyframes flash { from { background: rgba(84,174,255,.25); } }
  @media (prefers-reduced-motion: reduce) { .card.new, .dot { animation: none; } }
  .term { font-weight: 700; font-size: 16px; letter-spacing: .02em; }
  .exp { margin: 4px 0 2px; padding: 5px 8px; border-radius: 6px; background: var(--exp-bg); font-size: 14px; line-height: 1.35; }
  .exp b { color: var(--accent); font-weight: 800; font-size: 1.12em; }
  .def { margin-top: 4px; }
  .meta { color: var(--muted); font-size: 11px; margin-top: 3px; }
  .min .list, .min .partial, .min .status, .min .legal { display: none; }
  .subsonly .list, .subsonly .partial, .both .partial { display: none; }
  .subsonly { padding-bottom: 6px; }

  .subs { position: fixed; z-index: 2147483647; box-sizing: border-box; min-width: 180px; padding: 6px 14px 8px;
    background: rgba(0,0,0,.72); color: #fff; border-radius: 8px; cursor: move; user-select: none;
    resize: horizontal; overflow: hidden; text-align: center;
    font: 600 var(--fs, 24px)/1.35 system-ui, "Segoe UI", sans-serif; text-shadow: 0 1px 2px #000; }
  .subs[hidden], .box[hidden] { display: none; }
  .subs .pending { opacity: .72; }
  .subs .waiting { opacity: .6; font-weight: 400; font-style: italic; font-size: .75em; }
  /* z-index: der halbtransparente Text (.pending) läge sonst über der Leiste und finge die Klicks ab */
  .bar { position: absolute; z-index: 1; top: 3px; right: 18px; display: flex; gap: 3px; align-items: center; opacity: 0; transition: opacity .15s;
    padding: 2px; border-radius: 6px; background: rgba(0,0,0,.7);
    font: 12px/1 system-ui, "Segoe UI", sans-serif; text-shadow: none; }
  .subs:hover .bar, .subs:focus-within .bar { opacity: 1; }
  .bar button { border: 0; border-radius: 4px; padding: 3px 7px; background: rgba(255,255,255,.18); color: #fff; cursor: pointer; font: inherit; }
  .bar button:hover { background: rgba(255,255,255,.32); }
  .bar .count { padding: 0 4px; opacity: .85; }
  .bar .gap { width: 6px; }`;

  const host = document.createElement("div");
  host.id = "live-erklaerung-overlay";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>${CSS}</style>
    <div class="box">
      <div class="head"><span class="dot"></span><span class="title"></span><button class="min-btn">–</button><button class="close">×</button></div>
      <div class="legal"></div>
      <div class="status"></div>
      <div class="partial"></div>
      <div class="list"></div>
    </div>
    <div class="subs" hidden>
      <div class="bar">
        <button data-a="smaller">A−</button><button data-a="larger">A+</button><span class="gap"></span>
        <button data-a="fewer">−</button><span class="count"></span><button data-a="more">+</button><span class="gap"></span>
        <button data-a="hide">×</button>
      </div>
      <div class="text"></div>
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (s) => root.querySelector(s);
  const box = $(".box");
  const subs = $(".subs");
  $(".close").onclick = () => (box.hidden = true); // nur das Panel, die Untertitel laufen weiter
  $(".min-btn").onclick = () => box.classList.toggle("min");

  // ---- settings (from chrome.storage, also changed live from popup/options) ----
  const WORD_STEPS = SWITCHES.find((s) => s.key === "subtitleWords").choices.map((c) => c.value);
  let display = "explain";
  let subWords = "15";
  let sizeIdx = 2;
  let pos = { left: 0.15, top: 0.76, width: 0.7 };
  let subsHidden = false;
  let finalWords = [];
  let partialText = "";

  function applyLang() {
    $(".title").textContent = t(lang, "title");
    $(".legal").textContent = t(lang, "legalOverlay");
    $(".min-btn").title = t(lang, "minimize");
    $(".close").title = t(lang, "hide");
    for (const [a, key] of [["smaller", "subsSmaller"], ["larger", "subsLarger"], ["fewer", "subsFewer"], ["more", "subsMore"], ["hide", "subsHide"]]) {
      root.querySelector(`[data-a="${a}"]`).title = t(lang, key);
    }
    renderSubs();
  }

  function applyDisplay() {
    box.classList.toggle("subsonly", display === "subtitles");
    box.classList.toggle("both", display === "both");
    subs.hidden = display === "explain" || subsHidden;
    subs.style.setProperty("--fs", `${SIZES[sizeIdx]}px`);
    $(".count").textContent = t(lang, "subsWords", { n: subWords });
    placeSubs();
    renderSubs();
  }

  function apply(s) {
    if (s.lang && s.lang !== lang) { lang = s.lang === "de" ? "de" : "en"; applyLang(); }
    const sw = normalizeSwitches({ display, subtitleWords: subWords, ...s });
    display = sw.display;
    subWords = sw.subtitleWords;
    if (Number.isInteger(s.subtitleSize)) sizeIdx = Math.min(SIZES.length - 1, Math.max(0, s.subtitleSize));
    if (s.subtitlePos?.width) pos = s.subtitlePos;
    applyDisplay();
  }

  chrome.storage.local.get(["lang", "display", "subtitleWords", "subtitleSize", "subtitlePos"]).then(apply).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const s = {};
    for (const k of ["lang", "display", "subtitleWords", "subtitleSize", "subtitlePos"]) if (k in changes) s[k] = changes[k].newValue;
    if (Object.keys(s).length) apply(s);
  });

  // ---- subtitles ----
  function renderSubs() {
    if (subs.hidden) return;
    const { done, pending } = lastWords(finalWords, partialText, Number(subWords));
    const text = $(".text");
    if (!done && !pending) {
      const w = document.createElement("span");
      w.className = "waiting";
      w.textContent = t(lang, "subsWaiting");
      text.replaceChildren(w);
      return;
    }
    const d = document.createElement("span");
    d.textContent = done;
    const p = document.createElement("span");
    p.className = "pending";
    p.textContent = (done && pending ? " " : "") + pending;
    text.replaceChildren(d, p);
  }

  function placeSubs() {
    if (subs.hidden) return;
    const r = clampPos(pos, subs.offsetHeight || 60, window.innerWidth, window.innerHeight);
    Object.assign(subs.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  }

  function savePos() {
    const r = subs.getBoundingClientRect();
    pos = { left: r.left / window.innerWidth, top: r.top / window.innerHeight, width: r.width / window.innerWidth };
    chrome.storage.local.set({ subtitlePos: pos }).catch(() => {});
  }

  subs.addEventListener("click", (e) => {
    const a = e.target.dataset?.a;
    if (!a) return;
    if (a === "hide") { subsHidden = true; applyDisplay(); return; }
    if (a === "smaller" || a === "larger") {
      sizeIdx = SIZES.indexOf(stepIn(SIZES, SIZES[sizeIdx], a === "larger" ? 1 : -1));
      chrome.storage.local.set({ subtitleSize: sizeIdx }).catch(() => {});
    } else {
      subWords = stepIn(WORD_STEPS, subWords, a === "more" ? 1 : -1);
      chrome.storage.local.set({ subtitleWords: subWords }).catch(() => {}); // Popup und Optionen zeigen denselben Wert
    }
    applyDisplay();
  });

  // drag the subtitles anywhere (the bottom-right corner is the width handle)
  subs.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const r = subs.getBoundingClientRect();
    if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) return; // resize: horizontal
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      subs.style.left = `${Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - r.width)}px`;
      subs.style.top = `${Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - subs.offsetHeight)}px`;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => { window.removeEventListener("pointermove", move); savePos(); }, { once: true });
  });
  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!subs.hidden && Math.abs(subs.offsetWidth - pos.width * window.innerWidth) > 2) savePos();
    }, 400);
  }).observe(subs);
  window.addEventListener("resize", placeSubs);

  // In fullscreen only the fullscreen element is visible: move the overlay into it (e.g. YouTube's player).
  document.addEventListener("fullscreenchange", () => {
    const fs = document.fullscreenElement;
    (fs && fs.tagName !== "VIDEO" ? fs : document.documentElement).appendChild(host);
    requestAnimationFrame(placeSubs);
  });

  // drag the panel to move
  $(".head").addEventListener("pointerdown", (e) => {
    if (e.target.tagName === "BUTTON") return;
    const r = box.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      box.style.left = `${ev.clientX - dx}px`; box.style.top = `${ev.clientY - dy}px`;
      box.style.right = "auto"; box.style.bottom = "auto";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
  });

  // ---- cards ----
  // long form as its own paragraph, letters that form the abbreviation highlighted
  function expansionNode(term, expansion) {
    const p = document.createElement("div");
    p.className = "exp";
    const marks = markInitials(term, expansion);
    if (!marks) {
      p.textContent = expansion;
      return p;
    }
    [...expansion].forEach((ch, i) => {
      if (marks.has(i)) {
        const b = document.createElement("b");
        b.textContent = ch;
        p.append(b);
      } else p.append(ch);
    });
    return p;
  }

  function addCard(c) {
    const el = document.createElement("div");
    el.className = "card new";
    const term = document.createElement("div");
    term.className = "term";
    term.textContent = c.term;
    el.append(term);
    if (c.expansion && c.expansion.toLowerCase() !== c.term.toLowerCase()) el.append(expansionNode(c.term, c.expansion));
    const def = document.createElement("div");
    def.className = "def";
    def.textContent = c.definition;
    const meta = document.createElement("div");
    meta.className = "meta";
    const src = { ai: "srcAi", cache: "srcCache", glossar: "srcGlossary" }[c.source];
    const lat = c.spokenAt ? t(lang, "afterWord", { s: ((c.shownAt - c.spokenAt) / 1000).toFixed(1) }) : "";
    meta.textContent = [src ? t(lang, src) : c.source, lat].filter(Boolean).join(" · ");
    el.append(def, meta);
    $(".list").prepend(el); // newest first
    $(".list").scrollTop = 0;
    while ($(".list").children.length > 30) $(".list").lastChild.remove();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.to !== "overlay") return;
    if (msg.type === "card" || msg.type === "reset") box.hidden = false;
    if (msg.type === "card") addCard(msg.card);
    else if (msg.type === "status") { const s = $(".status"); s.textContent = msg.text; s.className = `status ${msg.level || ""}`; }
    else if (msg.type === "partial") { $(".partial").textContent = msg.text; partialText = msg.text; renderSubs(); }
    else if (msg.type === "words") {
      // "DSGVO" + "-Vorgaben" kommen als zwei Wörter: zusammenführen
      for (const w of msg.words) w.startsWith("-") && finalWords.length ? (finalWords[finalWords.length - 1] += w) : finalWords.push(w);
      if (finalWords.length > KEEP_WORDS) finalWords = finalWords.slice(-KEEP_WORDS);
      partialText = "";
      renderSubs();
    } else if (msg.type === "reset") {
      if (msg.lang) { lang = msg.lang; applyLang(); }
      finalWords = []; partialText = ""; subsHidden = false;
      $(".list").textContent = ""; $(".partial").textContent = ""; $(".dot").classList.remove("off");
      applyDisplay();
    } else if (msg.type === "stopped") {
      $(".dot").classList.add("off");
      const s = msg.summary;
      $(".status").className = "status";
      $(".status").textContent = s ? t(lang, "stoppedOverlay", { cards: s.cards, lat: s.latencyMedianMs }) : t(lang, "stoppedPlain");
      $(".partial").textContent = "";
      subsHidden = true; // Untertitel verschwinden mit dem Stopp, das Transkript ist verworfen
      finalWords = []; partialText = "";
      applyDisplay();
    }
  });
})();
