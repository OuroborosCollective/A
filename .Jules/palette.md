## 2025-05-15 - [Accessibility & Clarity Polish]
**Learning:** In a complex, theme-heavy interface (like "Cyber" or "Futuristic" styles), semantic elements and explicit ARIA labels are often overlooked in favor of aesthetics. Explicitly associating labels with inputs and providing aria-labels for icon-only or loading states is critical for maintaining accessibility without compromising the visual style.
**Action:** Always ensure unique IDs are generated for form fields in reusable components (e.g., using a `role` or `id` prop) and provide descriptive `aria-label` content for buttons that transition between icon and text states.

## 2025-05-20 - [Accessible Tooltip Triggers]
**Learning:** When using tooltip libraries (like Radix UI) with , ensuring the trigger is a focusable, semantic element like a <button> is vital for keyboard accessibility. Furthermore, to maintain valid HTML, the content inside that button must be phrasing content (e.g., using <span> instead of <div>), which is often overlooked when refactoring existing layout-heavy components.
**Action:** Always verify that TooltipTrigger asChild targets a focusable element and that its children are converted to phrasing-safe elements if the trigger is a button.

## 2025-05-20 - [Accessible Tooltip Triggers]
**Learning:** When using tooltip libraries (like Radix UI) with `asChild`, ensuring the trigger is a focusable, semantic element like a <button> is vital for keyboard accessibility. Furthermore, to maintain valid HTML, the content inside that button must be phrasing content (e.g., using <span> instead of <div>), which is often overlooked when refactoring existing layout-heavy components.
**Action:** Always verify that TooltipTrigger asChild targets a focusable element and that its children are converted to phrasing-safe elements if the trigger is a button.
