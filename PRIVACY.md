# Privacy Policy – Live Transcribe & Explain

*Last updated: 12 November 2026*

Live Transcribe & Explain is a browser extension that listens to the audio of the current tab (and, if you turn it on, your microphone), recognises speech on your device and explains acronyms and technical terms in a small overlay.

## What happens to your data

| Data | Where it goes | Stored? |
|---|---|---|
| Tab audio and microphone audio | Processed by Chrome's built-in speech recognition **on your device**. The audio never leaves your computer. | No |
| Page captions (if you choose "page's captions") | Read from the page in your browser. | No |
| Transcript | Kept in memory only while a session runs. Short excerpts (a few sentences) are sent to the AI provider you chose (see below) so it can find and explain terms. | No – discarded when you press Stop |
| Your API key (Claude or OpenAI) | Stored only in this browser (`chrome.storage.local`). Sent only to the provider it belongs to. | Yes, locally |
| Your settings (language, context, glossary, "never explain" list, rules) | Stored only in this browser (`chrome.storage.local`). Context, glossary, list and rules are sent to your AI provider with each request. | Yes, locally |
| Explained terms and their definitions | Stored only in this browser as a cache, so the same term is not looked up twice. You can clear it in the settings. | Yes, locally |

## AI providers

The extension has no server of its own. It sends requests directly from your browser to the provider whose key you entered:

- **Anthropic (Claude):** `api.anthropic.com` – privacy policy: https://www.anthropic.com/legal/privacy
- **OpenAI:** `api.openai.com` – privacy policy: https://openai.com/policies/privacy-policy

What these providers do with the data is governed by their API terms and your account settings with them.

## What we do not do

- We (the developer) receive no data at all: no audio, no transcripts, no keys, no usage statistics, no analytics.
- No data is sold or shared with third parties other than the AI provider you chose.
- No data is used for advertising, credit scoring or anything unrelated to explaining terms.

## Your responsibility

Recording or transcribing private conversations may require the consent of all participants (in Germany: § 201 StGB). The extension reminds you of this in its overlay. Please inform the people you talk to.

## Deleting your data

Remove the extension, or clear the cache and the fields in its settings. Nothing remains on any server operated by us, because there is none.

## Contact

Gordon Mohrin – gordon.mohrin@gmail.com

---

# Datenschutzerklärung – Live Transcribe & Explain

*Stand: 12. November 2026*

Live Transcribe & Explain ist eine Browser-Erweiterung. Sie hört den Ton des aktuellen Tabs (und auf Wunsch dein Mikrofon), erkennt die Sprache auf deinem Gerät und erklärt Abkürzungen und Fachbegriffe in einem kleinen Overlay.

- **Audio** (Tab und Mikrofon) wird von der eingebauten Spracherkennung von Chrome **auf deinem Gerät** verarbeitet und verlässt den Rechner nicht. Es wird nicht gespeichert.
- **Transkript:** nur im Arbeitsspeicher, solange eine Sitzung läuft. Kurze Ausschnitte (wenige Sätze) gehen an den von dir gewählten KI-Anbieter (Anthropic oder OpenAI), damit er Begriffe findet und erklärt. Beim Stoppen wird alles verworfen.
- **API-Key und Einstellungen** liegen nur in diesem Browser (`chrome.storage.local`). Der Key geht nur an den Anbieter, zu dem er gehört. Kontext, Glossar, Nie-erklären-Liste und Regeln werden mit jeder Anfrage an den Anbieter geschickt.
- **Erklärte Begriffe** werden lokal als Cache gespeichert und lassen sich in den Einstellungen löschen.
- **Der Entwickler erhält keinerlei Daten.** Es gibt keinen eigenen Server, keine Statistik, kein Tracking, keine Weitergabe an Dritte außer dem gewählten KI-Anbieter.
- **Rechtlicher Hinweis:** Das Mithören oder Transkribieren nicht-öffentlicher Gespräche ohne Einwilligung ist in Deutschland strafbar (§ 201 StGB). Bitte informiere deine Gesprächspartner.

Kontakt: Gordon Mohrin – gordon.mohrin@gmail.com
