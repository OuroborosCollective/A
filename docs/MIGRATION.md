# Repository-Neuausrichtung

Das Repository war zuvor **Game Fusion Dock**, ein React-/Express-/Drizzle-Monorepo zur Kombination von Spiele-Repositories.

Kanonischer Ausgangspunkt der Neuausrichtung:

- vorheriger `main`: `3f1b0f8154edd311967afabba167477ac6e94836`
- Ersatzstrategie: neuer vollständiger Root-Tree auf isoliertem Branch
- Sicherheitsstrategie: Draft-PR; kein direkter Force-Push auf `main`

Die alte Historie bleibt über den Parent-Commit und bestehende Branches rückholbar. Der neue Commit entfernt den alten Tree aus dem Zielbranch, löscht jedoch nicht die Git-Historie.
