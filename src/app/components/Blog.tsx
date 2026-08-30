// src/app/components/Blog.tsx
import { motion } from 'motion/react';
import { ArrowRight, Clock, BookOpen, MoveHorizontal } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';
import { useRef, memo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useArticles } from '../context/ArticlesContext';
import { hasCustomCover } from '../utils/articleCover';
import { formatReadTime } from '../utils/articleMeta';
import { isCaseArticle } from '../utils/articleCategory';
import { useDragScroll } from '../hooks/useDragScroll';
import ArticlesLoadError from './ArticlesLoadError';
import { withReturnTo } from '../utils/siteNavigation';

function Blog() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useDragScroll(scrollContainerRef);
  const navigate = useNavigate();
  const location = useLocation();
  const { articles, loading, error: articlesError, refreshArticles } = useArticles();
  const blogArticles = articles.filter((article) => !isCaseArticle(article));

  const openArticle = useCallback((slug: string) => {
    navigate(`/blog/${slug}`, {
      state: withReturnTo(location),
    });
  }, [location, navigate]);

  if (loading) return <div className="py-16 text-center text-muted-foreground">Загружаю материалы...</div>;
  if (articlesError && articles.length === 0) {
    return <ArticlesLoadError onRetry={refreshArticles} className="mx-auto my-16 max-w-3xl" />;
  }

  return (
    <section id="blog" className="relative py-16 md:py-24 overflow-x-clip overflow-y-visible">
      <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-accent/10 via-transparent to-transparent rounded-full blur-3xl" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-12 md:mb-16">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }} className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-accent/10 border border-accent/20 backdrop-blur-sm mb-4 md:mb-6">
            <BookOpen className="w-3 h-3 md:w-4 md:h-4 text-accent" />
            <span className="text-xs md:text-sm text-accent">Статьи и разборы</span>
          </div>
          <h2 className="text-balance text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 md:mb-4">
            Практика рекламы{' '}
            <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">и аналитики</span>
          </h2>
          <p className="text-pretty text-sm md:text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto">
            Разбираю запуски, аналитику и решения, которые влияют на заявки и продажи.
          </p>
        </motion.div>
      </div>
      <div className="relative w-full">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          whileInView={{ opacity: 0.8, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="flex justify-center pb-3 md:pb-4"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-background/40 backdrop-blur-sm">
            <MoveHorizontal className="w-3.5 h-3.5 text-primary" />
            <motion.div
              className="h-1.5 w-10 rounded-full bg-gradient-to-r from-primary/30 via-primary/80 to-primary/30"
              animate={{ x: [-4, 4, -4] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>
        </motion.div>
        <div className="absolute left-0 top-0 bottom-0 w-16 md:w-48 bg-gradient-to-r from-background via-background/70 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 md:w-48 bg-gradient-to-l from-background via-background/70 to-transparent z-10 pointer-events-none" />
        <div ref={scrollContainerRef} className="blog-carousel-scroll scrollbar-brand flex gap-5 md:gap-7 overflow-x-auto px-5 pb-10 pt-5 md:px-10 -mt-5" style={{ WebkitOverflowScrolling: 'touch', cursor: 'grab' }}>
          {/*
            Карточка — настоящая ссылка, а не кликабельный div. Это было
            единственное место на сайте, где статью нельзя было открыть с
            клавиатуры: у div нет ни фокуса, ни реакции на Enter. Заодно
            вернулись средняя кнопка мыши и «открыть в новой вкладке», а адрес
            виден в строке состояния. Классы и анимации прежние — внешне
            карточка не изменилась. Тот же приём уже применён в витрине кейсов.
          */}
          {blogArticles.map((article) => (
            <motion.a
              key={article.slug}
              href={`/blog/${article.slug}`}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                openArticle(article.slug);
              }}
              className="flex-shrink-0 w-[280px] sm:w-[320px] md:w-[360px] group cursor-pointer no-underline text-inherit"
              whileHover={{ y: -8 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.3 }}
            >
              <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-card/40 backdrop-blur-md border border-white/10 hover:border-primary/50 transition-all duration-300 h-full shadow-lg shadow-primary/5">
                <div className="relative h-44 sm:h-48 md:h-56 overflow-hidden bg-gradient-to-br from-[#181430] via-[#121220] to-[#0d1726]">
                  {/* Статьи без своей обложки получают градиентную подложку вместо повторяющегося брендового изображения */}
                  <div className="absolute -top-10 -left-10 h-40 w-40 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
                  <div className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
                  <span className="absolute inset-0 flex select-none items-center justify-center text-2xl font-black tracking-tight text-white/[0.08]" aria-hidden="true">Whale Wizard</span>
                  {hasCustomCover(article.image) && (
                    <ImageWithFallback src={article.image} alt={article.title} className="relative w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute top-3 md:top-4 left-3 md:left-4 px-3 py-1 md:px-4 md:py-2 rounded-full bg-primary/30 backdrop-blur-md border border-white/20">
                    <span className="text-xs md:text-sm font-semibold text-white">{article.category}</span>
                  </div>
                </div>
                <div className="p-4 md:p-6 space-y-3 md:space-y-4">
                  <div className="flex items-center gap-3 md:gap-4 text-xs md:text-sm text-white/70">
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3 md:w-4 md:h-4" /><span>{formatReadTime(article.readTime)}</span></div>
                    <div className="h-1 w-1 rounded-full bg-white/30" /><span>{article.date}</span>
                  </div>
                  <h3 className="text-base md:text-lg lg:text-xl font-bold text-white group-hover:text-primary transition-colors">{article.title}</h3>
                  <p className="text-xs md:text-sm text-white/60 leading-relaxed line-clamp-2">{article.description}</p>
                  <div className="flex items-center gap-2 text-xs md:text-sm text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="font-semibold">Открыть материал</span>
                    <ArrowRight className="w-3 h-3 md:w-4 md:h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              </div>
            </motion.a>
          ))}
        </div>
      </div>
      <style>{`
        .blog-carousel-scroll { -webkit-overflow-scrolling: touch; cursor: grab; }
        .blog-carousel-scroll:active { cursor: grabbing; }
      `}</style>
      <div className="relative mt-14 md:mt-20 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/blog', { state: withReturnTo(location) })}
            data-route-preload="/blog"
            className="group relative inline-flex items-center justify-center gap-3 px-10 md:px-14 py-4 md:py-5 rounded-2xl font-semibold text-white bg-gradient-to-r from-primary to-accent shadow-xl shadow-primary/30 overflow-hidden transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-120%] group-hover:translate-x-[120%] transition-transform duration-1000" />
          <span className="relative text-sm md:text-base lg:text-lg">Смотреть все материалы</span>
          <ArrowRight className="w-4 h-4 md:w-5 md:h-5 relative group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </section>
  );
}

export default memo(Blog);
