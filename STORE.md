# Chrome Web Store – Einreichung

Alles, was das Developer Dashboard abfragt, zum Hineinkopieren. Texte auf Englisch (Hauptsprache) und Deutsch.

## Checkliste

1. Entwicklerkonto: https://chrome.google.com/webstore/devconsole (einmalig 5 US-$, Zwei-Faktor-Anmeldung nötig).
2. ZIP bauen: `npm install`, dann `npm run zip` → `live-transcribe-explain-1.0.0.zip`.
3. Datenschutzerklärung: liegt öffentlich im Repo, https://github.com/GordonMohrin/live-transcribe-explain/blob/main/PRIVACY.md
4. Screenshots (1280×800) und kleine Kachel (440×280) liegen in `store/`. Neu erzeugen: `npm run shots` (braucht Chrome).
5. Kategorie: **Productivity** (Produktivität). Sprache: English, zusätzlich Deutsch.
6. Sichtbarkeit beim ersten Mal: **Unlisted** (nur per Link) zum Testen, später Public.

## Klick-Reihenfolge im Dashboard

Chrome lässt keine Erweiterung (auch keine Automatisierung) auf Web-Store-Seiten zu, deshalb von Hand:

1. **Items → „+ New item“**, ZIP `live-transcribe-explain-1.0.0.zip` hochladen.
2. **Store listing:**
   - Beschreibung (EN) aus dem Abschnitt unten einfügen, Kategorie *Productivity*, Sprache *English*.
   - Store-Icon 128×128: `icons/128.png`.
   - Screenshots: `store/screenshot-1-lecture.png`, `store/screenshot-2-meeting.png`, `store/screenshot-3-setup.png`.
   - Small promo tile: `store/tile-440x280.png`.
   - Homepage URL und Support URL: https://github.com/GordonMohrin/live-transcribe-explain
   - Optional über „Add language“ Deutsch ergänzen und die deutsche Beschreibung einfügen.
3. **Privacy:**
   - Single purpose, die Begründung zu jeder Berechtigung, „No remote code“, Datennutzung und die drei Bestätigungen aus dem Abschnitt unten übernehmen.
   - Privacy policy URL eintragen.
4. **Distribution:**
   - Free, alle Regionen.
   - Visibility *Unlisted*.
5. **Account** (einmalig): Kontakt-E-Mail transcribe@mohrin.de eintragen und bestätigen. Ohne bestätigte E-Mail lässt sich nichts einreichen.
6. **„Save draft“** klicken. Erst wenn alles stimmt: „Submit for review“.

## Store-Eintrag

**Name:** Live Transcribe & Explain

**Kurzbeschreibung** (aus dem Manifest, max. 132 Zeichen):
Live transcription of meetings and videos that instantly explains acronyms and technical terms in a small overlay.

**Beschreibung (EN):**

Ever sat in a meeting, a lecture or a video and heard an acronym you didn't know? Live Transcribe & Explain listens along and explains it right away.

• Listens to the current tab (YouTube, Google Meet, Teams, Zoom in the browser, any video) and optionally your microphone.
• Speech recognition runs on your device with Chrome's built-in engine. Audio never leaves your computer.
• Acronyms and technical terms appear as small cards with the long form and a one-or-two-sentence explanation, usually within one to two seconds.
• Works in English and German. Explanations in English or German.
• Tell it who you are and what the conversations are about, and terms are explained in that context ("PCI" in cardiology vs. in payments).
• Your own glossary, a "never explain" list and extra rules.
• Alternatively reads the page's captions instead of the audio.

Bring your own key: you need an API key from Anthropic (Claude) or OpenAI. The extension talks directly to the provider; you pay them for what you use, typically a few cents per hour. Without a key only your own glossary is used.

Privacy: no account, no server, no tracking. The transcript is kept in memory only and discarded when you stop. Only short excerpts go to the AI provider you chose.

Please inform the people you talk to before transcribing a conversation; in many countries this requires their consent.

Needs Chrome 139 or newer. The speech pack for your language is downloaded by Chrome once.

**Beschreibung (DE):**

Im Meeting, in der Vorlesung oder im Video fällt eine Abkürzung, die du nicht kennst? Live Transcribe & Explain hört mit und erklärt sie sofort.

• Hört den aktuellen Tab (YouTube, Google Meet, Teams und Zoom im Browser, jedes Video) und auf Wunsch dein Mikrofon.
• Die Spracherkennung läuft mit der eingebauten Erkennung von Chrome auf deinem Gerät. Das Audio verlässt den Rechner nicht.
• Abkürzungen und Fachbegriffe erscheinen als kleine Karten mit Langform und einer Erklärung in ein bis zwei Sätzen, meist nach ein bis zwei Sekunden.
• Versteht Deutsch und Englisch, erklärt auf Deutsch oder Englisch.
• Sag ihr, wer du bist und worum es geht, dann werden Begriffe in diesem Zusammenhang erklärt („PCI“ in der Kardiologie oder im Zahlungsverkehr).
• Eigenes Glossar, eine Nie-erklären-Liste und eigene Regeln.
• Kann statt des Tons auch die Untertitel der Seite lesen.

Eigener Key: Du brauchst einen API-Key von Anthropic (Claude) oder OpenAI. Die Erweiterung spricht direkt mit dem Anbieter; du zahlst dort nach Verbrauch, meist wenige Cent pro Stunde. Ohne Key wird nur dein eigenes Glossar genutzt.

Datenschutz: kein Konto, kein Server, kein Tracking. Das Transkript liegt nur im Arbeitsspeicher und wird beim Stoppen verworfen. Nur kurze Ausschnitte gehen an den gewählten KI-Anbieter.

Bitte informiere deine Gesprächspartner, bevor du ein Gespräch transkribierst; in Deutschland ist das ohne Einwilligung strafbar (§ 201 StGB).

Braucht Chrome 139 oder neuer. Das Sprachpaket für deine Sprache lädt Chrome einmalig.

## Reiter „Datenschutz“ (Privacy practices)

**Single purpose:**
Explains acronyms and technical terms that are spoken in the current tab, in real time, in a small overlay.

**Begründung der Berechtigungen:**

| Berechtigung | Begründung (zum Einfügen) |
|---|---|
| `tabCapture` | Captures the audio of the tab the user started the extension on, so that Chrome's on-device speech recognition can transcribe it. Only after the user clicks Start; stops on Stop. |
| `offscreen` | The tab audio must be processed in an offscreen document (USER_MEDIA), because a service worker cannot use media streams or the Web Speech API. |
| `activeTab` | Gives access only to the tab where the user clicks Start, to show the overlay with the explanations and to capture that tab's audio. |
| `scripting` | Injects the overlay (and, in captions mode, the caption reader) into the tab the user started the extension on. |
| `storage` | Stores the user's settings, their own API key and a local cache of explained terms in chrome.storage.local. |
| Host `https://api.anthropic.com/*` | Sends short transcript excerpts to Claude, with the user's own API key, to get explanations of the terms. |
| Host `https://api.openai.com/*` | Same, for users who chose OpenAI and entered their own OpenAI key. |

**Remote code:** No, I am not using remote code. (Alles ist im Paket gebündelt; es werden nur JSON-Antworten der APIs geladen.)

**Datennutzung – anzukreuzen:**
- *Website content* (Inhalte der Website): **ja** – gesprochener Inhalt bzw. Untertitel des Tabs, als Textausschnitte an den gewählten KI-Anbieter.
- *Authentication information*: **ja** – der API-Key des Nutzers, nur lokal gespeichert und nur an dessen Anbieter gesendet.
- Alles andere (personenbezogene Daten, Gesundheit, Finanzen, Standort, Webverlauf, Nutzeraktivität, persönliche Kommunikation): **nein**.

  Unsicher ist *Personal communications*, weil die Erweiterung in Meetings mithört. Ehrlicher ist es, das ebenfalls anzukreuzen. Dann sieht der Prüfer, dass es offengelegt ist, und es gibt keinen Ablehnungsgrund wegen fehlender Offenlegung.

**Die drei Bestätigungen** (alle ankreuzen, sie stimmen):
- Daten werden nicht an Dritte verkauft, außer in den erlaubten Fällen.
- Daten werden nicht für Zwecke genutzt, die nichts mit dem Kernzweck zu tun haben.
- Daten werden nicht zur Bonitätsprüfung oder für Kredite genutzt.

**Privacy policy URL:** https://github.com/GordonMohrin/live-transcribe-explain/blob/main/PRIVACY.md

**Kontakt-E-Mail / Support:** transcribe@mohrin.de · Homepage: https://github.com/GordonMohrin/live-transcribe-explain

## Bekannte Prüfungsrisiken

- `tabCapture` und Mithören in Meetings sorgen für genauere Prüfung. Das dauert oft ein bis drei Wochen statt weniger Tage.
- Die Beschreibung muss zum Verhalten passen. Keine Versprechen wie „funktioniert in jeder App“, nur Browser-Tabs.
- Ohne Screenshots und ohne kleine Kachel lässt sich der Eintrag nicht einreichen.
