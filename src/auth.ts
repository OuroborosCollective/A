export function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  if (left.byteLength !== right.byteLength) {
    // Walk both buffers to keep work roughly proportional regardless of length.
    let diff = 1
    const max = Math.max(left.byteLength, right.byteLength)
    for (let i = 0; i < max; i += 1) {
      diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
    }
    return diff === 0
  }
  let diff = 0
  for (let i = 0; i < left.byteLength; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}

export function extractBearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
}

export interface Authorizable {
  ADMIN_TOKEN?: string
}

export function isAuthorized<T extends Authorizable>(request: Request, env: T): boolean {
  const configured = env.ADMIN_TOKEN?.trim()
  if (!configured) return false
  return timingSafeEqual(extractBearerToken(request), configured)
}
