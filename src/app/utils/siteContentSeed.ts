export const SITE_CONTENT_SEED_ID = 'ww-site-content-seed';

type InlineSiteContentSeed = {
  schemaVersion: 1;
  key: string;
  content: Record<string, unknown> | null;
};

let seedWasRead = false;
let inlineSeed: InlineSiteContentSeed | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reads the build-time published CMS override embedded into the current route.
 * `undefined` means that this HTML did not carry a seed for the requested key;
 * `null` is an explicit, authoritative "no published override at build time".
 *
 * The value is intentionally kept separate from the runtime request cache:
 * it makes the first React frame match generated HTML, while `/api/site-content`
 * can still revalidate silently after mount.
 */
export function readInlineSiteContentSeed(cacheKey: string): Record<string, unknown> | null | undefined {
  if (!seedWasRead) {
    if (typeof document === 'undefined') return undefined;
    seedWasRead = true;

    const node = document.getElementById(SITE_CONTENT_SEED_ID);
    if (node?.textContent) {
      try {
        const parsed = JSON.parse(node.textContent) as Partial<InlineSiteContentSeed>;
        if (
          parsed.schemaVersion === 1
          && typeof parsed.key === 'string'
          && (parsed.content === null || isRecord(parsed.content))
        ) {
          inlineSeed = parsed as InlineSiteContentSeed;
        }
      } catch {
        // Invalid inline data must never prevent the source-backed page fallback.
      }
    }
  }

  return inlineSeed?.key === cacheKey ? inlineSeed.content : undefined;
}
