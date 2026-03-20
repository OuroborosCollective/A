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
Your task is to analyze the source code and classify files into categories:
- visual: rendering code, canvas drawing, scene setup, level/world design, tilemap, sprites rendering
- logic: player controller, physics, collision detection, enemy AI, game state machine, scoring, input handling
- asset: images, audio, fonts, 3D models, sprite sheets
- config: package.json, config files, build scripts
- other: tests, documentation, utilities

You must also detect:
- The rendering engine/framework (e.g., "canvas2d", "three.js", "phaser", "pixi.js", "webgl", "babylon.js", "vanilla")
- The game genre (e.g., "platformer", "shooter", "puzzle", "rpg", "racing", "strategy")
- A brief summary of what the game does

Return ONLY valid JSON matching this exact structure:
{
  "renderingEngine": "string or null",
  "gameGenre": "string or null", 
  "summary": "string",
  "categorizedFiles": [
    { "path": "string", "category": "visual|logic|asset|config|other", "reason": "brief reason" }
  ],
  "warnings": ["string"]
}`;

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
