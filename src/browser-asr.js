// Spracherkennung des Browsers (Web Speech API), immer auf dem Gerät: das Audio verlässt den Rechner nicht.
// Chrome kann seit Version 139 auf dem Gerät erkennen (processLocally) und einen beliebigen Audio-Track
// statt des Mikrofons annehmen (start(track)). Wort-Zeitstempel gibt es nicht: Jedes Wort bekommt die Zeit,
// zu der es zum ersten Mal (als Zwischenergebnis) auftauchte.

const SR = self.SpeechRecognition || self.webkitSpeechRecognition;
const FATAL = new Set(["not-allowed", "service-not-allowed", "language-not-supported", "audio-capture", "bad-grammar"]);

export const chromeVersion = () => +(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || 0);

// Sprachpaket für die Erkennung auf dem Gerät: "available" | "downloadable" | "downloading" | "unavailable" | "unknown".
// Ältere Chrome-Versionen hatten availableOnDevice(lang) statt available({langs, processLocally}).
export async function packState(lang) {
  if (!SR) return "unavailable";
  if (SR.available) return SR.available({ langs: [lang], processLocally: true });
  if (SR.availableOnDevice) return SR.availableOnDevice(lang);
  return "unknown";
}

export async function installPack(lang) {
  if (SR?.install) return SR.install({ langs: [lang], processLocally: true });
  if (SR?.installOnDevice) return SR.installOnDevice(lang);
  return false;
}

// Erkennt fortlaufend aus track. onWords([{w, t}]) für fertige Sätze, onPartial(text) für Zwischenstände,
// onState(key, vars, level) für Statusmeldungen (i18n-Schlüssel). cancelled() bricht eine laufende
// Sprachpaket-Installation ab. Gibt { stop() } zurück.
export async function recognize(track, { lang, local = true, onWords, onPartial, onState, cancelled = () => false }) {
  const none = { stop() {} };
  if (!SR) return onState("noBrowserAsr", {}, "error"), none;
  if (local) {
    try {
      const state = await packState(lang);
      if (state === "unavailable") return onState("packUnavailable", { lang }, "error"), none;
      if (state === "unknown") return onState("oldChrome", { v: chromeVersion() }, "error"), none;
      // install() braucht einen Klick (sticky activation), den es im Offscreen-Dokument nie gibt. Das Popup
      // stößt den Download beim Klick auf Start an; hier nur warten, bis das Paket da ist.
      if (state === "downloadable" || state === "downloading") {
        onState("packInstalling", { lang });
        const since = Date.now();
        for (let s = state; s !== "available"; s = await packState(lang)) {
          if (cancelled()) return none;
          if (s === "unavailable") return onState("packFailed", { lang }, "error"), none;
          if (s === "downloadable" && Date.now() - since > 5000) return onState("packMissing", { lang }, "error"), none;
          if (Date.now() - since > 10 * 60_000) return onState("packFailed", { lang }, "error"), none;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    } catch (e) {
      return onState("browserAsrError", { msg: e.message || e }, "error"), none;
    }
    if (cancelled()) return none;
  }

  let stopped = false;
  let rec = null;
  let restarts = 0;
  const run = () => {
    const firstSeen = []; // je Ergebnis-Index: Zeit, zu der jedes Wort zuerst auftauchte
    const sent = new Set();
    rec = new SR();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    if ("processLocally" in rec) rec.processLocally = local;
    rec.onstart = () => restarts === 0 && onState("browserAsrRunning", { lang });
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const words = res[0].transcript.trim().split(/\s+/).filter(Boolean);
        const seen = (firstSeen[i] ||= []);
        for (let k = 0; k < words.length; k++) seen[k] ??= Date.now();
        if (res.isFinal) {
          if (!sent.has(i) && words.length) {
            sent.add(i);
            onWords(words.map((w, k) => ({ w, t: seen[k] ?? Date.now() })));
          }
        } else partial += " " + res[0].transcript;
      }
      onPartial(partial.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // Stille bzw. eigenes stop()
      onState("browserAsrError", { msg: e.error + (e.message ? `: ${e.message}` : "") }, "error");
      if (FATAL.has(e.error)) stopped = true;
    };
    // Chrome beendet die Erkennung nach Pausen oder spätestens nach einigen Minuten: sofort neu starten.
    rec.onend = () => {
      if (stopped) return;
      restarts++;
      setTimeout(() => !stopped && run(), 100);
    };
    rec.start(track);
  };
  run();
  return {
    stop() {
      stopped = true;
      try { rec?.abort(); } catch {}
    },
  };
}
