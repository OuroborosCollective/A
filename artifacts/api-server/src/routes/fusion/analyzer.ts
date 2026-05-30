import { openai } from "@workspace/integrations-openai-ai-server";
import { db, knowledge, learningMatrix } from "@workspace/db";
import { desc, eq, or } from "drizzle-orm";

interface RepoFile {
  path: string;
  content?: string | null;
  size: number;
  type: string;
}

interface RepoData {
  owner: string;
  repo: string;
  defaultBranch: string;
  files: RepoFile[];
  totalFiles: number;
  fetchedFiles: number;
  description?: string | null;
}

interface FileCategory {
  path: string;
  category: "visual" | "logic" | "asset" | "config" | "other";
  reason: string;
  content?: string | null;
}

interface GameArchitecture {
  renderingEngine: string | null;
  gameGenre: string | null;
  summary: string;
  visualFiles: FileCategory[];
  logicFiles: FileCategory[];
  assetFiles: FileCategory[];
  interfacePatterns?: string[];
  logicalRoutes?: string[];
}

export async function analyzeGameRepo(
  repoData: RepoData,
  role: "graphics" | "logic"
): Promise<{ architecture: GameArchitecture; warnings: string[] }> {
  // Check Learning Matrix for existing knowledge
  const repoId = `${repoData.owner}/${repoData.repo}`;
  try {
    const existing = await db.query.learningMatrix.findFirst({
      where: eq(learningMatrix.repoIdentifier, repoId),
    });

    if (existing) {
      const cached = existing.analysisResult as { architecture: GameArchitecture; warnings: string[] };
      // Note: We might want to re-run if role changed or content is outdated,
      // but for "speeding up next time" we return cached if available.
      return cached;
    }
  } catch (err) {
    console.error("Learning matrix lookup failed:", err);
  }

  const codeFiles = repoData.files.filter(f => f.content);
  const assetFiles = repoData.files.filter(f => !f.content && f.type === "file");

  const fileSummary = codeFiles
    .slice(0, 30)
    .map(f => `### ${f.path}\n${(f.content || "").slice(0, 3000)}`)
    .join("\n\n---\n\n");

  const assetList = assetFiles.map(f => f.path).join("\n");

  // Fetch relevant knowledge context
  let knowledgeContext = "";
  try {
    const similarKnowledge = await db
      .select()
      .from(knowledge)
      .where(
        or(
          eq(knowledge.category, "architecture"),
          eq(knowledge.category, "architecture_pattern"),
          eq(knowledge.category, "fusion_strategy")
        )
      )
      .orderBy(desc(knowledge.confidence))
      .limit(8);

    if (similarKnowledge.length > 0) {
      knowledgeContext = "\n\n### Architectural Context from previous analysis:\n" +
        similarKnowledge.map(k => `- ${k.category}/${k.subCategory} (${k.tags?.join(", ")}): ${JSON.stringify(k.content)}`).join("\n");
    }
  } catch (err) {
    console.error("Failed to fetch knowledge context:", err);
  }

  const systemPrompt = `You are an expert game developer analyzing a GitHub game repository. 
Your task is to analyze the source code and strictly classify files into layers to distinguish between "Logical Data Structure" and "Graphical Overlay":

### Architectural Definitions:
1.  **Logical Data Structure (Logical Core):** This is the "brain" of the game. It includes state management, game mechanics, physics engines, collision math, enemy AI behaviors, input processing (raw to intent), and scoring systems. It should be independent of how the game is drawn.
2.  **Graphical Overlay (Visual Layer):** This is the "skin" of the game. It includes rendering code (Canvas, WebGL, Three.js), scene graph setup, world/level layout, UI/HUD, sprites rendering, animations, and camera management.

### Key Components to Identify:
- **Logical Routes:** Define the core data flow paths. (e.g., "Input -> MovementSystem -> PlayerState", "AILogic -> EnemyState -> CollisionDetection").
- **Interface Patterns:** Identify the bridges where the Logical Core communicates with the Graphical Overlay (e.g., "State Observable -> Sprite Update", "Logic Event -> Particle Trigger").
- **Architecture Pattern:** Extract a generalized pattern name for this project's structure (e.g., "Component-Based", "MVC", "State-Machine Driven", "Entity-Component-System").

### Classification Categories:
- visual: Graphical Overlay files.
- logic: Logical Data Structure files.
- asset: Images, audio, fonts, 3D models.
- config: package.json, build scripts, environment configs.
- other: tests, docs, utilities.

You must also detect:
- The primary programming language (e.g., "typescript", "javascript", "python", "lua").
- The rendering engine/framework (e.g., "canvas2d", "three.js", "phaser", "pixi.js", "webgl", "babylon.js", "vanilla").
- The game genre (e.g., "platformer", "shooter", "puzzle", "rpg", "racing", "strategy").
- A brief summary of the game architecture.

Return ONLY valid JSON matching this exact structure:
{
  "language": "string",
  "renderingEngine": "string or null",
  "gameGenre": "string or null", 
  "architecturePattern": "string",
  "summary": "string",
  "categorizedFiles": [
    { "path": "string", "category": "visual|logic|asset|config|other", "reason": "brief reason" }
  ],
  "interfacePatterns": ["list of strings describing how layers interact"],
  "logicalRoutes": ["list of strings describing data flow routes"],
  "warnings": ["string"]
}

${knowledgeContext}`;

  const userPrompt = `Repository: ${repoData.owner}/${repoData.repo}
Description: ${repoData.description || "None"}
Total files: ${repoData.totalFiles}
This repo will contribute: ${role === "graphics" ? "VISUAL LAYER (graphics, world, levels)" : "LOGIC LAYER (game mechanics, physics, AI)"}

Asset files (not included in content):
${assetList || "None"}

Source code files:
${fileSummary || "No code files found"}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content ?? "{}";

  let parsed: {
    language?: string;
    renderingEngine?: string | null;
    gameGenre?: string | null;
    architecturePattern?: string;
    summary?: string;
    categorizedFiles?: Array<{ path: string; category: string; reason: string }>;
    interfacePatterns?: string[];
    logicalRoutes?: string[];
    warnings?: string[];
  };

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON during analysis");
  }

  const warnings: string[] = parsed.warnings || [];
  const categorizedFiles = parsed.categorizedFiles || [];

  // Build file maps enriched with content
  const contentMap = new Map(repoData.files.map(f => [f.path, f.content]));

  const visualFiles: FileCategory[] = [];
  const logicFiles: FileCategory[] = [];
  const assetCats: FileCategory[] = [];

  for (const f of categorizedFiles) {
    const entry: FileCategory = {
      path: f.path,
      category: (["visual", "logic", "asset", "config", "other"].includes(f.category) ? f.category : "other") as FileCategory["category"],
      reason: f.reason,
      content: contentMap.get(f.path) ?? null,
    };

    if (f.category === "visual") visualFiles.push(entry);
    else if (f.category === "logic") logicFiles.push(entry);
    else if (f.category === "asset") assetCats.push(entry);
  }

  // Add any remaining asset files not already categorized
  // Optimization: Use a Set for O(1) path lookups to improve performance from O(N*M) to O(N+M)
  const categorizedPaths = new Set(categorizedFiles.map(c => c.path));
  for (const af of assetFiles) {
    if (!categorizedPaths.has(af.path)) {
      assetCats.push({ path: af.path, category: "asset", reason: "Binary asset file", content: null });
    }
  }

  if (visualFiles.length === 0 && logicFiles.length === 0) {
    warnings.push("Could not identify clear game code structure. This may not be a web game repository.");
  }

  const result = {
    architecture: {
      renderingEngine: parsed.renderingEngine ?? null,
      gameGenre: parsed.gameGenre ?? null,
      summary: parsed.summary ?? "Game analysis complete",
      visualFiles,
      logicFiles,
      assetFiles: assetCats,
      interfacePatterns: parsed.interfacePatterns ?? [],
      logicalRoutes: parsed.logicalRoutes ?? [],
    },
    warnings,
  };

  // Save knowledge to Learning Matrix and generalized patterns to Knowledge
  try {
    let structureType = "flat";
    const paths = repoData.files.map(f => f.path);
    if (paths.some(p => p.includes("package.json") && p.split("/").length > 2)) structureType = "monorepo";
    else if (paths.some(p => p.includes("apps/") || p.includes("packages/"))) structureType = "monorepo";
    else if (paths.some(p => p.startsWith("src/"))) structureType = "src-driven";
    else if (paths.some(p => p.startsWith("lib/"))) structureType = "node-flat";
    else if (paths.some(p => p.includes("Assets/") || p.endsWith(".unity"))) structureType = "unity";
    else if (paths.some(p => p.endsWith(".tscn") || p.endsWith(".godot"))) structureType = "godot";

    // 1. Update Learning Matrix (Repo-specific)
    await db.insert(learningMatrix).values({
      repoIdentifier: repoId,
      language: parsed.language || "unknown",
      renderingEngine: result.architecture.renderingEngine,
      gameGenre: result.architecture.gameGenre,
      analysisResult: result,
      structureType,
    }).onConflictDoUpdate({
      target: learningMatrix.repoIdentifier,
      set: {
        language: parsed.language || "unknown",
        analysisResult: result,
        renderingEngine: result.architecture.renderingEngine,
        gameGenre: result.architecture.gameGenre,
        structureType,
        updatedAt: new Date(),
      }
    });

    // 2. Extract Generalized Pattern (Global Knowledge)
    if (parsed.architecturePattern) {
      await db.insert(knowledge).values({
        category: "architecture_pattern",
        subCategory: parsed.architecturePattern,
        key: `pattern_${parsed.architecturePattern.toLowerCase().replace(/\s+/g, "_")}`,
        content: {
          summary: result.architecture.summary,
          interfacePatterns: result.architecture.interfacePatterns,
          logicalRoutes: result.architecture.logicalRoutes,
          language: parsed.language,
          structureType
        },
        tags: [parsed.language || "unknown", structureType, result.architecture.renderingEngine || "unknown"],
        confidence: 80,
      }).onConflictDoNothing(); // Don't overwrite global patterns constantly, or use update logic if preferred
    }
  } catch (err) {
    console.error("Failed to save to learning matrix or knowledge:", err);
  }

  return result;
}
