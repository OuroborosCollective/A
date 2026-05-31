## 2025-05-15 - Improving Accessibility in Interactive Visualizations
**Learning:** Using `div` as a trigger for tooltips in data-heavy panels prevents keyboard users from accessing additional context. Semantic HTML like `button` with proper `aria-label` is essential for making information accessible.
**Action:** Always wrap interactive data points or triggers in a `button` element and ensure `focus-visible` rings are configured to match the design system.
