# Quellenregister

## Primär- und Archiv-Lanes

- GitHub REST: `bitcoin/bitcoin` Commits und Releases.
- Internet Archive CDX: frühe Bitcoin.org-, Whitepaper-, SourceForge- und historische Bitcoin-Forum-Seeds.
- Bitcointalk: historische Beiträge des Kontos `satoshi` (`u=3`) über `sa=showPosts`, niedrigfrequent und zustandsbehaftet eingelesen.
- Bitcointalk Recent: aktuelle öffentliche Forumbeiträge werden nur dann als Discovery-/Claim-Signal aufgenommen, wenn sie Satoshi-/Nakamoto- oder unmittelbar verwandte Begriffe enthalten.

## Bitcointalk-Wahrheitsregel

Ein Beitrag des historischen Kontos `satoshi` ist Primärevidenz dafür, dass dieses Forenkonto den erfassten Text veröffentlichte. Der Beitrag ist **kein kryptografischer Identitätsbeweis** und macht den Wahrheitsgehalt jeder darin enthaltenen Behauptung nicht automatisch zu Primärevidenz.

Beiträge anderer Nutzer werden als `Behauptet` erfasst. Aus Forumtexten erzeugte Claim-Kandidaten landen ausschließlich mit Status `Offen` im Claims & Evidence Ledger. Automatisches `Bestätigt`, eine automatische Identitätszuordnung oder Private-Key-Recovery sind durch die Standing-Authority-Grenze verboten.

Historische Bitcoin.org/SMF-URLs des Satoshi-Profils werden zusätzlich durch die Wayback-Lane historisiert, damit Migrationen und frühere Fassungen mit heutigen Bitcointalk-Seiten verglichen werden können.

## Aufmerksamkeitssignale

- Bitcoin Core Release Atom Feed.
- Bitcoin Optech Feed.
- CoinDesk RSS.
- Cointelegraph RSS.

Medienfeeds dienen nur als Discovery- und Hype-Signal. Sie werden nicht automatisch zu Primärevidenz hochgestuft.

## Folgesuche und Analyse

Für tiefenrelevante Quellen, insbesondere Bitcointalk, erzeugt die Runtime deterministisch:

1. offene Claim-Kandidaten,
2. sechs konkrete Folgesuchpfade in `Informationsfamilien & Folgesuchpfade`,
3. D1-Analyseaufträge für Quellen-Triangulation sowie passende Wolfram-Kandidaten wie Zeitreihen-, Kryptografie-, Graph-, Quantitativ- und Stylometrieanalyse.

Wolfram-Aufträge sind zunächst `pending`. Stylometrie-/Identitätsnähe verlangt Human Review und darf nur Ähnlichkeitsmetriken liefern, keine automatische Satoshi-Identifikation.

## Ausbau

Weitere Adapter sollen jeweils eigene Parser, Fixtures, Rate-Limits, Canonical IDs und Tests besitzen. Vorgesehene Lanes: Cryptography-Mailingliste, SourceForge SVN, Gerichtsakten, PGP-Keymaterial, reproduzierbare Bitcoin-Node-Abfragen und zulässige Transkripte.
