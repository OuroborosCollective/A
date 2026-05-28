import { Router, type IRouter } from "express";
import {
  FetchRepoBody,
  AnalyzeRepoBody,
  FuseGamesBody,
  DownloadFusedGameBody,
} from "@workspace/api-zod";
import { fetchRepoTree, fetchFileContent, parseGitHubUrl, prioritizeFiles, isCodeFile } from "./github";
import { analyzeGameRepo } from "./analyzer";
import { fuseGames } from "./fusionEngine";
import archiver from "archiver";
import path from "path";
import { expensiveOperationRateLimiter } from "../../middlewares/rateLimiter";

const router: IRouter = Router();

router.post("/fusion/fetch-repo", async (req, res): Promise<void> => {
  const parsed = FetchRepoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { repoUrl } = parsed.data;
  const parsed2 = parseGitHubUrl(repoUrl);
  if (!parsed2) {
    res.status(400).json({ error: "Invalid GitHub URL. Please provide a URL like https://github.com/owner/repo" });
    return;
  }

  const { owner, repo } = parsed2;

  try {
    const { defaultBranch, description, tree } = await fetchRepoTree(owner, repo);

    const prioritized = prioritizeFiles(tree);
    const totalFiles = prioritized.length;

    // Fetch up to MAX_FILES_TO_FETCH code files
    const MAX_FILES = 40;
    const toFetch = prioritized.filter(f => isCodeFile(f.path)).slice(0, MAX_FILES);
    const assetFiles = prioritized.filter(f => !isCodeFile(f.path));

    req.log.info({ owner, repo, totalFiles, toFetch: toFetch.length }, "Fetching repo files");

    const filesWithContent = await Promise.all(
      toFetch.map(async (f) => {
        const content = await fetchFileContent(owner, repo, defaultBranch, f.path);
        return { path: f.path, content: content ?? null, size: f.size, type: "file" as const };
      })
    );

    const assetEntries = assetFiles.map(f => ({
      path: f.path,
      content: null,
      size: f.size,
      type: "file" as const
    }));

    const allFiles = [...filesWithContent, ...assetEntries];

    res.json({
      owner,
      repo,
      defaultBranch,
      description: description ?? null,
      files: allFiles,
      totalFiles: tree.filter(f => f.type === "blob").length,
      fetchedFiles: toFetch.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ error: message }, "Repo fetch failed");
    if (message.includes("not found") || message.includes("private") || message.includes("too large") || message.includes("rate limit")) {
      res.status(422).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

router.post("/fusion/analyze", expensiveOperationRateLimiter, async (req, res): Promise<void> => {
  const parsed = AnalyzeRepoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { repoData, role } = parsed.data;

  try {
    req.log.info({ repo: repoData.repo, role }, "Analyzing game repo");
    const result = await analyzeGameRepo(repoData, role as "graphics" | "logic");
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ error: message }, "Analysis failed");
    res.status(500).json({ error: message });
  }
});

router.post("/fusion/fuse", expensiveOperationRateLimiter, async (req, res): Promise<void> => {
  const parsed = FuseGamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { gameA, gameB } = parsed.data;

  try {
    req.log.info({ repoA: gameA.repoData.repo, repoB: gameB.repoData.repo }, "Fusing games");
    const result = await fuseGames(gameA, gameB);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ error: message }, "Fusion failed");
    res.status(500).json({ error: message });
  }
});

router.post("/fusion/download", async (req, res): Promise<void> => {
  const parsed = DownloadFusedGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fusionResult, gameAName, gameBName } = parsed.data;
  const zipName = `fused-${gameAName}-x-${gameBName}.zip`.replace(/[^a-zA-Z0-9\-_.]/g, "_");

  req.log.info({ files: fusionResult.files.length, zipName }, "Creating ZIP download");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", (err) => {
    req.log.error({ error: err.message }, "Archive error");
  });

  archive.pipe(res);

  for (const file of fusionResult.files) {
    // Sanitize the file path to prevent directory traversal within the ZIP
    // We want to ensure paths are relative and don't escape the archive root
    const sanitizedPath = path
      .normalize(file.path)
      .replace(/^(\.\.(\/|\\|$))+/, "")
      .replace(/^[\\\/]+/, "");
    archive.append(file.content, { name: sanitizedPath });
  }

  // Add a README with fusion summary
  const readme = `# Fused Game: ${gameAName} x ${gameBName}

## Summary
${fusionResult.summary}

## Compatibility Score
${fusionResult.compatibilityScore}/100

## Warnings
${fusionResult.warnings.length > 0 ? fusionResult.warnings.map(w => `- ${w}`).join("\n") : "None"}

## Files
${fusionResult.files.map(f => `- ${f.path}: ${f.description}`).join("\n")}

## How to run
1. Open index.html in a modern browser, or
2. Serve via a local server: npx serve .
`;
  archive.append(readme, { name: "README.md" });

  await archive.finalize();
});

export default router;
