// Liest vorhandene Untertitel der Seite (YouTube, Google Meet, Teams-Web, Zoom-Web) und schickt neue Wörter
// an den Service Worker. Quelle ohne Audio; die Selektoren können sich mit Updates der Seiten ändern.
(() => {
  if (window.__liveErklaerungCaptions) return;
  window.__liveErklaerungCaptions = true;

  const SELECTORS = [
    ".ytp-caption-segment", // YouTube
    '[data-tid="closed-caption-text"]', // Teams (Web)
    ".live-transcription-subtitle__item", // Zoom (Web)
    'div[role="region"][aria-label*="aption"] span', // Google Meet (EN)
    'div[role="region"][aria-label*="ntertitel"] span', // Google Meet (DE)
  ].join(",");

  let prev = [];
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

  function newWords(cur) {
    // Überlappung: wo endet das zuletzt Gesehene im aktuellen Text?
    for (let k = Math.min(prev.length, cur.length, 6); k >= 1; k--) {
      const tail = prev.slice(-k).map(norm).join(" ");
      for (let i = cur.length - k; i >= 0; i--) {
        if (cur.slice(i, i + k).map(norm).join(" ") === tail) return cur.slice(i + k);
      }
    }
    return cur;
  }

  const timer = setInterval(() => {
    const els = [...document.querySelectorAll(SELECTORS)].filter((e) => !e.querySelector(SELECTORS));
    const cur = els.map((e) => e.textContent).join(" ").split(/\s+/).filter(Boolean);
    if (!cur.length) return;
    const fresh = newWords(cur);
    if (!fresh.length) return;
    prev = [...prev, ...fresh].slice(-60);
    const t = Date.now();
    chrome.runtime.sendMessage({ to: "background", cmd: "words", words: fresh.map((w) => ({ w, t })) }).catch(() => {});
    chrome.runtime.sendMessage({ to: "background", cmd: "partial", text: cur.join(" ") }).catch(() => {});
  }, 300);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.to === "captions" && msg.cmd === "stop") {
      clearInterval(timer);
      window.__liveErklaerungCaptions = false;
    }
  });
})();
