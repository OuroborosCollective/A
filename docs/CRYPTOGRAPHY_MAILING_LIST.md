# Cryptography Mailing List – Primärquellen-Lane

## Zweck

Die Runtime erfasst ausgewählte zeitgenössische Nachrichten aus dem originalen MetzDowd-Pipermail-Archiv der Cryptography-Mailingliste als Primärrecords für die Veröffentlichung und den dort archivierten Absender-/Datums-/Betreffkontext.

Die Archivseite ist **kein kryptografischer Identitätsbeweis** für die reale Person hinter einer E-Mail-Adresse und bestätigt nicht automatisch den Wahrheitsgehalt technischer oder biografischer Aussagen.

## Startkorpus

Deterministische Satoshi-Seeds umfassen insbesondere:

- 31. Oktober 2008 – `Bitcoin P2P e-cash paper`,
- technische Antworten aus November 2008 zu SPV/Skalierung, Proof-of-Work/Synchronisation, Difficulty/Emission, Gebühren, Byzantine Generals und Transaktionsmodell,
- Januar 2009 – Nachrichten rund um die Veröffentlichung von Bitcoin v0.1.

Für Satoshi-Seeds prüft der Adapter erwarteten Archivautor und `satoshi@vistomail.com`. Zitatzeilen werden vom eigenen Nachrichtentext getrennt, damit Aussagen anderer Listenteilnehmer nicht automatisch Satoshi zugeschrieben werden.

## Provenienz

Jeder Seed wird parallel auch als Ziel für Wayback und Common Crawl geführt. Damit kann ein wichtiger Record gegen mindestens folgende Ebenen trianguliert werden:

1. originale MetzDowd-Pipermail-Seite,
2. Wayback-Capture,
3. Common-Crawl-Capture/WARC-Metadaten,
4. verlinkte Originalquellen wie Whitepaper, bitcoin.org, SourceForge oder Code-/Release-Artefakte.

## Automatische Folgesuchen

Für jede relevante Mailinglisten-Nachricht entstehen sechs Recherchepfade:

1. Message-Nummer, Absender, Datum, Betreff und Inhalts-Hash sichern.
2. Thread-Kontext sowie Zitate rekonstruieren und eigene Aussagen von Fremdzitaten trennen.
3. Verlinkte Originale über Wayback/Common Crawl bis zur frühesten Fassung verfolgen.
4. Technische Aussagen mit Whitepaper, SourceForge, frühem Bitcoin-Code, Bitcointalk und späteren Core-Artefakten vergleichen.
5. Kryptografische und quantitative Aussagen in reproduzierbare Prüfaufträge zerlegen; keine Private-Key-Recovery.
6. Widersprüche, Korrekturen, andere Teilnehmer, Archivkopien sowie Zeitstempel-/Zeitzonen-/Header-Anomalien als neue Seeds erfassen.

## Analysequeue

Mindestens `research:source-triangulation` und `wolfram:temporal-analysis` werden erzeugt. Abhängig vom Inhalt können zusätzlich `wolfram:cryptographic-statistics`, `wolfram:quantitative-analysis` und nur mit Human Review `wolfram:stylometry` entstehen.

Wolfram-Aufträge bleiben `pending`, bis ein separater Executor sie tatsächlich ausführt. Ergebnisse dürfen keine automatische Satoshi-Identifikation erzeugen.

## Free-Runtime-Budget

Die direkte Mailinglisten-Lane verarbeitet höchstens eine Seed-Nachricht pro Invocation. Die bestehende 6-Stunden-Historical-Discovery-Cron wird ohne zusätzlichen Cloudflare-Cron in vier Slots erweitert: drei bestehende Archiv-/Discovery-Läufe, danach eine Mailinglisten-Nachricht.

Green State erfordert exakte Head-CI, einen revisionsgebundenen Preview-Fetch gegen den echten MetzDowd-Origin, D1-Receipts ohne Notion-Mutation und danach einen separaten Live-Lauf mit Notion-Readback.