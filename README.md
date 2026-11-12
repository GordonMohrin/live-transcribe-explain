# Live Transcribe & Explain

Chrome-Erweiterung (Manifest V3): hört den aktuellen Tab und auf Wunsch das Mikrofon mit, erkennt die Sprache mit der eingebauten Spracherkennung von Chrome auf dem Gerät und erklärt Abkürzungen und Fachbegriffe in einem kleinen Overlay. Die Erklärungen kommen von Claude oder OpenAI, mit dem eigenen API-Key des Nutzers (bring your own key).

## Funktionsweise

```
Tab-Audio ─┐                                     ┌─ Glossar / Cache ──────────┐
Mikrofon ──┼─ Offscreen-Dokument ─ Web Speech ───┤                            ├─ Overlay im Tab
           │  (Chrome, auf dem Gerät)            └─ Claude oder OpenAI ───────┘
Untertitel ┘  (captions.js liest die Seite)          (eigener Key, Streaming)
```

- `src/background.js`: Service Worker. Startet und stoppt die Sitzung, hält die Engine, schickt Karten ans Overlay.
- `src/offscreen.js` und `src/browser-asr.js`: Tab-Audio und Mikrofon aufnehmen und mit `SpeechRecognition` (`processLocally`, `start(track)`) erkennen. Das Sprachpaket stößt das Popup beim Klick auf Start an, weil `install()` eine Nutzeraktion braucht.
- `src/captions.js`: Alternative ohne Audio. Liest die Untertitel von YouTube, Meet, Teams und Zoom.
- `src/engine.js` und `src/terms.js`: Kandidaten finden, Glossar und Cache zuerst, dann das Sprachmodell. Keine Doppelten, Nie-erklären-Liste.
- `src/llm.js`: gemeinsamer Prompt und JSON-Schema. Claude über `@anthropic-ai/sdk` mit Prompt-Caching, OpenAI über Chat Completions per `fetch`. Beide streamen, jede Karte erscheint, sobald ihr Objekt vollständig ist.
- `src/switches.js`: Auswahl-Einstellungen (Quelle, gesprochene Sprache, Detailstufe) an einer Stelle. Popup und Optionen bauen ihre Dropdowns daraus.
- `src/i18n.js`: Oberfläche auf Englisch und Deutsch.

Gespeichert wird nur in `chrome.storage.local`: Einstellungen, API-Key und ein Cache erklärter Begriffe. Audio und Transkript werden nie gespeichert. Details stehen in [PRIVACY.md](PRIVACY.md).

## Entwickeln

Voraussetzungen sind Node.js 22 oder neuer und Chrome 139 oder neuer.

```bash
npm install
npm test          # Unit-Tests (node:test)
npm run build     # nach dist/
npm run zip       # dist/ als ZIP für den Chrome Web Store
```

Zum Laden in Chrome: `chrome://extensions` öffnen, Entwicklermodus einschalten, „Entpackte Erweiterung laden“ wählen und `dist/` auswählen.

## Einrichten (als Nutzer)

1. Unter Optionen den KI-Anbieter wählen und den API-Key eintragen:
   - Claude: console.anthropic.com
   - OpenAI: platform.openai.com
2. Mit „Key prüfen“ testen.
3. Optional angeben:
   - Kontext: wer du bist und worum es geht
   - eigenes Glossar
   - Nie-erklären-Liste
   - zusätzliche Regeln
4. Im Popup die Quelle und die gesprochene Sprache wählen, dann auf **Start** klicken. Beim ersten Mal lädt Chrome das Sprachpaket.

## Rechtliches

Nicht-öffentlich gesprochene Worte ohne Einwilligung mitzuhören oder aufzunehmen, ist in Deutschland strafbar (§ 201 StGB). Overlay, Popup und Optionen erinnern daran, die Gesprächspartner zu informieren.

## Store

Store-Texte, Begründungen der Berechtigungen und die Checkliste stehen in [STORE.md](STORE.md).
