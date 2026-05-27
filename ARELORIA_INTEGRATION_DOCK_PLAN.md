# Areloria Integration Dock Plan

This repository can be reused as an Areloria / WASD developer tool.

The original idea was Game Fusion Dock: analyze two game repositories, separate visual and logic layers, and produce a downloadable hybrid archive.

For WASD, the safer and more useful direction is an Integration Dock.

## New Purpose

Turn this project into a controlled import and analysis cockpit for Areloria.

```text
Old purpose:
Game A graphics + Game B logic = hybrid game

New purpose:
External repo or asset pack -> analysis -> risk report -> adapter plan -> WASD import PR
```

## What To Reuse

Reuse these existing concepts:

```text
repository fetch
repository analysis
visual file detection
logic file detection
asset file detection
compatibility score
warnings
ZIP export
cyber admin UI
```

The UI already has two repository panels and a central action flow. This can become an Areloria import cockpit.

## What Not To Do

Do not merge arbitrary games into WASD automatically.

Do not copy the whole system into the game client.

Do not allow uncontrolled code fusion into runtime gameplay.

WASD must stay deterministic and reviewable.

## Target Areloria Use Cases

```text
1. Asset pack import review
2. GLB import review
3. 2D atlas import review
4. Weapon Forge import review
5. Biome pack import review
6. NPC logic import review
7. Quest logic import review
8. Monorepo dependency review
9. Deployment workflow review
10. VPS runtime health review
```

## Proposed Rename

```text
Game Fusion Dock
-> Areloria Integration Dock
```

## Target Flow

```text
1. User enters external repository or asset source
2. Dock fetches file tree and key files
3. Dock classifies files as visual, logic, asset, config, or other
4. Dock calculates compatibility with WASD
5. Dock emits warnings
6. Dock generates an adapter plan
7. Dock prepares a ZIP or GitHub PR payload
8. Human reviews before merge
```

## WASD Boundary

The Dock is not part of the player runtime.

It belongs to the developer/admin toolchain.

```text
Dock = analyze and prepare imports
WASD = consume reviewed imports
```

## First Implementation Step

Add a WASD target mode.

In WASD target mode, the Dock should classify imports against the current WASD structure:

```text
apps/client-2d/public/2d-assets
asset-packs/2d
client/src/engine
server/src/core
server/src/modules
.github/workflows
pnpm-workspace.yaml
package.json
```

## Required Output For Each Import

```text
compatibilityScore
warnings
filesToAdd
filesToModify
adapterPlan
riskLevel
manualReviewRequired
```

## Safety Rules

```text
No direct main commits
No runtime gameplay mutation without PR
No dependency additions without explanation
No generatedAt-only diffs
No asset path changes without route validation
No server logic import without tests
```

## Best First Product

The first useful product is not automatic game fusion.

The first useful product is:

```text
WASD Import Report Generator
```

It should answer:

```text
Can this external repo or asset pack help WASD?
What files are useful?
Where would they go?
What breaks if we import them?
What adapter is required?
```

## Summary

This repo is useful, but its role should change.

Use it as Areloria's Project Surgery Dock: a reviewable import, adapter, and analysis tool for the WASD ecosystem.
