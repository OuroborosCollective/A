import { openai } from "@workspace/integrations-openai-ai-server";
import { db, knowledge } from "@workspace/db";
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
          eq(knowledge.category, "fusion_strategy")
        )
      )
      .orderBy(desc(knowledge.confidence))
      .limit(5);

    if (similarKnowledge.length > 0) {
      knowledgeContext = "\n\n### Architectural Context from previous successful fusions:\n" +
        similarKnowledge.map(k => `- ${k.subCategory} (${k.tags?.join(", ")}): ${JSON.stringify(k.content)}`).join("\n");
    }
  } catch (err) {
    console.error("Failed to fetch knowledge context:", err);
  }

  const systemPrompt = `You are an expert game developer analyzing a GitHub game repository. 
Your task is to analyze the source code and strictly classify files into layers:
- visual (Visual Overlay): Rendering code, canvas/WebGL drawing, scene graph setup, world/level layout, UI/HUD, sprites rendering, and animations.
- logic (Logical Core): Game mechanics, state management, physics, collision math, enemy behavior (AI), input processing, and scoring.
- asset: Images, audio, fonts, 3D models, sprite sheets.
- config: package.json, config files, build scripts.
- other: tests, documentation, utilities.

Crucially, identify the "Interfaces" - where the logic layer tells the visual layer what to draw (e.g., event emitters, state subscriptions, or direct function calls like drawPlayer(x, y)).

You must also detect:
- The rendering engine/framework (e.g., "canvas2d", "three.js", "phaser", "pixi.js", "webgl", "babylon.js", "vanilla")
- The game genre (e.g., "platformer", "shooter", "puzzle", "rpg", "racing", "strategy")
- A brief summary of the game architecture and how the visual and logic layers communicate.

Return ONLY valid JSON matching this exact structure:
{
  "renderingEngine": "string or null",
  "gameGenre": "string or null", 
  "summary": "string",
  "categorizedFiles": [
    { "path": "string", "category": "visual|logic|asset|config|other", "reason": "brief reason" }
  ],
  "interfacePatterns": ["list of strings describing how layers interact"],
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
    renderingEngine?: string | null;
    gameGenre?: string | null;
    summary?: string;
    categorizedFiles?: Array<{ path: string; category: string; reason: string }>;
    interfacePatterns?: string[];
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
    },
    warnings,
  };

  // Save knowledge to Learning Matrix
  try {
    await db.insert(learningMatrix).values({
      repoIdentifier: repoId,
      renderingEngine: result.architecture.renderingEngine,
      gameGenre: result.architecture.gameGenre,
      analysisResult: result,
      // Detecting structure type could be more sophisticated
      structureType: repoData.files.some(f => f.path.startsWith("src/")) ? "src-driven" : "flat",
    }).onConflictDoUpdate({
      target: learningMatrix.repoIdentifier,
      set: {
        analysisResult: result,
        renderingEngine: result.architecture.renderingEngine,
        gameGenre: result.architecture.gameGenre,
        updatedAt: new Date(),
      }
    });
  } catch (err) {
    console.error("Failed to save to learning matrix:", err);
  }

  return result;
}
