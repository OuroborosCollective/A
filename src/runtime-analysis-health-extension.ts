import {
  handleFetch as analysisHandleFetch,
  scheduled as analysisScheduled,
  type Env,
  type ScheduledLike,
} from "./runtime-analysis-extension.js"

export async function handleFetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === "/health") {
    const base = await analysisHandleFetch(request, env)
    const payload = await base.json() as Record<string, unknown>
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('analysis_queue','analysis_claims','analysis_results') ORDER BY name"
    ).all<{ name: string }>()
    const names = new Set((tables.results ?? []).map((row) => row.name))
    return Response.json({
      ...payload,
      analysisResultRuntime: {
        queue: names.has("analysis_queue"),
        claims: names.has("analysis_claims"),
        results: names.has("analysis_results"),
      },
    })
  }
  return analysisHandleFetch(request, env)
}

export async function scheduled(controller: ScheduledLike, env: Env): Promise<void> {
  await analysisScheduled(controller, env)
}

export type { Env, ScheduledLike }
