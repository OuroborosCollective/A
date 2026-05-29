## 2025-05-15 - [Path Traversal in ZIP Generation]
**Vulnerability:** The application was vulnerable to path traversal (Zip Slip) when generating ZIP archives for download. Maliciously crafted file paths in the request body could lead to files being extracted outside the intended directory.
**Learning:** Even if the server doesn't write to its own disk, providing a ZIP with directory traversal paths can compromise the user's machine or environment where the ZIP is extracted.
**Prevention:** Always sanitize file paths intended for inclusion in archives. Use `path.normalize` followed by stripping leading directory traversal sequences (`..`) and leading slashes.

## 2026-05-29 - [Tiered Rate Limiting and Proxy Trust]
**Vulnerability:** Lack of rate limiting on resource-intensive AI fusion endpoints could lead to DoS or high API costs.
**Learning:** In proxy-heavy environments like Replit, `express-rate-limit` requires `app.set("trust proxy", 1)` to correctly identify client IPs; otherwise, all users share the same rate limit bucket.
**Prevention:** Implement tiered rate limiting (standard vs. intensive) and always configure proxy trust when deploying behind a load balancer or proxy.
