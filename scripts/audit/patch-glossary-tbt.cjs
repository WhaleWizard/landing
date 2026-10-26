const fs = require('fs');
let s = fs.readFileSync('src/app/pages/MarketingGlossaryPage.tsx', 'utf8');

const t1 = `import { useManagedTitleFit } from '../utils/contentTypography';`;
const r1 = `import { useManagedTitleFit } from '../utils/contentTypography';\nimport { useIdleReady } from '../hooks/useIdleReady';`;

const t2 = `  const displayGroups = useMemo(() => {
    const filteredIds = new Set(filteredTerms.map((term) => term.id));

    if (selectedCollectionData) {
      return selectedCollectionData.groups
        .map((group) => ({
          id: group.id,
          label: group.label,
          terms: group.termIds
            .filter((id) => filteredIds.has(id))
            .map((id) => glossaryTerm(id))
            // filter(Boolean) отсеивает пустые, но типам об этом не говорит —
            // отсюда явная проверка вместо неё.
            .filter((term): term is MarketingGlossaryItem => Boolean(term)),
        }))
        .filter((group) => group.terms.length > 0);
    }

    return GLOSSARY_SECTIONS
      .map((section) => ({
        id: section.id,
        label: section.label,
        terms: filteredTerms.filter((term) => term.primarySection === section.id),
      }))
      .filter((group) => group.terms.length > 0);
  }, [filteredTerms, selectedCollectionData]);`;

const r2 = `  const idleReady = useIdleReady(100);

  const displayGroups = useMemo(() => {
    const filteredIds = new Set(filteredTerms.map((term) => term.id));

    let groups: { id: string; label: string; terms: MarketingGlossaryItem[] }[] = [];

    if (selectedCollectionData) {
      groups = selectedCollectionData.groups
        .map((group) => ({
          id: group.id,
          label: group.label,
          terms: group.termIds
            .filter((id) => filteredIds.has(id))
            .map((id) => glossaryTerm(id))
            // filter(Boolean) отсеивает пустые, но типам об этом не говорит —
            // отсюда явная проверка вместо неё.
            .filter((term): term is MarketingGlossaryItem => Boolean(term)),
        }))
        .filter((group) => group.terms.length > 0);
    } else {
      groups = GLOSSARY_SECTIONS
        .map((section) => ({
          id: section.id,
          label: section.label,
          terms: filteredTerms.filter((term) => term.primarySection === section.id),
        }))
        .filter((group) => group.terms.length > 0);
    }

    const hasTargetHash = typeof window !== 'undefined' && window.location.hash.includes('term-');
    if (!idleReady && !query && !hasTargetHash && groups.length > 2) {
      return groups.slice(0, 2);
    }

    return groups;
  }, [filteredTerms, selectedCollectionData, idleReady, query]);`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t1) || !normalized.includes(t2)) {
  console.error('Target not found in MarketingGlossaryPage.tsx', { t1: normalized.includes(t1), t2: normalized.includes(t2) });
  process.exit(1);
}

const patched = normalized.replace(t1, r1).replace(t2, r2);
fs.writeFileSync('src/app/pages/MarketingGlossaryPage.tsx', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched MarketingGlossaryPage.tsx');
