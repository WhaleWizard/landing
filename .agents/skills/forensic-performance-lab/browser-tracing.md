# Browser Tracing Protocol

1. **CDP Performance Traces**:
   - Collect Performance profile using Chrome DevTools Protocol (`Performance.enable`, trace categories: `devtools.timeline`, `v8`, `blink.user_timing`).
2. **Analysis Categories**:
   - Long Tasks (> 50ms) & Long Animation Frames (LoAF).
   - Parse & Compile JS vs React Render/Commit vs Recalculate Style & Layout.
3. **Trace-to-Source Mapping**:
   - Trace Event -> Call Frame -> Source Module -> Function -> Root Cause.
