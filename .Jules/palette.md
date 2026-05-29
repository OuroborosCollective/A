## 2025-05-15 - [Accessibility & Clarity Polish]
**Learning:** In a complex, theme-heavy interface (like "Cyber" or "Futuristic" styles), semantic elements and explicit ARIA labels are often overlooked in favor of aesthetics. Explicitly associating labels with inputs and providing aria-labels for icon-only or loading states is critical for maintaining accessibility without compromising the visual style.
**Action:** Always ensure unique IDs are generated for form fields in reusable components (e.g., using a `role` or `id` prop) and provide descriptive `aria-label` content for buttons that transition between icon and text states.

## 2026-05-29 - [Accessible Tooltip Triggers & Redundant UI Cleanup]
**Learning:** In a highly themed UI, developers often resort to manual CSS-based tooltips (like `group-hover:opacity-100`) which are not keyboard-accessible and often conflict with established accessible component libraries (like Radix UI). Standardizing on accessible primitives (e.g., `<TooltipTrigger asChild><button>`) ensures both visual consistency and screen-reader/keyboard compliance.
**Action:** Replace manual "hover-only" UI elements with standardized accessible components. Ensure all `TooltipTrigger` elements are keyboard-focusable (using `<button type="button">` instead of `<div>`) and remove redundant legacy tooltip implementations.
