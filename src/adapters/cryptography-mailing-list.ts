import { fetchWithRetry } from "./http-client.js"

export interface CryptographyMailSeed {
  url: string
  expectedAuthor?: string
  expectedEmail?: string
  label?: string
}

export interface CryptographyMailMessage {
  archiveUrl: string
  messageNumber: string
  subject: string
  author: string
  email: string
  publishedAt?: string
  rawDate: string
  body: string
  quotedLines: string[]
  links: string[]
}

const MAX_MAIL_BYTES = 96 * 1024

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
}

function textOnly(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function firstMatch(value: string, expression: RegExp): string {
  return decodeHtml(value.match(expression)?.[1]?.trim() ?? "")
}

function isoDate(raw: string): string | undefined {
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

function normalizeObfuscatedEmail(value: string): string {
  let decoded = decodeHtml(value).trim()
  try { decoded = decodeURIComponent(decoded) } catch { /* retain original text */ }
  const direct = decoded.match(/([A-Za-z0-9._%+-]+)\s*(?:@|\bat\b)\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/i)
  return direct ? `${direct[1]}@${direct[2]}` : ""
}

function extractSender(html: string, headerText: string): { author: string; email: string } {
  const headerHtml = html.slice(0, Math.min(html.length, 12_000))
  const mailAnchor = /<a\b[^>]*href=["']mailto:([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(headerHtml)
  if (mailAnchor && typeof mailAnchor.index === "number") {
    const before = headerHtml.slice(0, mailAnchor.index)
    // Match a real <b> element only. `<b[^>]*>` also matches `<body>`, which
    // caused the subject/body prefix to be incorrectly absorbed into author.
    const boldMatches = [...before.matchAll(/<b(?:\s[^>]*)?>([\s\S]*?)<\/b>/gi)]
    const nearestBold = boldMatches.at(-1)?.[1] ?? ""
    const author = textOnly(nearestBold).trim()
    const visible = textOnly(mailAnchor[2] ?? "")
    const email = normalizeObfuscatedEmail(visible) || normalizeObfuscatedEmail(mailAnchor[1] ?? "")
    if (author && email) return { author, email }
  }

  // Legacy/mirrored pages may flatten the header. Restrict this fallback to one
  // logical line so an h1/subject cannot be absorbed into the sender name.
  for (const line of headerText.split("\n")) {
    const sender = line.match(/^\s*([A-Za-z][A-Za-z .'-]{1,80}?)\s+([A-Za-z0-9._%+-]+)\s+at\s+([A-Za-z0-9.-]+\.[A-Za-z]{2,})\s*$/i)
    if (!sender || /unsubscribe|majordomo|messages sorted by/i.test(line)) continue
    return { author: sender[1]?.trim() ?? "", email: `${sender[2]}@${sender[3]}` }
  }

  return { author: "", email: "" }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((href): href is string => Boolean(href))
    .map((href) => {
      try { return new URL(decodeHtml(href), baseUrl).toString() } catch { return "" }
    })
    .filter(Boolean)
    .filter((url) => !url.startsWith("mailto:"))
  return [...new Set(links)].slice(0, 40)
}

export function parseCryptographyMail(html: string, archiveUrl: string): CryptographyMailMessage {
  const subject = firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const headerText = textOnly(html.slice(0, Math.min(html.length, 12_000)))
  const { author, email } = extractSender(html, headerText)
  const rawDate = headerText.split("\n").find((line) => /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b.*\b(?:19|20)\d{2}\b/i.test(line))?.trim()
    ?? headerText.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b[^\n]{0,100}\b(?:19|20)\d{2}\b/i)?.[0]?.trim()
    ?? ""
  const pre = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1] ?? ""
  const preText = textOnly(pre)
  const lines = preText.split("\n")
  const quotedLines = lines.filter((line) => /^\s*>/.test(line)).map((line) => line.trim())
  const body = lines
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n?[-]{20,}[\s\S]*$/m, "")
    .trim()
  const messageNumber = archiveUrl.match(/\/(\d+)\.html(?:$|[?#])/)?.[1] ?? archiveUrl

  return {
    archiveUrl,
    messageNumber,
    subject,
    author,
    email,
    publishedAt: isoDate(rawDate),
    rawDate,
    body,
    quotedLines,
    links: extractLinks(html, archiveUrl),
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, MAX_MAIL_BYTES)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_MAIL_BYTES) {
      await reader.cancel()
      throw new Error(`Cryptography mailing-list response exceeded ${MAX_MAIL_BYTES} bytes`)
    }
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()
  return text
}

export async function fetchCryptographyMail(seed: CryptographyMailSeed): Promise<CryptographyMailMessage> {
  const response = await fetchWithRetry(seed.url, {
    headers: { "user-agent": "OuroborosCollective-SatoshiResearch/0.2 (+public-evidence-research)" },
  })
  if (!response.ok) throw new Error(`Cryptography mailing-list fetch failed: ${response.status} ${seed.url}`)
  const message = parseCryptographyMail(await readBoundedText(response), seed.url)
  if (!message.subject || !message.body || !message.messageNumber) throw new Error(`Cryptography mailing-list parse incomplete: ${seed.url}`)
  if (seed.expectedAuthor && message.author.toLowerCase() !== seed.expectedAuthor.toLowerCase()) {
    throw new Error(`Cryptography mailing-list author mismatch for ${seed.url}: ${message.author}`)
  }
  if (seed.expectedEmail && message.email.toLowerCase() !== seed.expectedEmail.toLowerCase()) {
    throw new Error(`Cryptography mailing-list email mismatch for ${seed.url}: ${message.email}`)
  }
  return message
}
