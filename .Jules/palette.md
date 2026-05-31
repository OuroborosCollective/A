## 2025-05-15 - [Accessibility & Clarity Polish]
**Learning:** In a complex, theme-heavy interface (like "Cyber" or "Futuristic" styles), semantic elements and explicit ARIA labels are often overlooked in favor of aesthetics. Explicitly associating labels with inputs and providing aria-labels for icon-only or loading states is critical for maintaining accessibility without compromising the visual style.
**Action:** Always ensure unique IDs are generated for form fields in reusable components (e.g., using a `role` or `id` prop) and provide descriptive `aria-label` content for buttons that transition between icon and text states.

## 2026-05-31 - [Semantic Tooltip Triggers]
**Learning:** Using a generic 'div' as a tooltip trigger prevents keyboard users from accessing the information. In high-density 'dashboard' style UIs like Game Fusion, interactive cards that provide supplementary info via tooltips must be semantic buttons with explicit aria-labels that include both the data point and the tooltip description.
**Action:** Always wrap tooltip content in a 'button type="button"' if the information it provides is essential for understanding the UI, and ensure 'aria-label' provides a concatenated summary for screen readers.
