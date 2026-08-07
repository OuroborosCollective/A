# Quellenregister

## Primär-, Discovery- und Archiv-Lanes

- GitHub REST: `bitcoin/bitcoin` Commits und Releases.
- Internet Archive CDX / Wayback: frühe Bitcoin.org-, Whitepaper-, SourceForge- und historische Bitcoin-Forum-Seeds. Wayback-Replays sind menschenlesbare Archivfassungen; sie belegen die archivierte Fassung, nicht automatisch deren Wahrheitsgehalt.
- SourceForge Bitcoin: historische Projektseite, Project News, Bitcoin-v0.1-Meldung vom Januar 2009, Development-Process-Meldung, alter Code-/SVN-Baum und Files-Archiv. SourceForge ist Primärevidenz für den dortigen Projektrecord bzw. die dortige Veröffentlichung, nicht automatisch für jede darin enthaltene Sachbehauptung.
- Wikipedia: revisionsgebundene Artikel zu `Bitcoin` und `Satoshi Nakamoto` zunächst in englischer und deutscher Sprachversion. Die MediaWiki Action API liefert Revision-ID, Zeitstempel, externe Referenzen und Sprachlinks. Wikipedia ist ausschließlich Sekundärquelle/Referenzgraph und wird niemals automatisch zu Primärevidenz hochgestuft.
- Common Crawl: unabhängiges globales Webarchiv über CDXJ-/URL-Indizes und WARC-Rohdaten. Für die frühe Bitcoin-Recherche werden insbesondere die öffentlichen Kollektionen `CC-MAIN-2008-2009`, `CC-MAIN-2009-2010` und `CC-MAIN-2012` gegen Bitcoin.org-/SourceForge-Seeds abgefragt. WARC-Datei, Offset, Länge, Digest und Capture-Zeit werden erhalten. Common Crawl ist breit, aber nicht vollständig.
- Bitcointalk: historische Beiträge des Kontos `satoshi` (`u=3`) über `sa=showPosts`, niedrigfrequent und zustandsbehaftet eingelesen.
- Bitcointalk Recent: aktuelle öffentliche Forumbeiträge werden nur dann als Discovery-/Claim-Signal aufgenommen, wenn sie Satoshi-/Nakamoto- oder unmittelbar verwandte Begriffe enthalten.

## Kostenfreie Historical-Discovery-Rotation

Cloudflare Free stellt nur eine begrenzte Anzahl Cron Trigger bereit. Die bestehende 6-Stunden-Archiv-Cron wird deshalb als zustandsbehaftete Rotation genutzt:

1. Wayback,
2. SourceForge,
3. Wikipedia,
4. Common Crawl,
5. danach wieder Wayback.

Pro Invocation wird nur ein Provider in einem kleinen Batch abgefragt. Dadurch entstehen keine zusätzlichen Cron Trigger und die Zahl externer Subrequests bleibt begrenzt. Die Provider können über geschützte `/run/wayback`, `/run/sourceforge`, `/run/wikipedia` und `/run/commoncrawl` Endpunkte auch einzeln ausgeführt werden.

## Archiv-Wahrheitsregel

Es gibt kein einzelnes öffentliches Archiv, das garantiert alle Artikel aller Länder und aller Zeiten vollständig enthält. Die Runtime verwendet daher mindestens zwei unabhängige Archivsysteme mit unterschiedlichen Eigenschaften:

- **Internet Archive Wayback Machine** für menschenlesbare Replay-Snapshots historischer Webseiten,
- **Common Crawl** für frei zugängliche globale Crawl-Indizes sowie WARC/WET/WAT-Roharchive und reproduzierbare Capture-Metadaten.

Ein Archivtreffer bedeutet: Eine bestimmte Fassung wurde zu einem bestimmten Zeitpunkt erfasst. Er beweist nicht automatisch das ursprüngliche Publikationsdatum, die Autorschaft oder den Wahrheitsgehalt. Für wichtige Artikel sollen Wayback und Common Crawl gegeneinander geprüft und nach Möglichkeit mit der ursprünglichen Publikation oder weiteren unabhängigen Archiven ergänzt werden.

## SourceForge-Wahrheitsregel

Ein historischer SourceForge-News-, Files- oder Code-Eintrag belegt zunächst die entsprechende Aktivität innerhalb des damaligen Bitcoin-Projekts. Automatisch extrahierte Aussagen werden weiterhin nur als `Offen` + `Behauptet` in den Claims & Evidence Ledger geschrieben. SourceForge-Folgesuchen prüfen insbesondere alte SVN-Revisionen, Releases, Artefakte, Migrationen zu bitcoin.org/GitHub und Archivkopien.

## Wikipedia-Wahrheitsregel

Wikipedia dient als Suchbeschleuniger und Referenzgraph. Eine Aussage wird nicht dadurch stärker, dass sie in vielen Sprachversionen vorkommt. Relevante Aussagen werden auf die zitierte Originalquelle zurückgeführt; Referenzen werden in Wayback/Common Crawl gesucht; Revisions- und Sprachunterschiede können neue Recherche-Seeds erzeugen. Wikipedia selbst wird nicht automatisch als Bestätigung eines Identitätsclaims gewertet.

## Bitcointalk-Wahrheitsregel

Ein Beitrag des historischen Kontos `satoshi` ist Primärevidenz dafür, dass dieses Forenkonto den erfassten Text veröffentlichte. Der Beitrag ist **kein kryptografischer Identitätsbeweis** und macht den Wahrheitsgehalt jeder darin enthaltenen Behauptung nicht automatisch zu Primärevidenz.

Beiträge anderer Nutzer werden als `Behauptet` erfasst. Aus Forumtexten erzeugte Claim-Kandidaten landen ausschließlich mit Status `Offen` im Claims & Evidence Ledger. Automatisches `Bestätigt`, eine automatische Identitätszuordnung oder Private-Key-Recovery sind durch die Standing-Authority-Grenze verboten.

Historische Bitcoin.org/SMF-URLs des Satoshi-Profils werden zusätzlich durch die Archiv-Lanes historisiert, damit Migrationen und frühere Fassungen mit heutigen Bitcointalk-Seiten verglichen werden können.

## Aufmerksamkeitssignale

- Bitcoin Core Release Atom Feed.
- Bitcoin Optech Feed.
- CoinDesk RSS.
- Cointelegraph RSS.

Medienfeeds dienen nur als Discovery- und Hype-Signal. Sie werden nicht automatisch zu Primärevidenz hochgestuft.

## Folgesuche und Analyse

Für tiefenrelevante Quellen erzeugt die Runtime deterministisch:

1. soweit der Quellentyp dafür geeignet ist offene Claim-Kandidaten,
2. sechs quellentyp-spezifische Folgesuchpfade in `Informationsfamilien & Folgesuchpfade`,
3. D1-Analyseaufträge für Quellen-Triangulation sowie passende Wolfram-Kandidaten wie Zeitreihen-, Kryptografie-, Graph-, Quantitativ- und Stylometrieanalyse.

Beispiele:

- SourceForge → Originalrecord → Wayback/Common Crawl → bitcoin.org/Bitcointalk/Mailingliste → SVN/Release-Artefakte → Hash-/Signaturprüfung → spätere Migration/Korrektur.
- Wikipedia → permanente Revision → zitierte Originalquellen → Wayback/Common Crawl → Sprach-/Revisionsvergleich → Primärevidenz → entfernte oder widersprechende Referenzen.
- Webarchiv → Capture/Digest → zweites Archiv → Original-Publikationszeit → Entitäten/Claims → Syndizierung/Übersetzung → Korrekturen/Gegenbelege.

Wolfram-Aufträge sind zunächst `pending`. Stylometrie-/Identitätsnähe verlangt Human Review und darf nur Ähnlichkeitsmetriken liefern, keine automatische Satoshi-Identifikation.

## Ausbau

Weitere Adapter sollen jeweils eigene Parser, Fixtures, Rate-Limits, Canonical IDs und Tests besitzen. Vorgesehene Lanes: Cryptography-Mailingliste, Gerichtsakten, PGP-Keymaterial, reproduzierbare Bitcoin-Node-Abfragen, weitere nationale Bibliotheks-/Zeitungsarchive und zulässige Transkripte.
