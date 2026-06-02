## 2026-06-02 - [Standardizing Interactive Elements]
**Learning:** Tooltip triggers on non-button elements (like `div`) are inaccessible to keyboard users and screen readers unless explicitly given roles and tab indices. Using semantic `button` elements with `type="button"` and robust `aria-label` (handling optional fields) is the preferred pattern.
**Action:** Always wrap interactive dashboard statistics or cards in `button` elements to ensure they are discoverable and usable in the focus flow. Ensure `aria-label` construction logic handles null/undefined values gracefully.
