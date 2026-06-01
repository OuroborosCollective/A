## 2025-05-15 - [Accessibility & Clarity Polish]
**Learning:** In a complex, theme-heavy interface (like "Cyber" or "Futuristic" styles), semantic elements and explicit ARIA labels are often overlooked in favor of aesthetics. Explicitly associating labels with inputs and providing aria-labels for icon-only or loading states is critical for maintaining accessibility without compromising the visual style.
**Action:** Always ensure unique IDs are generated for form fields in reusable components (e.g., using a `role` or `id` prop) and provide descriptive `aria-label` content for buttons that transition between icon and text states.

## 2025-05-22 - [Keyboard Accessibility & Tooltip Triggers]
**Learning:** Using `div` elements for data visualization cards (like `StatCard`) makes them invisible to keyboard users. Converting these to semantic `button` elements allows them to be focused, which is essential when they serve as triggers for information (tooltips). A descriptive `aria-label` that combines the title, value, and description provides immediate context for screen readers.
**Action:** Always use semantic interactive elements (like `button`) for components that trigger tooltips or other overlays, and ensure they have a comprehensive `aria-label` that includes all relevant data points.
