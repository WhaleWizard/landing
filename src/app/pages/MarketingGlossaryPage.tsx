import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowRight, BookOpenText, Filter, Search } from 'lucide-react';
import SEO from '../components/SEO';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { marketingGlossary, glossaryStats } from '../data/marketingGlossary';

const INITIAL_VISIBLE = 60;

export default function MarketingGlossaryPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const channels = useMemo(
    () => ['all', ...Array.from(new Set(marketingGlossary.map((item) => item.channel)))],
    []
  );

  const filteredTerms = useMemo(() => {
    const q = query.trim().toLowerCase();

    return marketingGlossary.filter((item) => {
      const channelMatches = selectedChannel === 'all' || item.channel === selectedChannel;
      if (!channelMatches) return false;

      if (!q) return true;

      return [item.term, item.abbreviation, item.category, item.definition, item.simple]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [query, selectedChannel]);

  const visibleTerms = filteredTerms.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO
        title="Словарь маркетинговых метрик (600+)"
        description="Большой словарь маркетинговых метрик: Google Ads, Meta Ads, SEO, AEO, GEO, аналитика и CRM. Поиск по терминам, простые объяснения и формулы."
        url="/marketing-glossary"
      />

      <section className="relative overflow-hidden border-b border-border/50 bg-card/20">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-4xl"
          >
            <p className="text-primary font-medium mb-3">Маркетинговый FAQ-словарь</p>
            <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
              Полный словарь метрик для <span className="text-primary">Google Ads, SEO, AEO, GEO, Meta Ads</span>
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-3xl">
              Страница сделана как база знаний: быстро найти термин, понять его простыми словами и увидеть, как метрика влияет на деньги.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8">
              <div className="rounded-xl border border-border bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Терминов</p>
                <p className="text-2xl font-semibold">{glossaryStats.totalTerms}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Каналов</p>
                <p className="text-2xl font-semibold">{glossaryStats.channels}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">Категорий</p>
                <p className="text-2xl font-semibold">{glossaryStats.categories}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="rounded-2xl border border-border bg-card/40 p-4 md:p-6 mb-8">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setVisibleCount(INITIAL_VISIBLE);
                }}
                placeholder="Поиск: CTR, CAC, AI Citation Rate, локальное SEO..."
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <div className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                <Filter className="w-4 h-4" />
                Канал
              </div>
              {channels.map((channel) => (
                <button
                  key={channel}
                  type="button"
                  onClick={() => {
                    setSelectedChannel(channel);
                    setVisibleCount(INITIAL_VISIBLE);
                  }}
                  className={`whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selectedChannel === channel
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {channel === 'all' ? 'Все' : channel}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Найдено терминов: <span className="text-foreground font-medium">{filteredTerms.length}</span>
          </p>
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setVisibleCount(INITIAL_VISIBLE);
              }}
              className="text-sm text-primary hover:underline"
            >
              Сбросить поиск
            </button>
          )}
        </div>

        <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card/30 px-4 md:px-6">
          {visibleTerms.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="py-4 md:py-5">
                <div className="text-left">
                  <p className="font-medium text-base md:text-lg">{item.term}</p>
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    {item.channel} • {item.category} {item.abbreviation ? `• ${item.abbreviation}` : ''}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  <p className="text-sm md:text-base text-foreground/90">{item.definition}</p>
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Просто:</strong> {item.simple}
                  </p>
                  {item.formula && (
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground">Формула:</strong> {item.formula}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">Практика:</strong> {item.seoHint}
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {visibleCount < filteredTerms.length && (
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + INITIAL_VISIBLE)}>
              Показать еще {Math.min(INITIAL_VISIBLE, filteredTerms.length - visibleCount)} терминов
            </Button>
          </div>
        )}

        <section className="mt-12 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card/50 to-accent/10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-primary font-medium mb-1 inline-flex items-center gap-2">
                <BookOpenText className="w-4 h-4" />
                SEO • AEO • GEO-ready
              </p>
              <h2 className="text-2xl font-semibold">Нужен разбор метрик под ваш бизнес?</h2>
              <p className="text-muted-foreground mt-2">
                Получите аудит воронки: где теряются деньги, какие метрики важны именно для вашей ниши и как ускорить рост.
              </p>
            </div>
            <Button
              onClick={() => navigate('/#contact')}
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
            >
              Связаться
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
