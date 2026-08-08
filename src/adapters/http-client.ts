const DEFAULT_MAX_RETRIES = 2
const DEFAULT_BASE_DELAY_MS = 400

function retryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function retryDelayMs(response: Response | null, attempt: number, baseDelayMs: number): number {
  const retryAfter = response?.headers.get("retry-after")?.trim()
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(baseDelayMs, seconds * 1000)
    const at = Date.parse(retryAfter)
    if (!Number.isNaN(at)) return Math.max(baseDelayMs, at - Date.now())
  }
  return Math.min(8_000, baseDelayMs * 2 ** attempt)
}

export interface FetchOptions extends RequestInit {
  maxRetries?: number
  baseDelayMs?: number
}

export async function fetchWithRetry(url: string | URL, options: FetchOptions = {}): Promise<Response> {
  const maxRetries = Math.max(0, Math.min(5, options.maxRetries ?? DEFAULT_MAX_RETRIES))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS)
  const { maxRetries: _ignoredMax, baseDelayMs: _ignoredBase, ...init } = options
  const requestUrl = url instanceof URL ? url.toString() : url

  let lastResponse: Response | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(requestUrl, init)
    if (response.ok || !retryableStatus(response.status)) return response
    lastResponse = response
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(response, attempt, baseDelayMs)))
      continue
    }
  }
  return lastResponse as Response
}
