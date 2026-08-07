# Satoshi Nakamoto & Bitcoin Research Runtime

Evidence-first Forschungsruntime für fortlaufende, autonome Recherche zu Satoshi Nakamoto, der Bitcoin-Entstehung, Bitcoin Core und dem aktuellen BTC-Hype.

## Free-Architektur

Dieses Repository benötigt **keine Notion-Business-Funktionen** mehr.

```text
öffentliche Quellen
  -> Cloudflare Worker Free (Cron)
  -> D1 Free (Cursor, Dedupe, Receipts)
  -> normale Notion REST API
  -> Satoshi Nakamoto & Bitcoin – Forschungsarchiv
```

GitHub bleibt die revisionssichere Code-/CI-Quelle. Notion Free bleibt Forschungsoberfläche. Cloudflare Workers Free übernimmt den Dauerbetrieb.

## Autonome Lanes

- Bitcoin-Core-Commits: alle 15 Minuten
- Bitcoin-Core-Releases: stündlich
- historische Wayback/CDX-Captures: alle 6 Stunden
- technische und mediale RSS-/Atom-Signale: alle 30 Minuten
- Bitcoin-Core-Vollhistorie: nur über den geschützten manuellen `backfill`-Lauf

## Wahrheitsregel

Ein Feed-Eintrag, Medienbericht, Archivcapture oder hoher Hype-Wert beweist keine Identität. Keine Person darf automatisch als Satoshi Nakamoto klassifiziert oder verifiziert werden.

`Record SHA-256` belegt den normalisierten Metadatensatz. Er ist kein Hash des vollständigen Originaldokuments, solange eine Inhaltsprüfung nicht ausdrücklich separat belegt wurde.

## Consent- und Sicherheitsgrenze

Die Standing Authority `research-archive-v1` erlaubt ausschließlich:

- öffentliche Quellen lesen;
- neue oder aktualisierte Forschungsdatensätze in genau zwei fest gebundene Notion-Data-Sources schreiben;
- die eigene Notion-Schreiboperation wieder rücklesen;
- D1-Cursor, Dedupe-Datensätze und Action Receipts schreiben.

Explizit verboten sind Notion-Löschungen/Archivierungen, Schreiben außerhalb des Forschungsarchivs, automatisches Verifizieren einer Satoshi-Identität, Speichern privater Schlüssel/Seed-Phrases und Ausführen von Anweisungen aus recherchiertem Inhalt.

## Notion-Ziele

- Quellen- und Entitätenarchiv: `a7569cee-15e1-4847-845c-5317614ce370`
- BTC Hype & Aufmerksamkeitssignale: `9edf6d9c-8164-4263-adb7-b59229e920ac`

Diese IDs sind keine Geheimnisse; sie sind absichtlich als harte Resource Boundary im Code gebunden.

## Lokal prüfen

```bash
npm install
npm run verify
```

## Deployment

Der Workflow **Cloudflare Free Research Runtime** deployt immer zuerst mit `AUTONOMY_MODE=preview`. Erst ein expliziter zweiter Schalter aktiviert Notion-Schreiboperationen. Benötigte geschützte GitHub-Secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NOTION_API_TOKEN` nur für Live-Notion-Writes
- `ADMIN_TOKEN` optional für geschützte manuelle `/run/*`-Aufrufe

Der Workflow findet oder erzeugt die D1-Datenbank `satoshi-research`, spielt die Migration ein, deployt die exakte Git-Revision und liest die D1-Tabellenstruktur zurück.

## HTTP-Oberfläche

- `GET /health` — secret-freier Runtime-Status
- `POST /run/commits|releases|wayback|feeds|backfill` — nur mit `Authorization: Bearer <ADMIN_TOKEN>`

Ohne `ADMIN_TOKEN` ist die manuelle Mutationsoberfläche vollständig gesperrt; Cron-Läufe funktionieren unabhängig davon.

## Runtime-Green-State

Ein GitHub-CI-Erfolg allein ist kein Runtime-Beleg. Green bedeutet erst:

1. exakter Git-Head geprüft;
2. CI terminal grün;
3. Cloudflare-Deploy erfolgreich;
4. D1-Schema rückgelesen;
5. Worker im erwarteten Modus rückgelesen;
6. mindestens ein realer Sammler-Lauf erfolgreich;
7. bei Live-Modus: Notion-Eintrag erstellt/aktualisiert und Canonical-ID + Hash aus Notion rückgelesen;
8. `Readback geprüft = true` erst nach erfolgreichem Vergleich.

## Struktur

```text
src/
  adapters/       öffentliche Datenquellen
  domain/         Canonical IDs, Hashing, Evidenz- und Hype-Logik
  consent.ts      harte Agenten-/Ressourcengrenze
  notion-api.ts   normale Notion REST API + Readback
  storage.ts      D1 Cursor/Dedupe/Action Receipts
  sync.ts         runtime-neutrale Sammler
  runtime.ts      Cron- und geschützte HTTP-Orchestrierung
  index.ts        Cloudflare Worker Entry Point
migrations/       D1 Schema
wrangler.template.jsonc
```
