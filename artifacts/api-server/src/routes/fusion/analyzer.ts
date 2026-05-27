import { openai } from "@workspace/integrations-openai-ai-server";

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
}

export async function analyzeGameRepo(
  repoData: RepoData,
  role: "graphics" | "logic"
): Promise<{ architecture: GameArchitecture; warnings: string[] }> {
  const codeFiles = repoData.files.filter(f => f.content);
  const assetFiles = repoData.files.filter(f => !f.content && f.type === "file");

  const fileSummary = codeFiles
    .slice(0, 30)
    .map(f => `### ${f.path}\n${(f.content || "").slice(0, 3000)}`)
    .join("\n\n---\n\n");

  const assetList = assetFiles.map(f => f.path).join("\n");

  const systemPrompt = `You are an expert game developer analyzing a GitHub game repository. 
Your task is to analyze the source code and classify files into clear architectural layers.

Crucially, you must distinguish between:
1. THE GRAPHICAL OVERLAY & VISUAL LAYER:
   - Rendering code (Canvas, WebGL, Three.js)
   - Asset loading and sprite mapping
   - World/Scene construction (tilemaps, background rendering)
   - Visual effects (particles, shaders)
   - UI/HUD components

2. THE LOGICAL DATA STRUCTURE & GAME MECHANICS:
   - Game state management (score, health, inventory)
   - Player controllers and movement algorithms
   - Physics engines and collision logic
   - AI behavior and NPC logic
   - Core game loop and event handling

Classification categories:
- visual: Everything related to rendering and the visual presentation (The "Skin")
- logic: Everything related to data structures, mechanics, and rules (The "Brain")
- asset: Raw media files (Images, Audio)
- config: Project meta-data (package.json, tsconfig)
- other: Documentation, tests, generic utilities

Return ONLY valid JSON:
{
  "renderingEngine": "string or null",
  "gameGenre": "string or null", 
  "summary": "string",
  "categorizedFiles": [
    { "path": "string", "category": "visual|logic|asset|config|other", "reason": "detailed reason explaining the role in the architecture" }
  ],
  "warnings": ["string"]
}`;

  const userPrompt = `Repository: ${repoData.owner}/${repoData.repo}
Description: ${repoData.description || "None"}
Total files: ${repoData.totalFiles}
This repo will contribute: ${role === "graphics" ? "VISUAL LAYER / GRAPHICAL OVERLAY" : "LOGIC LAYER / DATA STRUCTURE"}

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
    warnings?: string[];
  };

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON during analysis");
  }

  const warnings: string[] = parsed.warnings || [];
  const categorizedFiles = parsed.categorizedFiles || [];

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

  for (const af of assetFiles) {
    if (!categorizedFiles.some(c => c.path === af.path)) {
      assetCats.push({ path: af.path, category: "asset", reason: "Binary asset file", content: null });
    }
  }

  if (visualFiles.length === 0 && logicFiles.length === 0) {
    warnings.push("Could not identify clear game code structure. This may not be a web game repository.");
  }

  return {
    architecture: {
      renderingEngine: parsed.renderingEngine ?? null,
      gameGenre: parsed.gameGenre ?? null,
      summary: parsed.summary ?? "Game analysis complete",
      visualFiles,
      logicFiles,
      assetFiles: assetCats,
    },
    warnings,
  };
}
