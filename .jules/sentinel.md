## 2025-05-15 - [Path Traversal in ZIP Generation]
**Vulnerability:** The application was vulnerable to path traversal (Zip Slip) when generating ZIP archives for download. Maliciously crafted file paths in the request body could lead to files being extracted outside the intended directory.
**Learning:** Even if the server doesn't write to its own disk, providing a ZIP with directory traversal paths can compromise the user's machine or environment where the ZIP is extracted.
**Prevention:** Always sanitize file paths intended for inclusion in archives. Use `path.normalize` followed by stripping leading directory traversal sequences (`..`) and leading slashes.

## 2025-05-20 - [API Hardening and Information Leakage Prevention]
**Vulnerability:** The API server lacked rate limiting, making it vulnerable to DoS attacks on expensive AI-intensive endpoints. Furthermore, 500 Internal Server Errors were leaking raw error messages (via `err.message`) which could contain internal implementation details.
**Learning:** Defensive configuration like `trust proxy` and rate limiting are essential for protecting cloud-based AI resources from abuse. Error hardening is a critical "Defense in Depth" measure to prevent attackers from gaining insights into the application's internals through error side-channels.
**Prevention:** Always implement multi-tiered rate limiting (global and resource-specific). Ensure that all top-level error handlers in API routes sanitize error responses to return generic messages for unexpected server-side failures while maintaining detailed server-side logging.
