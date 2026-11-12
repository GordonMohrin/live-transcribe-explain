// Overlay in the tab: small movable panel at the top right with term cards (newest first) and the legal note.
// Injected via chrome.scripting; injecting it twice is harmless.
import { t } from "./i18n.js";
import { markInitials } from "./terms.js";

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
  .term { font-weight: 700; font-size: 16px; letter-spacing: .02em; }
  .exp { margin: 4px 0 2px; padding: 5px 8px; border-radius: 6px; background: var(--exp-bg); font-size: 14px; line-height: 1.35; }
  .exp b { color: var(--accent); font-weight: 800; font-size: 1.12em; }
  .def { margin-top: 4px; }
  .meta { color: var(--muted); font-size: 11px; margin-top: 3px; }
  .min .list, .min .partial, .min .status, .min .legal { display: none; }`;

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
    </div>`;
  document.documentElement.appendChild(host);

  const $ = (s) => root.querySelector(s);
  const box = $(".box");
  $(".close").onclick = () => (host.style.display = "none");
  $(".min-btn").onclick = () => box.classList.toggle("min");

  function applyLang() {
    $(".title").textContent = t(lang, "title");
    $(".legal").textContent = t(lang, "legalOverlay");
    $(".min-btn").title = t(lang, "minimize");
    $(".close").title = t(lang, "hide");
  }
  applyLang();

  // drag to move
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
    host.style.display = "";
    if (msg.type === "card") addCard(msg.card);
    else if (msg.type === "status") { const s = $(".status"); s.textContent = msg.text; s.className = `status ${msg.level || ""}`; }
    else if (msg.type === "partial") $(".partial").textContent = msg.text;
    else if (msg.type === "reset") {
      if (msg.lang) { lang = msg.lang; applyLang(); }
      $(".list").textContent = ""; $(".partial").textContent = ""; $(".dot").classList.remove("off");
    } else if (msg.type === "stopped") {
      $(".dot").classList.add("off");
      const s = msg.summary;
      $(".status").className = "status";
      $(".status").textContent = s ? t(lang, "stoppedOverlay", { cards: s.cards, lat: s.latencyMedianMs }) : t(lang, "stoppedPlain");
      $(".partial").textContent = "";
    }
  });
})();
