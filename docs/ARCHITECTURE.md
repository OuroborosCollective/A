# Architektur

## Truth boundaries

Das System trennt vier Ebenen:

1. **Upstream-Evidence** – öffentliche GitHub-, Internet-Archive- und Feed-Endpunkte.
2. **Deterministische Normalisierung** – Canonical URL, Upstream-ID, stabil sortierter Metadatensatz und SHA-256.
3. **Notion-Projektion** – verwaltete Datenbanken für Quellen und Hype-Signale.
4. **Analyse** – Agent-Tools dürfen Recherchepfade, Evidenzstufen und Hype-Werte ableiten, aber keine Identität behaupten.

Ein erfolgreicher HTTP-Status belegt nur den Abruf. `Record SHA-256` hasht den normalisierten Datensatz. Er ist kein Hash des vollständigen Originalinhalts, solange `Content-Hash verifiziert` nicht ausdrücklich gesetzt ist.

## Laufende Lanes

| Lane | Adapter | Rhythmus | Datenbank |
|---|---|---:|---|
| Bitcoin-Core-Commits | GitHub REST | 15 Minuten | Quellenarchiv |
| Bitcoin-Core-Releases | GitHub REST | 1 Stunde | Quellenarchiv |
| historische Discovery (Wayback/Wikipedia/Common Crawl/Mailingliste) | CDX/MediaWiki/CC-Index/MetzDowd | 6 Stunden | Quellenarchiv |
| Forum-/Claim-Discovery | Bitcointalk HTML | 2 Stunden | Quellenarchiv + Claims |
| technische und mediale Feeds | RSS/Atom | 30 Minuten | Hype-Signale |
| Analyse-Executor | D1-Queue (research) | 4 Stunden | Analyseergebnisse |
| Backfill | GitHub REST | manuell | Quellenarchiv |

## Zustandsmodell

Sync-Cursor überlappen bewusst. Upserts sind durch deterministische Schlüssel idempotent. Paginationszustände werden über `nextState` fortgesetzt. Keine Lane löscht unbekannte Datensätze automatisch.

## Backfill

Der planmäßige Commit-Sync beginnt beim ersten Deployment mit einem begrenzten 24-Stunden-Fenster. Die vollständige Historie wird ausschließlich über den manuellen Backfill-Sync geladen, damit der erste Deployment-Lauf nicht zehntausende GitHub-Seiten blockiert.
