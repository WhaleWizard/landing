// src/app/pages/BlogPage.tsx
import { motion, useInView } from 'motion/react';
import { Clock, ArrowRight, ArrowLeft, Calendar } from 'lucide-react';
import { useParams, useNavigate } from 'react-router';
import { useEffect, useState, useRef, useCallback, memo } from 'react';
import SEO from '../components/SEO';
import { useArticles } from '../context/ArticlesContext';

function extractRelatedArticles(allArticles, currentArticle) {
  if (!currentArticle) return [];

  return allArticles
    .filter((article) => article.slug !== currentArticle.slug)
    .sort((a, b) => {
      const byCategory = Number(b.category === currentArticle.category) - Number(a.category === currentArticle.category);
      if (byCategory !== 0) return byCategory;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 3);
}

function BlogPageComponent() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { articles: allArticles, loading } = useArticles();
  const [selectedArticle, setSelectedArticle] = useState(null);
  const contentRef = useRef(null);
  const sectionRef = useRef(null);
  const inView = useInView(sectionRef, { once: false, margin: '0px 0px -10% 0px' });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  useEffect(() => {
    if (slug && !loading) {
      const article = allArticles.find((a) => a.slug === slug);
      if (article) setSelectedArticle(article);
      else navigate('/blog', { replace: true });
    } else {
      setSelectedArticle(null);
    }
  }, [slug, allArticles, loading, navigate]);

  useEffect(() => {
    if (!contentRef.current || !selectedArticle) return;
    const handler = (e) => {
      const link = e.target.closest('a');
      if (link?.getAttribute('href') === '/#contact') {
        e.preventDefault();
        navigate('/');
        setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };
    contentRef.current.addEventListener('click', handler);
    return () => contentRef.current?.removeEventListener('click', handler);
  }, [selectedArticle, navigate]);

  const goHome = useCallback(() => {
    navigate('/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate]);

  const goToBlogList = useCallback(() => navigate('/blog'), [navigate]);

  const goToContact = useCallback(() => {
    navigate('/');
    setTimeout(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [navigate]);

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Загрузка...</div>;

  if (selectedArticle) {
    const relatedArticles = extractRelatedArticles(allArticles, selectedArticle);

    return (
      <>
        <SEO
          title={selectedArticle.seoTitle || selectedArticle.title}
          description={selectedArticle.seoDescription || selectedArticle.description}
          url={`/blog/${selectedArticle.slug}`}
          type="article"
        />
        <section ref={sectionRef} className="min-h-screen bg-background" style={{ contain: 'layout style paint' }}>
          <div className="relative overflow-hidden pt-16 pb-12 md:pt-24 md:pb-20">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] animate-pulse" style={{ willChange: 'opacity', animationPlayState: inView ? 'running' : 'paused' }} />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s', animationPlayState: inView ? 'running' : 'paused' }} />
            <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
              <div className="flex flex-col gap-3 mb-4 md:mb-0 md:block">
                <nav className="text-xs text-muted-foreground" aria-label="breadcrumb">
                  <button onClick={goHome} className="hover:text-primary bg-transparent border-none cursor-pointer p-0">Главная</button>
                  <span className="mx-2">›</span>
                  <button onClick={goToBlogList} className="hover:text-primary bg-transparent border-none cursor-pointer p-0">Блог</button>
                  <span className="mx-2">›</span>
                  <span className="text-foreground break-words">{selectedArticle.title}</span>
                </nav>

              </div>

              <button onClick={goToBlogList} className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors mb-8 bg-transparent border-none cursor-pointer">
                <ArrowLeft className="w-4 h-4" /><span>Все статьи</span>
              </button>
              <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-5">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="px-3 py-1 rounded-full bg-primary/20 text-primary font-medium">{selectedArticle.category}</span>
                  <div className="flex items-center gap-1 text-muted-foreground"><Clock className="w-4 h-4" /><span>{selectedArticle.readTime}</span></div>
                  <div className="flex items-center gap-1 text-muted-foreground"><Calendar className="w-4 h-4" /><span>{selectedArticle.date}</span></div>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">{selectedArticle.title}</h1>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed border-l-4 border-primary/50 pl-4">{selectedArticle.description}</p>
              </motion.div>
            </div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="max-w-5xl mx-auto px-4 sm:px-6 mb-10">
            <div className="rounded-2xl overflow-hidden border border-border shadow-2xl">
              <img src={selectedArticle.image} alt={selectedArticle.title} loading="eager" fetchpriority="high" className="w-full h-auto object-cover max-h-[500px]" />
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="max-w-3xl mx-auto px-4 sm:px-6 pb-20">
            {selectedArticle.summary && (
              <aside className="mb-8 rounded-2xl border border-primary/30 bg-primary/10 p-5">
                <h2 className="text-lg font-semibold mb-2">Краткий ответ</h2>
                <p className="text-sm md:text-base text-foreground/90 leading-relaxed">{selectedArticle.summary}</p>
              </aside>
            )}

            {Array.isArray(selectedArticle.keyTakeaways) && selectedArticle.keyTakeaways.length > 0 && (
              <section className="mb-8 rounded-2xl border border-border bg-card/30 p-5">
                <h2 className="text-lg font-semibold mb-3">Ключевые тезисы</h2>
                <ul className="space-y-2 list-disc pl-5 text-sm md:text-base text-muted-foreground">
                  {selectedArticle.keyTakeaways.map((point, index) => (
                    <li key={`${point}-${index}`}>{point}</li>
                  ))}
                </ul>
              </section>
            )}

            <div ref={contentRef} className="prose prose-invert prose-lg prose-headings:text-foreground prose-a:text-primary prose-strong:text-primary max-w-none" dangerouslySetInnerHTML={{ __html: selectedArticle.content }} />

            {Array.isArray(selectedArticle.faq) && selectedArticle.faq.length > 0 && (
              <section className="mt-10 rounded-2xl border border-border bg-card/30 p-6">
                <h2 className="text-xl font-semibold mb-4">FAQ</h2>
                <div className="space-y-4">
                  {selectedArticle.faq.map((item, index) => (
                    <details key={`${item.question}-${index}`} className="group rounded-xl border border-border/70 bg-background/40 px-4 py-3">
                      <summary className="cursor-pointer list-none font-medium text-foreground group-open:text-primary">
                        {item.question}
                      </summary>
                      <p className="mt-2 text-sm md:text-base text-muted-foreground leading-relaxed">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {relatedArticles.length > 0 && (
              <aside className="mt-12 rounded-2xl border border-border bg-card/30 p-6">
                <h2 className="text-xl font-semibold mb-4">Похожие статьи</h2>
                <ul className="space-y-3">
                  {relatedArticles.map((article) => (
                    <li key={article.slug}>
                      <button
                        onClick={() => navigate(`/blog/${article.slug}`)}
                        className="text-left bg-transparent border-none p-0 text-primary hover:underline cursor-pointer"
                      >
                        {article.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            <div className="mt-12 pt-8 border-t border-border text-center">
              <p className="text-muted-foreground mb-5">Понравилась статья? Остались вопросы?</p>
              <button
                onClick={goToContact}
                className="group relative inline-flex items-center justify-center gap-3 px-7 md:px-10 py-3 md:py-4 rounded-2xl font-semibold text-white bg-gradient-to-r from-primary to-accent shadow-xl shadow-primary/30 overflow-hidden transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
                <span className="relative text-sm md:text-base">Получи бесплатную консультацию</span>
              </button>
            </div>
          </motion.div>
        </section>
      </>
    );
  }

  return (
    <>
      <SEO title="Блог о маркетинге" description="Экспертные статьи о таргетированной рекламе" />
      <section className="min-h-screen bg-background py-20 px-4 sm:px-6" style={{ contain: 'layout style paint' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-end mb-4"><button onClick={goHome} className="text-sm text-muted-foreground hover:text-primary transition-colors cursor-pointer bg-transparent border-none">← На главную</button></div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold">Блог о <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">маркетинге</span></h1>
            <p className="text-muted-foreground mt-4 max-w-2xl mx-auto text-base">Экспертные статьи о кейсах, таргетированной рекламе, аналитике и стратегиях роста бизнеса</p>
          </motion.div>
          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            {allArticles.map((article, i) => (
              <motion.div key={article.id} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="group relative cursor-pointer" onClick={() => navigate(`/blog/${article.slug}`)}>
                <div className="p-5 md:p-6 rounded-2xl border border-border bg-card/70 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs px-3 py-1 rounded-full bg-primary/20 text-primary font-medium">{article.category}</span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{article.readTime}</div>
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold group-hover:text-primary transition-colors line-clamp-2">{article.title}</h2>
                  <p className="text-muted-foreground mt-3 text-sm leading-relaxed line-clamp-3 flex-1">{article.description}</p>
                  <div className="mt-5 flex items-center gap-2 text-primary text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>Читать статью</span><ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default memo(BlogPageComponent);
