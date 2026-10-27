# Visual Readiness Protocol

## Distinction Between Visual Paint & Interaction Readiness
1. **Visual Paint Readiness**:
   - Time at which server-rendered prehydrate HTML (`data-ww-first-screen`) displays coherent hero content, title, and structure.
   - Must happen on initial paint without flash of unstyled content (FOUC).
2. **Interaction Readiness**:
   - Time at which React hydrator (`main.tsx`) attaches event listeners, removes `data-ww-prehydrate`, and interactive elements (CTA, navigation drawer, forms) respond to clicks and touch events within < 100ms.
3. **Filmstrip Analysis**:
   - Filmstrip snapshots taken at 100ms intervals from 0ms to 3500ms to verify zero layout jumps, zero blank intervals, and zero content popping.
