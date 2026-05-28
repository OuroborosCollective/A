import { openai } from "@workspace/integrations-openai-ai-server";

interface FileCategory {
  path: string;
  category: string;
  reason: string;
  content?: string | null;
}

interface GameArchitecture {
  renderingEngine?: string | null;
  gameGenre?: string | null;
  summary: string;
  visualFiles: FileCategory[];
  logicFiles: FileCategory[];
  assetFiles: FileCategory[];
}

interface AnalysisResult {
  architecture: GameArchitecture;
  warnings: string[];
}

interface RepoData {
  owner: string;
  repo: string;
  defaultBranch: string;
  files: Array<{ path: string; content?: string | null; size: number; type: string }>;
  totalFiles: number;
  fetchedFiles: number;
  description?: string | null;
}

interface GameInput {
  repoData: RepoData;
  analysis: AnalysisResult;
}

interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

interface FusionResult {
  files: GeneratedFile[];
  summary: string;
  warnings: string[];
  compatibilityScore: number;
}

function truncateContent(content: string | null | undefined, maxChars = 4000): string {
  if (!content) return "";
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + "\n\n[... truncated ...]";
}

export async function fuseGames(gameA: GameInput, gameB: GameInput): Promise<FusionResult> {
  const archA = gameA.analysis.architecture;
  const archB = gameB.analysis.architecture;

  const warnings: string[] = [
    ...gameA.analysis.warnings.map(w => `Game A: ${w}`),
    ...gameB.analysis.warnings.map(w => `Game B: ${w}`),
  ];

  // Check rendering engine compatibility
  if (archA.renderingEngine && archB.renderingEngine && archA.renderingEngine !== archB.renderingEngine) {
    warnings.push(
      `Rendering engine mismatch: Game A uses ${archA.renderingEngine}, Game B uses ${archB.renderingEngine}. ` +
      `The fusion will adapt Game B's logic to work with Game A's rendering system.`
    );
  }

  // Build context for AI
  const visualContext = archA.visualFiles
    .slice(0, 12)
    .map(f => `// FILE: ${f.path} (${f.reason})\n${truncateContent(f.content)}`)
    .join("\n\n---\n\n");

  const logicContext = archB.logicFiles
    .slice(0, 12)
    .map(f => `// FILE: ${f.path} (${f.reason})\n${truncateContent(f.content)}`)
    .join("\n\n---\n\n");

  const assetList = archA.assetFiles
    .slice(0, 30)
    .map(f => f.path)
    .join("\n");

  const systemPrompt = `You are an expert game developer who specializes in merging and remixing games.

Your task is to create a NEW hybrid game by:
1. Taking the VISUAL LAYER (graphical overlay, world, level design, rendering, sprites) from Game A
2. Taking the LOGIC LAYER (logical data structures, player mechanics, physics, collision, AI, scoring, game loop) from Game B
3. Combining them into a single working HTML5 web game

The output MUST be:
- A self-contained HTML5 game that runs in a browser (index.html + any supporting JS/CSS files)
- Fully functional with the visual world of Game A and the gameplay mechanics of Game B
- Written in clean, modern JavaScript
- No external dependencies that aren't available via CDN (if needed, use CDN links)

You MUST adapt and bridge the code:
- Wire Game A's visual elements to Game B's game loop
- Replace Game B's rendering calls with Game A's graphics/assets/visual style
- Ensure asset paths reference the actual assets from Game A (use relative paths)
- Handle the case where the rendering engines differ by adapting the approach

Return ONLY valid JSON with this structure:
{
  "files": [
    {
      "path": "index.html",
      "content": "full file content as string",
      "description": "brief description"
    }
  ],
  "summary": "description of what was merged and how",
  "compatibilityScore": 0-100,
  "warnings": ["any issues or limitations"]
}

Generate a COMPLETE, WORKING game. Do not use placeholder code. The index.html must be the entry point.`;

  const userPrompt = `GAME A (provides visuals): ${gameA.repoData.owner}/${gameA.repoData.repo}
Rendering Engine: ${archA.renderingEngine || "unknown"}
Game Genre: ${archA.gameGenre || "unknown"}  
Summary: ${archA.summary}

Visual Code Files from Game A:
${visualContext || "No visual files identified"}

Asset Files from Game A (reference these paths in your output):
${assetList || "No assets identified"}

---

GAME B (provides logic): ${gameB.repoData.owner}/${gameB.repoData.repo}
Rendering Engine: ${archB.renderingEngine || "unknown"}
Game Genre: ${archB.gameGenre || "unknown"}
Summary: ${archB.summary}

Logic Code Files from Game B:
${logicContext || "No logic files identified"}

---

Create the hybrid game. Use Game A's visual world and rendering style with Game B's game mechanics.
If assets from Game A are referenced, use relative paths (they will be in the same ZIP).
If the games are very different, create the best possible fusion explaining the tradeoffs.`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.3-codex",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    response_format: { type: "json_object" }
  });

  const content = response.choices[0]?.message?.content ?? "{}";

  let parsed: {
    files?: Array<{ path: string; content: string; description: string }>;
    summary?: string;
    compatibilityScore?: number;
    warnings?: string[];
  };

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("AI returned invalid JSON during fusion");
  }

  const files = parsed.files || [];
  const allWarnings = [...warnings, ...(parsed.warnings || [])];

  if (files.length === 0) {
    throw new Error("AI failed to generate any game files. Please try again.");
  }

  // Ensure index.html exists
  if (!files.some(f => f.path === "index.html" || f.path === "./index.html")) {
    allWarnings.push("No index.html was generated. You may need to manually create an entry point.");
  }

  return {
    files: files.map(f => ({
      path: f.path,
      content: f.content,
      description: f.description || f.path,
    })),
    summary: parsed.summary || `Fused ${gameA.repoData.repo} visuals with ${gameB.repoData.repo} logic`,
    warnings: allWarnings,
    compatibilityScore: Math.min(100, Math.max(0, parsed.compatibilityScore ?? 50)),
  };
}
