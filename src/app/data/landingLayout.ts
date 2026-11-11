export const LANDING_SECTIONS = ['services', 'cases', 'cta', 'testimonials', 'contact'] as const;
export type LandingSection = typeof LANDING_SECTIONS[number];
export type LandingLayout = {
  sectionOrder?: LandingSection[];
  hiddenSections?: LandingSection[];
};

export function normalizeLandingSections(value: unknown): LandingSection[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is LandingSection => LANDING_SECTIONS.some((section) => section === entry)))];
}

export function landingSectionOrder(layout: { sectionOrder?: unknown }): LandingSection[] {
  return [...new Set([...normalizeLandingSections(layout.sectionOrder), ...LANDING_SECTIONS])];
}

export function applyLandingLayout<T>(slots: ReadonlyArray<readonly [LandingSection | null, T]>, layout: LandingLayout): T[] {
  const sections = new Map(slots);
  const ordered = landingSectionOrder(layout).filter((section) => sections.has(section));
  const hidden = normalizeLandingSections(layout.hiddenSections);
  let index = 0;
  return slots.flatMap(([section, node]) => {
    if (section === null) return [node];
    const next = ordered[index++];
    return hidden.includes(next) ? [] : [sections.get(next)!];
  });
}
