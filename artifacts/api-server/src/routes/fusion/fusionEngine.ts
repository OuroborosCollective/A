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

  if (archA.renderingEngine && archB.renderingEngine && archA.renderingEngine !== archB.renderingEngine) {
    warnings.push(
      `Rendering engine mismatch: Game A uses ${archA.renderingEngine}, Game B uses ${archB.renderingEngine}. ` +
      `The fusion will adapt Game B's logical data structures to work with Game A's graphical overlay.`
    );
  }

  const visualContext = archA.visualFiles
    .slice(0, 12)
    .map(f => `// FILE: ${f.path} (GRAPHICAL ROLE: ${f.reason})\n${truncateContent(f.content)}`)
    .join("\n\n---\n\n");

  const logicContext = archB.logicFiles
    .slice(0, 12)
    .map(f => `// FILE: ${f.path} (LOGICAL ROLE: ${f.reason})\n${truncateContent(f.content)}`)
    .join("\n\n---\n\n");

  const assetList = archA.assetFiles
    .slice(0, 30)
    .map(f => f.path)
    .join("\n");

  const systemPrompt = `You are an expert game architect who specializes in deep code synthesis.

Your mission is to create a NEW hybrid game by performing a "BRAIN TRANSPLANT":
1. Take the GRAPHICAL OVERLAY (The Skin) from Game A:
   - This includes all rendering code, scene setup, world construction, and visual UI.
   - Use Game A's sprites, animations, and camera logic.
2. Take the LOGICAL DATA STRUCTURE (The Brain) from Game B:
   - This includes player state, physics calculations, AI decision trees, and game rules.
   - Use Game B's movement logic and collision handling, but map them to Game A's world.

Synthesis Instructions:
- Create a unified HTML5/JS game environment.
- Map Game B's abstract "Player" or "Entity" logic to Game A's specific visual sprites.
- Ensure the core game loop uses Game B's rules but Game A's rendering timing.
- Bridge the data structures: If Game B expects a 2D array for collision, and Game A provides a tilemap, you must write the adapter code.
- No external dependencies except via CDN.

Return ONLY valid JSON:
{
  "files": [
    {
      "path": "index.html",
      "content": "full file content as string",
      "description": "How the skin of A was merged with the brain of B"
    }
  ],
  "summary": "Deep architectural summary of the fusion",
  "compatibilityScore": 0-100,
  "warnings": ["List specific technical hurdles encountered during the synthesis"]
}`;

  const userPrompt = `GAME A (PROVIDES GRAPHICAL OVERLAY): ${gameA.repoData.owner}/${gameA.repoData.repo}
Rendering: ${archA.renderingEngine || "unknown"}
Summary: ${archA.summary}

Visual/Graphical Files from Game A:
${visualContext || "No visual files identified"}

---

GAME B (PROVIDES LOGICAL DATA STRUCTURE): ${gameB.repoData.owner}/${gameB.repoData.repo}
Summary: ${archB.summary}

Logic/Mechanics Files from Game B:
${logicContext || "No logic files identified"}

---

Generate the complete hybrid source. Prioritize mapping Game B's rules into Game A's visual world.`;

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

  return {
    files: files.map(f => ({
      path: f.path,
      content: f.content,
      description: f.description || f.path,
    })),
    summary: parsed.summary || `Fused ${gameA.repoData.repo} graphics with ${gameB.repoData.repo} logic`,
    warnings: allWarnings,
    compatibilityScore: Math.min(100, Math.max(0, parsed.compatibilityScore ?? 50)),
  };
}
