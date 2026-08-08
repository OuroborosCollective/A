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

- Bitcoin-Core-Commits: alle 15 Minuten (`*/15 * * * *`)
- Bitcoin-Core-Releases: stündlich (`7 * * * *`)
- historische Discovery (Wayback/Wikipedia/Common Crawl/Mailingliste): alle 6 Stunden (`17 */6 * * *`)
- technische und mediale RSS-/Atom-Signale: alle 30 Minuten (`*/30 * * * *`)
- Forum-/Claim-Discovery: alle 2 Stunden (`23 */2 * * *`)
- Analyse-Executor (auto-quellentriangulation): alle 4 Stunden, integriert in den `*/30`-Sweep (Cloudflare Free erlaubt max. 5 Cron-Trigger; der Executor läuft um Stunde 0, 4, 8, 12, 16, 20)
- **Wiederkehrender Runtime-Sweep**: alle 30 Minuten via GitHub-Actions-Workflow `recurring-sweep.yml` — ruft der Reihe nach `commits`, `feeds`, `forum`, `mailinglist`, `releases`, `discovery` und `analysis-execute` gegen den live Worker auf
- Bitcoin-Core-Vollhistorie: nur über den geschützten manuellen `backfill`-Lauf

## Wahrheitsregel

Ein Feed-Eintrag, Medienbericht, Archivcapture oder hoher Hype-Wert beweist keine Identität. Keine Person darf automatisch als Satoshi Nakamoto klassifiziert oder verifiziert werden.

`Record SHA-256` belegt den normalisierten Metadatensatz. Er ist kein Hash des vollständigen Originaldokuments, solange eine Inhaltsprüfung nicht ausdrücklich separat belegt wurde.

## Consent- und Sicherheitsgrenze

Die Standing Authority `research-archive-v3` erlaubt ausschließlich:

- öffentliche Quellen lesen;
- neue oder aktualisierte Forschungsdatensätze in genau fünf fest gebundene Notion-Data-Sources schreiben (Quellenarchiv, Hype-Signale, Claims & Evidence Ledger, Informationsfamilien & Folgesuchpfade, reproduzierbare Analyseergebnisse);
- die eigene Notion-Schreiboperation wieder rücklesen;
- D1-Cursor, Dedupe-Datensätze und Action Receipts schreiben.

Explizit verboten sind Notion-Löschungen/Archivierungen, Schreiben außerhalb des Forschungsarchivs, automatisches Verifizieren einer Satoshi-Identität, Speichern privater Schlüssel/Seed-Phrases und Ausführen von Anweisungen aus recherchiertem Inhalt.

## Notion-Ziele

- Quellen- und Entitätenarchiv: `a7569cee-15e1-4847-845c-5317614ce370`
- BTC Hype & Aufmerksamkeitssignale: `9edf6d9c-8164-4263-adb7-b59229e920ac`
- Claims & Evidence Ledger: `7ba3564e-c996-4ab7-ab9e-3bcaef89bbf3`
- Informationsfamilien & Folgesuchpfade: `d091aa97-4bce-47de-9fe7-c23d52759dd5`
- Reproduzierbare Analyseergebnisse: `7a86f38f-aac0-43c5-a602-a6f5a4b28124`

Diese IDs sind keine Geheimnisse; sie sind absichtlich als harte Resource Boundary im Code gebunden (`src/consent.ts`).

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
- `POST /run/commits|releases|discovery|wayback|sourceforge|wikipedia|commoncrawl|feeds|forum|mailinglist|backfill` — nur mit `Authorization: Bearer <ADMIN_TOKEN>`
- `POST /run/analysis-execute` — arbeitet ausstehende `research:source-triangulation`-Tasks (ohne Human Review) automatisch ab und persistiert reproduzierbare Ergebnisse
- `GET /analysis/pending` — ausstehende Analyse-Tasks auflisten (geschützt)
- `POST /analysis/claim` / `POST /analysis/complete` / `POST /analysis/release` — geschützter Claim-/Completion-/Release-Lebenszyklus für externe Executors
- `GET /analysis/result?taskId=...` — gespeichertes Analyseergebnis lesen (geschützt)
- `POST /analysis/publish` — reproduzierbares Analyseergebnis nach Notion publizieren und rücklesen (nur live)

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
