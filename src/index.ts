import { handleFetch, scheduled, type Env, type ScheduledLike } from "./runtime-analysis-health-extension.js"

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env)
  },
  async scheduled(controller: ScheduledLike, env: Env): Promise<void> {
    await scheduled(controller, env)
  },
}