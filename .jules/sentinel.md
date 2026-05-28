## 2025-05-15 - [Path Traversal in ZIP Generation]
**Vulnerability:** The application was vulnerable to path traversal (Zip Slip) when generating ZIP archives for download. Maliciously crafted file paths in the request body could lead to files being extracted outside the intended directory.
**Learning:** Even if the server doesn't write to its own disk, providing a ZIP with directory traversal paths can compromise the user's machine or environment where the ZIP is extracted.
**Prevention:** Always sanitize file paths intended for inclusion in archives. Use `path.normalize` followed by stripping leading directory traversal sequences (`..`) and leading slashes.
