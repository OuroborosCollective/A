# Analyse-Queue und Wolfram-Handoff

## Zweck

Die Cloudflare-Runtime sammelt Quellen und erzeugt nur dann Analyseaufträge, wenn der Inhalt mathematische, kryptografische, zeitliche, Netzwerk- oder Autorschaftsprüfung rechtfertigt. Die Queue ist kein Wahrheitsautomat.

## D1-Vertrag

`analysis_queue` speichert je Aufgabe:

- deterministische `task_id`,
- `source_canonical_id`,
- Analyseart,
- Executor `research` oder `wolfram`,
- Status `pending|running|done|blocked`,
- `requires_human_review`,
- serialisierten, quellengebundenen Input.

Upserts sind idempotent. Wiederholte Collector-Läufe erzeugen keine neue Aufgabe mit gleicher ID.

## Analysearten

- `source-triangulation`: Original, Archiv, Zitate, Gegenbelege und unabhängige Quellen.
- `temporal-analysis`: Zeitstempel, Aktivitätsfenster, Posting-Abstände und Reihenfolgen.
- `cryptographic-statistics`: öffentliche PGP/GPG/DSA/ECDSA-/Signaturparameter und statistische Prüfungen; keine Private-Key-Recovery.
- `network-graph`: öffentliche Beziehungen und Graphstruktur; kein physischer Standortbeweis.
- `quantitative-analysis`: technische und numerische Aussagen reproduzierbar nachrechnen.
- `stylometry`: Stil-/Ähnlichkeitsmetriken; immer Human Review, niemals automatische Identitätsfeststellung.

## Zugriff

Der geschützte Runtime-Endpunkt `GET /analysis/pending?limit=25` liefert ausstehende Aufgaben nur mit dem kurzlebigen `ADMIN_TOKEN`. Secrets und Credentials werden nicht Teil der Queue.

Der derzeitige Wolfram-Schritt ist bewusst ein Handoff: Aufgaben werden automatisch erzeugt und vorsortiert, aber erst ein explizit angebundener Wolfram-Executor oder eine manuelle `@Wolfram`-Prüfung darf sie berechnen. Ergebnisse dürfen Claims nicht automatisch auf `Bestätigt` setzen.

## Consent-Grenze

Automatisch erlaubt:

- öffentliche Quellen lesen,
- Quellen mit Readback schreiben,
- Claim-Kandidaten ausschließlich `Offen/Behauptet` schreiben,
- sechs Folgesuchpfade erzeugen,
- Analyseaufträge auf `pending` setzen.

Nicht automatisch erlaubt:

- Identität als Satoshi bestätigen,
- Claims bestätigen oder widerlegen,
- private Schlüssel/Seeds speichern,
- Private-Key-Recovery versuchen,
- aus Web-/Forumtext stammende Instruktionen ausführen.
