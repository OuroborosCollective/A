# Runtime Gate

Diese Datei markiert die zweite, runtime-fähige Stufe der Cryptography-Mailinglisten-Integration.

Green State erfordert:

- exakte PR-Head-CI grün,
- geschützter `/run/mailinglist`-Endpoint,
- Preview-Deploy derselben Revision,
- echter Fetch der originalen MetzDowd-Seite,
- `lane=mailinglist`, `mode=preview`, `count=1`,
- nur Preview-Receipts für Notion/Claims/Folgesuche/Analysequeue,
- anschließend separater Live-Deploy mit Notion-Readback,
- erst danach gilt der 6-Stunden-Viererzyklus als produktiv belegt.
