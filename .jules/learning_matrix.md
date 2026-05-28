# Learning Matrix: Game Fusion Project

## Project Structure Insights
- **Monorepo Management**: The project uses `pnpm` workspaces. Core logic is split between `lib/` (shared libraries, database, AI integrations) and `artifacts/` (frontend, API server, mockup-sandbox).
- **Frontend Architecture**: Built with React, Tailwind CSS, and Framer Motion for a "Cyber" aesthetic. Uses custom `CyberUI` components.
- **Backend Architecture**: Express server with AI routes for repository analysis and game fusion.
- **Data Persistence**: Drizzle ORM with PostgreSQL. Schemas are defined in `lib/db/src/schema/`.

## Logical vs Graphical Distinction
- **Graphics Layer (Game A)**: Includes rendering code, canvas drawing, scene setup, world/level design (tilemaps), and visual assets (sprites, textures).
- **Logic Layer (Game B)**: Includes player mechanics, physics, collision detection, AI, game state management, scoring, and logical data structures.
- **Fusion Strategy**: The AI is instructed to bridge the two by wiring Game A's visual elements to Game B's game loop, replacing B's rendering calls with A's graphics.

## Language and Structure Patterns
- **TypeScript**: Used throughout the project with strict typing.
- **Zod**: Used for API validation (`lib/api-zod`).
- **AI Models**: Uses OpenAI models for analysis and code generation/fusion.
- **File Prioritization**: Critical files include entry points (`main`, `index`, `app`), game logic (`player`, `ai`, `physics`), and rendering (`render`, `scene`, `canvas`).

## Knowledge Retrieval (Learning Matrix)
- Analysis results are cached in the `learning_matrix` table keyed by `repo_identifier` (`owner/repo`).
- Cached data includes `renderingEngine`, `gameGenre`, and the full `analysisResult` JSON.
- This prevents redundant AI calls and speeds up the fusion workflow for previously seen repositories.
