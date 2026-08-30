import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import { ArrowRight, BookOpenText, Filter, Layers3, Link2, Search, Smartphone } from 'lucide-react';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  GLOSSARY_SECTIONS,
  MARKETING_GLOSSARY_SEO,
  glossaryCollections,
  glossarySectionById,
  glossarySourceById,
  glossaryStats,
  glossaryTermById,
  marketingGlossary,
  type GlossarySectionId,
  type MarketingGlossaryItem,
} from '../data/marketingGlossary';
import { preferredScrollBehavior } from '../utils/motionPreference';

const Footer = lazy(() => import('../components/Footer'));

type CollectionFilter = 'all' | (typeof glossaryCollections)[number]['id'];
type SectionFilter = 'all' | GlossarySectionId;

const normalizeLabel = (value: string): string => value.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, '');
const shouldShowAbbreviation = (item: MarketingGlossaryItem): boolean => (
  Boolean(item.abbreviation) && normalizeLabel(item.term) !== normalizeLabel(item.abbreviation || '')
);
const termAnchor = (id: string): string => `term-${id}`;

/**
 * Термин по идентификатору из адресной строки. Простой `glossaryTermById[id]`
 * на якоре `#term-constructor` вернул бы унаследованное свойство объекта, и
 * дальше по коду вместо термина поехала бы функция.
 */
function glossaryTerm(id: string): MarketingGlossaryItem | undefined {
  return Object.prototype.hasOwnProperty.call(glossaryTermById, id) ? glossaryTermById[id] : undefined;
}

function glossarySearchScore(item: MarketingGlossaryItem, query: string): number {
  const normalizedQuery = normalizeLabel(query);
  const aliases = (item.aliases || []).map((alias) => alias.value);
  const exactValues = [item.term, item.abbreviation, item.officialName, ...aliases].filter(Boolean) as string[];

  if (exactValues.some((value) => normalizeLabel(value) === normalizedQuery)) return 0;

  const primaryValues = [
    ...exactValues,
    item.category,
    item.disambiguation,
    ...item.tags,
    ...(item.platforms || []),
  ].filter(Boolean) as string[];

  if (primaryValues.some((value) => value.toLowerCase().includes(query))) return 1;

  const explanatoryValues = [
    item.definition,
    item.simple,
    item.useWhen,
    ...(item.caveats || []),
    ...(item.aliases || []).map((alias) => alias.scope),
  ].filter(Boolean) as string[];

  return explanatoryValues.some((value) => value.toLowerCase().includes(query))
    ? 2
    : Number.POSITIVE_INFINITY;
}

function replaceHash(anchor?: string) {
  const nextUrl = `${window.location.pathname}${window.location.search}${anchor ? `#${anchor}` : ''}`;
  window.history.replaceState(window.history.state, '', nextUrl);
}

export default function MarketingGlossaryPage() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<SectionFilter>('all');
  const [selectedCollection, setSelectedCollection] = useState<CollectionFilter>('all');
  const [openTermId, setOpenTermId] = useState('');

  const selectedCollectionData = useMemo(
    () => glossaryCollections.find((collection) => collection.id === selectedCollection),
    [selectedCollection],
  );

  const collectionOrder = useMemo(() => {
    if (!selectedCollectionData) return null;
    return new Map(
      selectedCollectionData.groups
        .flatMap((group) => group.termIds)
        .map((id, index) => [id, index]),
    );
  }, [selectedCollectionData]);

  const filteredTerms = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collectionIds = collectionOrder ? new Set(collectionOrder.keys()) : null;

    const eligibleTerms = marketingGlossary.filter((item) => {
      if (collectionIds && !collectionIds.has(item.id)) return false;
      if (selectedSection !== 'all' && item.primarySection !== selectedSection) return false;
      return true;
    });

    if (!q) {
      return collectionOrder ? eligibleTerms.sort((a, b) => (
        (collectionOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER)
        - (collectionOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      )) : eligibleTerms;
    }

    const scoredTerms = eligibleTerms
      .map((item) => ({ item, score: glossarySearchScore(item, q) }))
      .filter(({ score }) => Number.isFinite(score));
    const hasExactMatch = scoredTerms.some(({ score }) => score === 0);

    return scoredTerms
      .filter(({ score }) => !hasExactMatch || score === 0)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        if (!collectionOrder) return 0;
        return (
          (collectionOrder.get(a.item.id) ?? Number.MAX_SAFE_INTEGER)
          - (collectionOrder.get(b.item.id) ?? Number.MAX_SAFE_INTEGER)
        );
      })
      .map(({ item }) => item);
  }, [collectionOrder, query, selectedSection]);

  const displayGroups = useMemo(() => {
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
  }, [filteredTerms, selectedCollectionData]);

  const metaAppsTermCount = useMemo(() => (
    new Set(glossaryCollections.find((collection) => collection.id === 'meta-apps')?.groups.flatMap((group) => group.termIds) || []).size
  ), []);

  useEffect(() => {
    const rawHash = location.hash.slice(1);
    if (!rawHash.startsWith('term-')) return;
    const termId = rawHash.slice('term-'.length);
    if (!glossaryTerm(termId)) return;

    setSelectedCollection('all');
    setSelectedSection('all');
    setOpenTermId(termId);
    const shouldAlignHash = navigationType !== 'POP' || location.key === 'default';
    const timer = window.setTimeout(() => {
      if (shouldAlignHash) {
        document.getElementById(termAnchor(termId))?.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.key, navigationType]);

  useEffect(() => {
    const scriptId = 'ld-marketing-glossary';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }

    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'DefinedTermSet',
      '@id': 'https://www.whalewzrd.com/marketing-glossary/#glossary',
      name: MARKETING_GLOSSARY_SEO.title,
      description: MARKETING_GLOSSARY_SEO.description,
      inLanguage: 'ru',
      hasDefinedTerm: marketingGlossary.map((item) => ({
        '@type': 'DefinedTerm',
        '@id': `https://www.whalewzrd.com/marketing-glossary/#${termAnchor(item.id)}`,
        name: shouldShowAbbreviation(item) ? `${item.abbreviation} — ${item.term}` : item.term,
        ...(item.abbreviation ? { termCode: item.abbreviation } : {}),
        ...(item.aliases?.length ? { alternateName: item.aliases.map((alias) => alias.value) } : {}),
        description: item.definition,
        inDefinedTermSet: 'https://www.whalewzrd.com/marketing-glossary/#glossary',
      })),
    });

    return () => script?.remove();
  }, []);

  const openTerm = (termId: string, scroll = false) => {
    setOpenTermId(termId);
    setSelectedCollection('all');
    setSelectedSection('all');
    replaceHash(termAnchor(termId));
    if (scroll) {
      window.setTimeout(() => {
        document.getElementById(termAnchor(termId))?.scrollIntoView({ block: 'start', behavior: preferredScrollBehavior() });
      }, 50);
    }
  };

  const resetFilters = () => {
    setQuery('');
    setSelectedSection('all');
    setSelectedCollection('all');
  };

  return (
    <div className="marketing-typography min-h-screen bg-background text-foreground">
      <Navbar variant="content" />
      <SEO
        title={MARKETING_GLOSSARY_SEO.title}
        description={MARKETING_GLOSSARY_SEO.description}
        url="/marketing-glossary"
      />

      <section className="relative overflow-hidden border-b border-border/50 bg-card/20">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 md:pt-28">
          <PageNav
            crumbs={[
              { label: 'Главная', to: '/' },
              { label: 'Словарь метрик' },
            ]}
            className="mb-8"
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl"
          >
            <p className="text-primary font-medium mb-3">Справочник по рекламе, данным и продукту</p>
            <h1 className="text-balance text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight">
              Словарь маркетинга <span className="text-primary">без лишнего жаргона</span>
            </h1>
            <p className="max-w-3xl text-pretty text-base text-muted-foreground md:text-lg">
              {MARKETING_GLOSSARY_SEO.lead}
            </p>

            <div className="mt-6 grid grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
              <div className="rounded-xl border border-border bg-background/70 p-3 sm:p-4">
                <p className="text-[11px] leading-snug text-muted-foreground sm:text-sm">Канонических терминов</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{glossaryStats.totalTerms}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-3 sm:p-4">
                <p className="text-[11px] leading-snug text-muted-foreground sm:text-sm">Логичных разделов</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{glossaryStats.sections}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-3 sm:p-4">
                <p className="text-[11px] leading-snug text-muted-foreground sm:text-sm">В подборке Meta Apps</p>
                <p className="mt-1 text-xl font-semibold sm:text-2xl">{metaAppsTermCount}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <main className="min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
        <section aria-label="Фильтры словаря" className="min-w-0 max-w-full rounded-2xl border border-border bg-card/40 p-4 md:p-6 mb-8">
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
            <div className="relative min-w-0 w-full max-w-full">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="CTR, AEO, ATT, SKAN, LTV или простыми словами"
                aria-label="Поиск по словарю"
                className="min-h-11 w-full max-w-full pl-9"
              />
            </div>

            <div className="min-w-0 max-w-full">
              <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium">
                <Layers3 className="w-4 h-4 text-primary" aria-hidden="true" />
                Подборка
              </p>
              <div className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 scroll-px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden after:block after:h-px after:w-3 after:shrink-0 after:content-['']">
                <button
                  type="button"
                  onClick={() => setSelectedCollection('all')}
                  aria-pressed={selectedCollection === 'all'}
                  className={`min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selectedCollection === 'all'
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Все термины
                </button>
                {glossaryCollections.map((collection) => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => {
                      setSelectedCollection(collection.id);
                      setSelectedSection('all');
                    }}
                    aria-pressed={selectedCollection === collection.id}
                    className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selectedCollection === collection.id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" aria-hidden="true" />
                    {collection.label}
                  </button>
                ))}
              </div>
              {selectedCollectionData && (
                <p className="mt-2 text-sm text-muted-foreground text-pretty">
                  {selectedCollectionData.description}
                </p>
              )}
            </div>

            <div className="min-w-0 max-w-full">
              <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium">
                <Filter className="w-4 h-4 text-primary" aria-hidden="true" />
                Раздел
              </p>
              <div className="flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 scroll-px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden after:block after:h-px after:w-3 after:shrink-0 after:content-['']">
                <button
                  type="button"
                  onClick={() => setSelectedSection('all')}
                  aria-pressed={selectedSection === 'all'}
                  className={`min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selectedSection === 'all'
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Все разделы
                </button>
                {GLOSSARY_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setSelectedSection(section.id)}
                    aria-pressed={selectedSection === section.id}
                    className={`min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                      selectedSection === section.id
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Найдено терминов: <span className="text-foreground font-medium">{filteredTerms.length}</span>
          </p>
          {(query || selectedSection !== 'all' || selectedCollection !== 'all') && (
            <button type="button" onClick={resetFilters} className="min-h-11 px-2 text-sm text-primary hover:underline">
              Сбросить фильтры
            </button>
          )}
        </div>

        <div className="space-y-8">
          {displayGroups.map((group) => (
            <section key={group.id} aria-labelledby={`glossary-group-${group.id}`}>
              <div className="mb-3 flex items-end justify-between gap-4">
                <h2 id={`glossary-group-${group.id}`} className="text-xl md:text-2xl font-semibold text-pretty">
                  {group.label}
                </h2>
                <span className="text-sm text-muted-foreground tabular-nums">{group.terms.length}</span>
              </div>

              <Accordion
                type="single"
                collapsible
                value={openTermId}
                onValueChange={(value) => {
                  setOpenTermId(value);
                  if (value) replaceHash(termAnchor(value));
                  else if (window.location.hash === `#${termAnchor(openTermId)}`) replaceHash();
                }}
                className="rounded-2xl border border-border bg-card/30 px-4 md:px-6"
              >
                {group.terms.map((item) => {
                  const sources = item.sourceIds.map((sourceId) => glossarySourceById[sourceId]).filter(Boolean);
                  return (
                    <AccordionItem
                      key={item.id}
                      id={termAnchor(item.id)}
                      value={item.id}
                      className="scroll-mt-24"
                    >
                      <AccordionTrigger className="py-4 md:py-5 hover:no-underline">
                        <div className="min-w-0 pr-2 text-left">
                          <p className="break-words text-pretty font-medium text-base md:text-lg">
                            {shouldShowAbbreviation(item) ? `${item.abbreviation} — ${item.term}` : item.term}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground md:text-sm">
                            <span>{glossarySectionById[item.primarySection].label}</span>
                            <span aria-hidden="true">•</span>
                            <span>{item.category}</span>
                            {item.platforms?.map((platform) => (
                              <span key={platform} className="rounded-md border border-border px-1.5 py-0.5">
                                {platform}
                              </span>
                            ))}
                            {item.status !== 'current' && (
                              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-300">
                                {item.status === 'legacy' ? 'исторический' : item.status === 'experimental' ? 'экспериментальный' : 'развивающийся'}
                              </span>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pb-2">
                          {item.disambiguation && (
                            <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground/90">
                              <strong>Не путать:</strong> {item.disambiguation}
                            </p>
                          )}
                          <p className="text-sm md:text-base text-foreground/90">{item.definition}</p>
                          <p className="text-sm text-muted-foreground">
                            <strong className="text-foreground">Просто:</strong> {item.simple}
                          </p>
                          {item.formula && (
                            <p className="overflow-x-auto rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
                              <strong className="text-foreground">Формула:</strong> <code>{item.formula}</code>
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground">
                            <strong className="text-foreground">Практика:</strong> {item.useWhen}
                          </p>
                          {item.caveats?.length ? (
                            <ul className="space-y-1 pl-5 text-sm text-muted-foreground list-disc">
                              {item.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                            </ul>
                          ) : null}
                          {item.aliases?.length ? (
                            <p className="text-xs text-muted-foreground">
                              <strong className="text-foreground">Также ищут:</strong>{' '}
                              {item.aliases.map((alias) => `${alias.value}${alias.scope ? ` (${alias.scope})` : ''}`).join(', ')}
                            </p>
                          ) : null}
                          {item.relatedIds?.length ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="text-muted-foreground">Связанные:</span>
                              {item.relatedIds.map((relatedId) => {
                                const related = glossaryTerm(relatedId);
                                if (!related) return null;
                                return (
                                  <a
                                    key={relatedId}
                                    href={`#${termAnchor(relatedId)}`}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      openTerm(relatedId, true);
                                    }}
                                    className="rounded-md border border-border px-2 py-1 text-primary hover:border-primary/50"
                                  >
                                    {related.abbreviation || related.term}
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                          {sources.length ? (
                            <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
                              <span className="text-muted-foreground">Официальные источники:</span>
                              {sources.map((source) => (
                                <a
                                  key={source.id}
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  {source.publisher}
                                  <ArrowRight className="w-3 h-3 -rotate-45" aria-hidden="true" />
                                </a>
                              ))}
                              <span className="text-muted-foreground">проверено {item.reviewedAt}</span>
                            </div>
                          ) : null}
                          <a
                            href={`#${termAnchor(item.id)}`}
                            onClick={() => replaceHash(termAnchor(item.id))}
                            className="inline-flex min-h-10 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                            aria-label={`Постоянная ссылка на термин ${item.term}`}
                          >
                            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Постоянная ссылка
                          </a>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </section>
          ))}
        </div>

        {filteredTerms.length === 0 && (
          <div className="rounded-2xl border border-border bg-card/30 px-5 py-10 text-center">
            <p className="text-muted-foreground text-pretty">
              По этому сочетанию фильтров терминов нет. Попробуйте убрать раздел или сократить запрос.
            </p>
            <Button type="button" variant="outline" onClick={resetFilters} className="mt-4">
              Показать весь словарь
            </Button>
          </div>
        )}

        <section className="mt-12 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card/50 to-accent/10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-primary font-medium mb-1 inline-flex items-center gap-2">
                <BookOpenText className="w-4 h-4" />
                Метрики под ваш проект
              </p>
              <h2 className="text-balance text-2xl font-semibold">Неясно, какие показатели смотреть?</h2>
              <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">
                Разберём путь от рекламного расхода до продажи или события приложения и выберем метрики, по которым можно принимать решения.
              </p>
            </div>
            <Button
              onClick={() => navigate('/#contact')}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              Обсудить проект
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}
