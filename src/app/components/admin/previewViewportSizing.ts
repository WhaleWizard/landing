interface PreviewViewportOptions {
  width: number;
  height: number;
  fit: boolean;
  expanded: boolean;
}

/** Update only presentation properties, without measuring layout or rerendering React. */
export function observePreviewViewport(node: HTMLElement, options: PreviewViewportOptions): () => void {
  let previousWidth = -1;
  let observedWidth = -1;
  let frame = 0;
  const update = (availableWidth: number) => {
    if (!Number.isFinite(availableWidth) || availableWidth <= 0 || availableWidth === previousWidth) return;
    previousWidth = availableWidth;
    const scale = options.fit ? Math.min(1, Math.max(0.1, availableWidth / options.width)) : 1;
    const scaledHeight = options.height * scale;
    node.style.setProperty('--adm-preview-scale', String(scale));
    node.style.setProperty('--adm-preview-width', `${options.width * scale}px`);
    node.style.setProperty('--adm-preview-height', `${scaledHeight}px`);
    node.style.setProperty('--adm-preview-stage-height', options.expanded
      ? `min(${Math.max(480, scaledHeight)}px, calc(100vh - 190px))`
      : `${Math.min(Math.max(360, scaledHeight), 680)}px`);
    node.style.setProperty('--adm-preview-visibility', 'visible');
  };

  if (typeof ResizeObserver === 'undefined') {
    update(node.clientWidth);
    return () => {};
  }

  const observer = new ResizeObserver((entries) => {
    // contentRect already excludes the real padding, including the mobile
    // padding. Reading clientWidth here forced layout, and a state update
    // rerendered the iframe's surrounding editor for height-only changes too.
    const entry = entries.find((item) => item.target === node);
    if (!entry || entry.contentRect.width === observedWidth) return;
    observedWidth = entry.contentRect.width;
    if (frame) return;
    // Resizing the observed stage during the observer delivery itself creates
    // a ResizeObserver loop. Commit its CSS sizes once in the next frame.
    frame = requestAnimationFrame(() => {
      frame = 0;
      update(observedWidth);
    });
  });
  observer.observe(node);
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
