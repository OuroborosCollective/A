## 2025-05-15 - [Path Traversal in ZIP Generation]
**Vulnerability:** The application was vulnerable to path traversal (Zip Slip) when generating ZIP archives for download. Maliciously crafted file paths in the request body could lead to files being extracted outside the intended directory.
**Learning:** Even if the server doesn't write to its own disk, providing a ZIP with directory traversal paths can compromise the user's machine or environment where the ZIP is extracted.
**Prevention:** Always sanitize file paths intended for inclusion in archives. Use `path.normalize` followed by stripping leading directory traversal sequences (`..`) and leading slashes.
## 2026-05-31 - [Information Leakage in API Error Responses]
**Vulnerability:** API endpoints were returning raw error messages and stack traces to clients on 500 Internal Server Errors, potentially exposing internal implementation details.
**Learning:** Returning detailed error messages directly from `err.message` can leak sensitive information about the server's environment or logic.
**Prevention:** Always mask unexpected internal errors with a generic "Internal Server Error" message in production responses while ensuring the full error is captured in server-side logs for debugging.
