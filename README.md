# Game Fusion Dock

Game Fusion Dock is an AI-powered platform designed to hybridize web games. By analyzing the source code of two different games, it can extract the **visual layer** from one and the **logic layer** from another, synthesizing them into a new, functional hybrid game.

## 🚀 Key Features

- **Repository Analysis**: Automatically analyzes GitHub repositories to identify game architectures, rendering engines, and key source files.
- **AI-Powered Fusion**: Uses advanced LLMs to bridge disparate codebases, wiring visual components to game logic.
- **Instant Synthesis**: Real-time generation of hybrid source code with compatibility scoring and compiler warnings.
- **Archive Export**: Download the synthesized hybrid game as a ready-to-run ZIP archive.
- **Cyber-Punk UI**: An immersive, high-performance interface built with React, Tailwind CSS, and Framer Motion.

## 🛠️ Tech Stack

### Frontend
- **React 19** & **Vite**
- **Tailwind CSS** (v4)
- **Framer Motion** for animations
- **Radix UI** for accessible components
- **TanStack Query** (React Query) for state management

### Backend
- **Express 5**
- **TypeScript**
- **OpenAI Integration** for the Fusion Engine
- **Drizzle ORM** with **PostgreSQL**
- **Zod** for schema validation

### Tooling & Monorepo
- **pnpm workspaces** for monorepo management
- **Orval** for OpenAPI client & schema generation
- **esbuild** for high-speed builds

## 📂 Project Structure

```text
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   ├── game-fusion/        # Game Fusion Dock frontend (React+Vite)
│   └── mockup-sandbox/     # Component development sandbox
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI 3.1 specification & codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas
│   ├── db/                 # Database schema and Drizzle client
│   └── integrations-*/     # Shared integrations (OpenAI, etc.)
├── scripts/                # Development utility scripts
├── package.json            # Workspace root configuration
└── pnpm-workspace.yaml     # Workspace definition
```

## 🚥 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v24 recommended)
- [pnpm](https://pnpm.io/)

### Installation

```bash
pnpm install
```

### Running the Apps

To start the API server:
```bash
pnpm --filter @workspace/api-server run dev
```

To start the Game Fusion frontend:
```bash
pnpm --filter @workspace/game-fusion run dev
```

## 🏗️ Development Workflow

### Typechecking
Always run typecheck from the root to ensure cross-package references are resolved:
```bash
pnpm run typecheck
```

### API Code Generation
If the OpenAPI spec in `lib/api-spec/openapi.yaml` changes, regenerate the clients:
```bash
pnpm --filter @workspace/api-spec run codegen
```

### Building for Production
```bash
pnpm run build
```

## 📜 License
MIT
