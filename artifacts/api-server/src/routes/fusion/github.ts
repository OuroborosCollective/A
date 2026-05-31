import { logger } from "../../lib/logger";

const GITHUB_API = "https://api.github.com";
const MAX_FILE_SIZE = 100_000; // 100KB per file
const MAX_FILES_TO_FETCH = 40;
const CODE_EXTENSIONS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
  ".html", ".css", ".json", ".yaml", ".yml",
  ".py", ".lua", ".c", ".cpp", ".h", ".glsl", ".vert", ".frag",
  ".md", ".txt"
]);
const ASSET_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
  ".mp3", ".ogg", ".wav", ".mp4", ".webm",
  ".ttf", ".woff", ".woff2", ".eot",
  ".obj", ".gltf", ".glb", ".fbx"
]);

// Pre-compiled regex for file prioritization scoring
const ENTRY_REGEX = /main|game|index|app|route/i;
const LOGIC_REGEX = /player|enemy|ai|physics|collision/i;
const STATE_REGEX = /state|store|schema|db|model/i;
const WORLD_REGEX = /world|level|map|tile/i;
const RENDER_REGEX = /render|scene|canvas|sprite|draw/i;
const CONFIG_REGEX = /(?:package\.json|readme\.md)$|config/i;

export interface ScoredFile {
  path: string;
  type: string;
  size: number;
  score: number;
  isCode: boolean;
}

export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1] };
  } catch {
    return null;
  }
}

export async function fetchRepoTree(owner: string, repo: string): Promise<{
  defaultBranch: string;
  description: string | null;
  tree: Array<{ path: string; type: string; size: number }>;
}> {
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };

  const repoRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    const text = await repoRes.text();
    logger.warn({ status: repoRes.status, body: text }, "GitHub repo fetch failed");
    if (repoRes.status === 404) throw new Error("Repository not found or is private");
    if (repoRes.status === 403) throw new Error("GitHub API rate limit exceeded. Please try again later.");
    throw new Error(`GitHub API error: ${repoRes.status}`);
  }
  const repoInfo = await repoRes.json() as { default_branch: string; description: string | null; size: number };

  if (repoInfo.size > 50_000) {
    throw new Error("Repository is too large to process (> 50MB). Please use a smaller game repo.");
  }

  const defaultBranch = repoInfo.default_branch;

  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) {
    throw new Error(`Failed to fetch repo tree: ${treeRes.status}`);
  }
  const treeData = await treeRes.json() as { tree: Array<{ path: string; type: string; size: number }> };

  return {
    defaultBranch,
    description: repoInfo.description,
    tree: treeData.tree || [],
  };
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string
): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > MAX_FILE_SIZE) {
      return text.slice(0, MAX_FILE_SIZE) + "\n\n[... file truncated ...]";
    }
    return text;
  } catch {
    return null;
  }
}

export function isCodeFile(path: string): boolean {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return false;
  const ext = path.slice(lastDot).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

export function isAssetFile(path: string): boolean {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return false;
  const ext = path.slice(lastDot).toLowerCase();
  return ASSET_EXTENSIONS.has(ext);
}

export function prioritizeFiles(files: Array<{ path: string; type: string; size: number }>): ScoredFile[] {
  const scored = files
    .filter(f => f.type === "blob")
    .map(f => {
      let score = 0;
      const p = f.path;
      const pLower = p.toLowerCase();
      const isCode = isCodeFile(p);

      if (isCode) score += 10;

      // Critical entry points and routing
      if (ENTRY_REGEX.test(pLower)) score += 7;

      // Logical structures and data management
      if (LOGIC_REGEX.test(pLower)) score += 5;
      if (STATE_REGEX.test(pLower)) score += 5;

      // Graphical and world layout
      if (WORLD_REGEX.test(pLower)) score += 4;
      if (RENDER_REGEX.test(pLower)) score += 4;

      // Project structure (src/ check is case-insensitive for robustness)
      if (pLower.includes("src/") || !p.includes("/")) score += 2;
      if (CONFIG_REGEX.test(pLower)) score += 3;

      return { ...f, score, isCode };
    })
    .sort((a, b) => b.score - a.score);
  return scored;
}
