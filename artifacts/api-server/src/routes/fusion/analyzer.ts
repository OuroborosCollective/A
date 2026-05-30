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
          eq(knowledge.category, "fusion_strategy"),
          eq(knowledge.category, "architecture_pattern")
        )
      )
      .orderBy(desc(knowledge.confidence))
      .limit(8);

    if (similarKnowledge.length > 0) {
      knowledgeContext = "\n\n### Architectural Context from previous successful fusions and patterns:\n" +
        similarKnowledge.map(k => `- ${k.category}/${k.subCategory} (${k.tags?.join(", ")}): ${JSON.stringify(k.content)}`).join("\n");
    }
  } catch (err) {
    console.error("Failed to fetch knowledge context:", err);
  }

  const systemPrompt = `You are an expert game developer specializing in structural analysis.
Your mission is to perform a surgical separation of a game repository into two distinct domains: "Logical Core" and "Graphical Overlay".

### Domain Definitions:
1. **Graphical Overlay (visual)**:
   - Responsibility: "How it looks and where things are drawn".
   - Includes: WebGL/Canvas setup, camera systems, particle effects, UI/HUD rendering, sprite/model loaders, animation interpolation, and scene graphs.
   - Key indicators: Use of 'ctx.draw', 'renderer.render', 'new THREE.Scene()', or DOM manipulation for visuals.

2. **Logical Core (logic)**:
   - Responsibility: "How it works and the rules of the world".
   - Includes: State machines, physics engines (velocity, gravity), collision detection math, AI decision trees, input mapping (keys to actions), inventory systems, and score calculations.
   - Key indicators: Pure functions, classes managing 'entities' or 'components', math-heavy utility files.

### Specific Identifications:
- **Logical Routes**: Trace the data. For example: "Input -> PlayerController -> EntityState -> CollisionSystem -> GlobalState".
- **Interface Patterns**: Identify the bridge. How does the logic tell the graphics what to do? Examples: "PubSub events", "Direct method calls on Sprite objects", "React-style state hooks", or "Shared mutable state object".

### Project Analysis:
Detect the programming language, rendering engine, and game genre. Analyze the folder structure to understand the project's organization.

Return ONLY valid JSON matching this exact structure:
{
  "language": "string",
  "renderingEngine": "string or null",
  "gameGenre": "string or null", 
  "summary": "string",
  "categorizedFiles": [
    { "path": "string", "category": "visual|logic|asset|config|other", "reason": "brief reason" }
  ],
  "interfacePatterns": ["detailed descriptions of interface bridges"],
  "logicalRoutes": ["explicit data flow paths"],
  "architecturePattern": {
    "type": "e.g. ECS, MVC, Event-Driven",
    "description": "Generalizable pattern of this repo",
    "folderStructure": "Brief description of the layout"
  },
  "detectedStructureType": "monorepo|src-driven|node-flat|flat",
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
    summary?: string;
    categorizedFiles?: Array<{ path: string; category: string; reason: string }>;
    interfacePatterns?: string[];
    logicalRoutes?: string[];
    architecturePattern?: {
      type: string;
      description: string;
      folderStructure: string;
    };
    detectedStructureType?: string;
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

  // Save knowledge to Learning Matrix and Knowledge table
  try {
    const paths = repoData.files.map(f => f.path);
    let structureType = "flat";

    // Heuristic detection
    if (paths.some(p => p.includes("package.json") && p.split("/").length > 2)) structureType = "monorepo";
    else if (paths.some(p => p.startsWith("src/"))) structureType = "src-driven";
    else if (paths.some(p => p.startsWith("lib/"))) structureType = "node-flat";

    // AI-assisted override if valid
    if (parsed.detectedStructureType && ["monorepo", "src-driven", "node-flat", "flat"].includes(parsed.detectedStructureType)) {
      structureType = parsed.detectedStructureType;
    }

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

    // Save generalized architecture pattern
    if (parsed.architecturePattern) {
      await db.insert(knowledge).values({
        category: "architecture_pattern",
        subCategory: result.architecture.renderingEngine || "vanilla",
        key: `pattern_${parsed.architecturePattern.type.toLowerCase().replace(/\s+/g, '_')}`,
        content: parsed.architecturePattern,
        tags: [parsed.language || "unknown", result.architecture.gameGenre || "unknown", result.architecture.renderingEngine || "unknown"],
        confidence: 85,
      }).onConflictDoUpdate({
        target: [knowledge.category, knowledge.key] as any, // Drizzle doesn't have a clean way for composite keys sometimes, but 'key' is unique-ish or we just insert
        set: {
          content: parsed.architecturePattern,
          updatedAt: new Date(),
        }
      }).catch(() => {
        // Fallback for unique constraint issues
        return db.insert(knowledge).values({
          category: "architecture_pattern",
          subCategory: result.architecture.renderingEngine || "vanilla",
          key: `pattern_${repoId.replace(/\//g, '_')}`,
          content: parsed.architecturePattern,
          tags: [parsed.language || "unknown", result.architecture.gameGenre || "unknown", result.architecture.renderingEngine || "unknown"],
          confidence: 80,
        });
      });
    }
  } catch (err) {
    console.error("Failed to save to learning matrix or knowledge:", err);
  }

  return result;
}
