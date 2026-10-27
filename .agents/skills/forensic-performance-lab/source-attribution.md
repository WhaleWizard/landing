# Source Attribution Protocol

1. **Mapping Trace to Source Code**:
   - `Trace Event` -> `Call Frame` -> `Minified Bundle Offset` -> `Source Map` -> `Source Module / Component`.
2. **Identification of Execution Hotspots**:
   - High Self Time in V8 functions during initial bootstrap.
   - Forced synchronous layouts (`getBoundingClientRect`, `offsetHeight`, `scrollIntoView`).
   - Heavy hydration sweeps (e.g. re-running DOMPurify or unneeded animation loops).
