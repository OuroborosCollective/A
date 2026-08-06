# Satoshi Nakamoto & Bitcoin Research Worker

Evidence-first Notion Worker für fortlaufende, autonome Recherche zu Satoshi Nakamoto, der Bitcoin-Entstehung, Bitcoin Core und dem aktuellen BTC-Hype.

## Was dieses Repository tut

- synchronisiert aktuelle Bitcoin-Core-Commits und Releases in ein verwaltetes Notion-Quellenarchiv;
- stellt einen manuellen, paginierten Vollhistorien-Backfill bereit;
- inventarisiert frühe Bitcoin.org-, Whitepaper- und SourceForge-Captures über die Internet Archive CDX API;
- sammelt technische und mediale RSS-/Atom-Signale in einer getrennten Hype-Datenbank;
- erzeugt kanonische URLs, deterministische IDs und SHA-256-Hashes normalisierter Datensätze;
- bietet read-only Agent-Tools für Recherchepfade, Evidenzeinstufung, Hype-Berechnung und Canonical IDs;
- trennt Primärevidenz, Archivkopien, Medienberichte und Aufmerksamkeit strikt voneinander.

## Wahrheitsregel

Ein Feed-Eintrag, Medienbericht, Archivcapture oder hoher Hype-Wert beweist keine Identität. Keine Person darf als Satoshi Nakamoto klassifiziert werden, solange keine unabhängig reproduzierbare kryptografische Evidenz vorliegt.

`Record SHA-256` belegt den normalisierten Metadatensatz. Er ist kein Hash des vollständigen Originaldokuments, solange `Content-Hash verifiziert` nicht ausdrücklich gesetzt ist.

## Voraussetzungen

- Node.js 22 oder neuer
- npm 10 oder neuer
- Notion CLI `ntn`

Die aktuelle Notion-Workers-Dokumentation verlangt Node.js 22+ und einen Worker, der genau eine `Worker`-Instanz exportiert.

## Lokal prüfen

```bash
npm install
npm run verify
```

## In Notion deployen

```bash
curl -fsSL https://ntn.dev | bash
ntn login
ntn workers deploy --name satoshi-research
```

Optional kann ein GitHub-Token als Worker-Secret gesetzt werden, um das öffentliche API-Limit anzuheben. Ohne Token bleibt die Lane bewusst auf 50 Requests pro Stunde begrenzt.

```bash
ntn workers secrets set GITHUB_TOKEN
```

## Automatische Datenbanken

Beim Deployment erzeugt der Worker:

1. **Satoshi & Bitcoin – Quellenarchiv**
2. **Bitcoin – Hype- und Aufmerksamkeitssignale**

Schemaänderungen an managed databases werden beim Deployment migriert und können Daten entfernen. Änderungen an `src/schemas.ts` deshalb stets als migrationskritisch behandeln.

## Agent-Tools

- `deriveResearchPaths`
- `assessEvidence`
- `calculateHype`
- `canonicalSourceId`

Alle vier Tools sind read-only markiert.

## Struktur

```text
src/
  adapters/       externe, typisierte Datenquellen
  domain/         Canonical IDs, Hashing, Evidenz- und Hype-Logik
  config.ts       öffentliches Quellenregister
  schemas.ts      Notion-managed Databases und Projektionen
  sync.ts         paginierte, idempotente Sync-Lanes
  tools.ts        read-only Notion Agent Tools
  index.ts        Worker-Manifest
docs/             Architektur, Evidenzmodell und Quellenregister
```

## Noch nicht als belegt behauptet

Der Branch deployt den Worker nicht automatisch. Notion-Deployment, erzeugte Datenbanken, Live-Syncs und Readback-Parität gelten erst nach einem echten `ntn workers deploy`, einem ausgeführten Sync und erneutem Notion-Abruf als Runtime-Evidence.
