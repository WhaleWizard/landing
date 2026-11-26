import { m } from 'motion/react';
import { ArrowDown, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { memo, useCallback } from 'react';
import { useScrollTo } from './hooks/useScrollTo';
import { useSiteSection } from '../hooks/useServiceContent';
import { useLandingVisibility } from '../hooks/useLandingVisibility';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
  type ContentTypography,
  withMobileTitleLines,
} from '../utils/contentTypography';

export type CallToActionContent = {
  badge: string;
  title: string;
  description: string;
  button: string;
  typography?: ContentTypography;
};

export const defaultCallToActionContent: CallToActionContent = {
  badge: 'Без брифов и созвонов на два часа',
  title: 'Расскажите, что\u00A0продвигаете',
  description: 'Пары абзацев хватит — продукт, гео и что уже пробовали. Отвечу, с чего разумнее начать: с разбора, теста или аналитики, и почему.',
  button: 'Написать мне',
};

function CallToAction({ content: contentProp = defaultCallToActionContent, contentKey = null }: { content?: CallToActionContent; contentKey?: string | null }) {
  const content = useSiteSection(contentKey, 'callToAction', contentProp);
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(withMobileTitleLines(content.typography), { minFontSize: 14 });
  const { scrollToWhenReady } = useScrollTo();
  const { contact } = useLandingVisibility();

  const scrollToContact = useCallback(() => {
    scrollToWhenReady('contact');
  }, [scrollToWhenReady]);

  return (
    <section className="relative py-12 md:py-16 overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-secondary/5" />
      
      {/* Ширина — как у основной сетки страницы: в 896 px заголовок вставал в две
          строки, а кнопка выглядела мелкой при пустых полях по бокам. */}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <m.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative p-6 md:px-10 md:py-9 lg:px-12 rounded-2xl md:rounded-3xl bg-gradient-to-br from-card/80 via-card/60 to-card/80 backdrop-blur-xl border border-primary/30 shadow-2xl shadow-primary/10"
        >
          {/* Animated Border Glow */}
          {/* Пульсация — на обёртке, размытие — на неподвижном пятне внутри: размытие рисуется один раз, а не на каждом кадре прокрутки (рывки на iPhone). Вид тот же. */}
          <div className="absolute inset-0 animate-pulse">
            <div className="h-full w-full rounded-2xl md:rounded-3xl bg-gradient-to-r from-primary via-accent to-secondary opacity-20 blur-xl" />
          </div>
          
          <div className="relative flex flex-col md:flex-row items-center justify-between gap-6 md:gap-10">
            {/* Left Content */}
            <div className="min-w-0 flex-1 text-center md:text-left space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs md:text-sm text-primary-text font-semibold">{content.badge}</span>
              </div>
              <h3 ref={titleRef} style={managedTitleStyle(content.typography)} className={`text-balance text-xl md:text-2xl lg:text-[1.75rem] font-bold leading-tight tracking-[-0.01em] ${managedTitleClasses(content.typography, 'cta')}`}>
                {content.title}
              </h3>
              <p style={managedBodyStyle(content.typography)} className={`mx-auto md:mx-0 max-w-[60ch] text-pretty text-sm md:text-base text-muted-foreground leading-relaxed ${managedBodyClasses(content.typography)}`}>
                {content.description}
              </p>
            </div>

            {/* Right Buttons */}
            {contact && <div className="flex shrink-0 flex-col sm:flex-row gap-3 md:gap-4 w-full md:w-auto">
              <Button
                onClick={scrollToContact}
                size="lg"
                className="h-12 w-full md:h-14 md:w-auto rounded-xl px-7 md:px-9 text-base md:text-lg font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden"
              >
                {/* Button Shine Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <span className="relative text-center leading-tight">{content.button}</span>
                <ArrowDown className="ml-2 w-4 h-4 md:w-5 md:h-5 group-hover:translate-y-1 transition-transform relative" />
              </Button>
            </div>}
          </div>
        </m.div>
      </div>
    </section>
  );
}

export default memo(CallToAction);
