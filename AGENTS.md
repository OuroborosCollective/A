# Learning Matrix & Project Knowledge

This file serves as a persistent knowledge base for agents and developers working on the Game Fusion Dock repository. It captures "learned" patterns, architectural decisions, and project-specific workflows to accelerate future work.

## 🏗️ Project Architecture

### Monorepo Structure
- **Artifacts**: Deployable apps (`api-server`, `game-fusion`).
- **Lib**: Shared libraries for DB, API specs, and OpenAI integrations.
- **API Spec**: Single source of truth in `lib/api-spec/openapi.yaml`. Orval generates Zod schemas and React Query hooks.

### The Fusion Engine
The core value proposition is the **Brain Transplant** synthesis:
- **Game A**: Provides the "Graphical Overlay" (Rendering, Assets, World UI).
- **Game B**: Provides the "Logical Data Structure" (State, Rules, Physics, NPC AI).
- **Synthesis**: The AI acts as an architect to map Game B's logical entities to Game A's visual representations.

## 🛠️ Learned Workflows

### Typechecking & Builds
- **Root-First**: Always run `pnpm run typecheck` or `pnpm run build` from the root. The composite TypeScript project relies on built declarations from shared libs.
- **Port Constraints**: `artifacts/mockup-sandbox` requires `PORT` and `BASE_PATH` environment variables for builds and dev.

### AI Model Management
- **Analysis**: Uses `gpt-5.2` for classification.
- **Fusion**: Uses `gpt-5.3-codex` for high-fidelity code generation.

## 📝 Coding Standards
- **Strict Types**: Ensure optional types in OpenAPI match the generated Zod/TS interfaces (e.g., handling `undefined` vs `null`).
- **Responsive UI**: Use Tailwind and Lucide-React for the cyber-punk aesthetic.

## 🧠 Future Optimization Targets
- **Learning Matrix Expansion**: Train the fusion engine with specific "Bridge Patterns" for common engine mismatches (e.g., Phaser to Canvas2D).
- **Logical Route Detection**: Improve detection of game "routes" (Levels/Scenes) during the analysis phase.
