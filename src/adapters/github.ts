export interface GitHubCommit {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string; email: string; date: string } | null
    committer: { name: string; email: string; date: string } | null
  }
  author: { login: string } | null
  committer: { login: string } | null
}

export interface GitHubRelease {
  id: number
  tag_name: string
  name: string | null
  html_url: string
  body: string | null
  draft: boolean
  prerelease: boolean
  created_at: string
  published_at: string | null
  updated_at: string
  author: { login: string }
}

export interface CommitPage {
  commits: GitHubCommit[]
  hasMore: boolean
}

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN?.trim()
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "OuroborosCollective-Satoshi-Research-Worker",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export async function fetchBitcoinCoreCommits(input: {
  since: string
  until: string
  page: number
  perPage?: number
}): Promise<CommitPage> {
  const url = new URL("https://api.github.com/repos/bitcoin/bitcoin/commits")
  url.searchParams.set("sha", "master")
  url.searchParams.set("since", input.since)
  url.searchParams.set("until", input.until)
  url.searchParams.set("page", String(input.page))
  url.searchParams.set("per_page", String(input.perPage ?? 100))

  const response = await fetch(url, { headers: headers() })
  if (!response.ok) throw new Error(`GitHub commits request failed: ${response.status}`)
  const commits = (await response.json()) as GitHubCommit[]
  return {
    commits,
    hasMore: /rel="next"/.test(response.headers.get("link") ?? ""),
  }
}

export async function fetchBitcoinCoreReleases(): Promise<GitHubRelease[]> {
  const response = await fetch(
    "https://api.github.com/repos/bitcoin/bitcoin/releases?per_page=30",
    { headers: headers() }
  )
  if (!response.ok) throw new Error(`GitHub releases request failed: ${response.status}`)
  return (await response.json()) as GitHubRelease[]
}
