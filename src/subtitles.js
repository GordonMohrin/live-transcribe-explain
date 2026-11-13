// Untertitel-Text: die letzten n Wörter aus bestätigten Wörtern plus dem noch unbestätigten Zwischenstand.
// Ohne DOM, damit es im Node-Test läuft.

export const KEEP_WORDS = 200; // so viele bestätigte Wörter behält das Overlay (nur im Speicher)
export const SIZES = [16, 20, 24, 28, 34, 40, 48]; // Schriftgrößen in px für A−/A+

// → { done: "bestätigter Teil", pending: "unbestätigter Teil" }, zusammen höchstens n Wörter
export function lastWords(final, partialText, n) {
  const pending = (partialText || "").trim().split(/\s+/).filter(Boolean);
  const p = pending.slice(-n);
  const d = n > p.length ? final.slice(-(n - p.length)) : [];
  return { done: d.join(" "), pending: p.join(" ") };
}

// Nächster Wert in einer sortierten Liste (dir = +1 / -1), am Rand bleibt er stehen.
export function step(list, current, dir) {
  const i = list.indexOf(current);
  if (i < 0) return list[0];
  return list[Math.min(list.length - 1, Math.max(0, i + dir))];
}

// Position als Anteil des Fensters (0..1), damit sie auch nach Größenänderung oder im Vollbild passt.
export function clampPos({ left, top, width }, boxH, vw, vh) {
  const w = Math.min(width * vw, vw);
  const l = Math.min(Math.max(0, left * vw), Math.max(0, vw - w));
  const t = Math.min(Math.max(0, top * vh), Math.max(0, vh - boxH));
  return { left: l, top: t, width: w };
}
