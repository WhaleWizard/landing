import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import Hero, { defaultHeroContent, type HeroContent } from '../components/Hero';
import Services, { defaultServicesContent, type ServicesContent } from '../components/Services';
import Cases, { defaultCasesContent, type CasesContent } from '../components/Cases';
import CallToAction, { defaultCallToActionContent, type CallToActionContent } from '../components/CallToAction';
import Testimonials, {
  defaultTestimonialsContent,
  defaultTestimonialsStats,
  type TestimonialStat,
  type TestimonialsContent,
} from '../components/Testimonials';
import MetaAdsEditorialHero from '../components/service-heroes/MetaAdsEditorialHero';
import ConsultStudioHero from '../components/service-heroes/ConsultStudioHero';
import SEO from '../components/SEO';
import {
  META_APPS_TESTIMONIAL_CONTENT,
  pageConfigs,
  type ServiceType,
} from './ServiceLandingPage';
import { mergeContent } from '../hooks/useServiceContent';
import {
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
} from '../utils/contentTypography';
import type { EditableContent } from '../components/admin/AdminContentControl';
import {
  CONTENT_PREVIEW_MESSAGE,
  CONTENT_PREVIEW_READY_MESSAGE,
  CONTENT_PREVIEW_REPORT_MESSAGE,
  type ContentPreviewPayload,
  type ContentPreviewReport,
} from '../content/contentPreviewProtocol';

const SERVICE_THEMES: Record<ServiceType, {
  primary: string;
  accent: string;
  secondary: string;
  badgeClassName: string;
  sparkleClassName: string;
  labelClassName: string;
  titleGradientClassName: string;
  checkGradientClassName: string;
  shadowClassName: string;
}> = {
  'meta-ads': {
    primary: '#4F7DFF', accent: '#B04DFF', secondary: '#FF7AB6',
    badgeClassName: 'bg-[#4F7DFF]/10 border-[#4F7DFF]/20', sparkleClassName: 'text-[#4F7DFF]',
    labelClassName: 'text-[#4F7DFF]', titleGradientClassName: 'from-[#4F7DFF] via-[#B04DFF] to-[#FF7AB6]',
    checkGradientClassName: 'from-[#4F7DFF] to-[#B04DFF]', shadowClassName: 'shadow-[#4F7DFF]/20',
  },
  'meta-apps': {
    primary: '#4F7DFF', accent: '#B04DFF', secondary: '#FF7AB6',
    badgeClassName: 'bg-[#4F7DFF]/10 border-[#4F7DFF]/20', sparkleClassName: 'text-[#4F7DFF]',
    labelClassName: 'text-[#4F7DFF]', titleGradientClassName: 'from-[#4F7DFF] via-[#B04DFF] to-[#FF7AB6]',
    checkGradientClassName: 'from-[#4F7DFF] to-[#B04DFF]', shadowClassName: 'shadow-[#4F7DFF]/20',
  },
  'google-ads': {
    primary: '#4285F4', accent: '#34A853', secondary: '#FBBC04',
    badgeClassName: 'bg-[#4285F4]/10 border-[#4285F4]/20', sparkleClassName: 'text-[#4285F4]',
    labelClassName: 'text-[#4285F4]', titleGradientClassName: 'from-[#4285F4] via-[#34A853] to-[#FBBC04]',
    checkGradientClassName: 'from-[#4285F4] to-[#34A853]', shadowClassName: 'shadow-[#4285F4]/20',
  },
  consult: {
    primary: '#8B5CF6', accent: '#6366F1', secondary: '#3B82F6',
    badgeClassName: 'bg-primary/10 border-primary/20', sparkleClassName: 'text-primary',
    labelClassName: 'text-primary', titleGradientClassName: 'from-primary via-accent to-secondary',
    checkGradientClassName: 'from-primary to-accent', shadowClassName: 'shadow-primary/20',
  },
};

const PREVIEW_PAGES = new Set(['home', 'meta-ads', 'meta-apps', 'google-ads', 'consult']);
const PREVIEW_SECTIONS = new Set(['seo', 'hero', 'services', 'cases', 'cta', 'testimonials', 'contact']);

function ServiceContactCopy({ page, content }: { page: ServiceType; content: EditableContent['contact'] }) {
  const theme = SERVICE_THEMES[page];
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(content.typography, { minFontSize: 16 });
  return (
    <section id="contact" className="relative overflow-hidden py-16 md:py-24">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <div className={`mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-sm ${theme.badgeClassName}`}>
              <Sparkles className={`h-4 w-4 ${theme.sparkleClassName}`} aria-hidden="true" />
              <span className={`text-sm font-semibold ${theme.labelClassName}`}>{content.badge}</span>
            </div>
            <h2 ref={titleRef} style={managedTitleStyle(content.typography)} className={`mb-6 text-balance text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl lg:text-[44px] ${managedTitleClasses(content.typography, 'contact')}`}>
              {content.titlePrefix}{' '}
              <span className={`bg-gradient-to-r ${theme.titleGradientClassName} bg-clip-text text-transparent`}>
                {content.titleAccent}
              </span>
            </h2>
            <p style={managedBodyStyle(content.typography)} className={`mx-auto mb-8 max-w-lg text-pretty text-base leading-relaxed text-muted-foreground md:text-lg lg:mx-0 ${managedBodyClasses(content.typography)}`}>
              {content.description}
            </p>
            <div className="mx-auto max-w-md space-y-4 lg:mx-0">
              {/* Ключ по позиции: два одинаковых пункта — законный ввод. */}
              {content.bullets.map((item, index) => (
                <div key={index} className="flex items-center gap-3 text-left">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-r ${theme.checkGradientClassName} shadow-lg ${theme.shadowClassName}`}>
                    <CheckCircle2 className="h-4 w-4 text-white" aria-hidden="true" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-[420px] rounded-3xl border border-white/10 bg-card/40" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function HomeContactCopy({ content }: { content: EditableContent['contact'] }) {
  const titleRef = useManagedTitleFit<HTMLHeadingElement>(content.typography, { minFontSize: 16 });
  return (
    <section id="contact" className="relative overflow-hidden py-16 md:py-24">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-8 md:gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-gradient-to-r from-primary/10 to-accent/10 px-4 py-2 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-semibold text-primary">{content.badge}</span>
            </div>
            <h2 ref={titleRef} style={managedTitleStyle(content.typography)} className={`max-w-[20ch] text-balance text-2xl font-bold leading-[1.12] sm:text-3xl md:text-4xl lg:text-5xl ${managedTitleClasses(content.typography, 'contact')}`}>
              {content.titlePrefix}{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                {content.titleAccent}
              </span>
            </h2>
            <p style={managedBodyStyle(content.typography)} className={`max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg ${managedBodyClasses(content.typography)}`}>
              {content.description}
            </p>
            <div className="space-y-4 pt-4">
              {content.benefits.map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-gradient-to-br from-primary/20 to-accent/20" aria-hidden="true">
                    <CheckCircle2 className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <strong className="mb-1 block font-semibold text-foreground">{item.title}</strong>
                    <span className="block text-pretty text-sm leading-relaxed text-muted-foreground">{item.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-[440px] rounded-3xl border border-primary/20 bg-card/40" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

function SeoPreview({ content }: { content: EditableContent['seo'] }) {
  return (
    <main className="min-h-screen bg-background px-5 py-16 text-foreground sm:px-8">
      <section className="mx-auto max-w-[680px] rounded-2xl border border-border bg-card p-6 shadow-xl">
        <p className="mb-2 text-sm text-emerald-500">www.whalewzrd.com</p>
        <h1 className="text-xl font-medium leading-snug text-[#8ab4f8] sm:text-2xl">{content.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{content.description}</p>
      </section>
    </main>
  );
}

/**
 * Сколько предпросмотр даёт эффекту отыграть, прежде чем показать конечный
 * вид. С запасом на «печатную машинку» на медленной скорости и на задержку
 * между строками.
 */
const EFFECT_PLAYBACK_MS = 6_000;

function ContentPreviewSurface({ payload }: { payload: ContentPreviewPayload }) {
  const { page, section, content, replayKey = 0 } = payload;
  // Эффект проигрывается один раз: при открытии блока, при смене самой
  // анимации и по кнопке «Повторить». Правка текста его не перезапускает —
  // иначе заголовок в предпросмотре постоянно выглядел бы обрезанным.
  const effectSignature = JSON.stringify([
    content.hero?.titleAnimation,
    content.hero?.titleLines?.map((line) => [line.effect, line.speed]),
  ]);
  const [effectsSettled, setEffectsSettled] = useState(false);
  useEffect(() => {
    setEffectsSettled(false);
    const timer = window.setTimeout(() => setEffectsSettled(true), EFFECT_PLAYBACK_MS);
    return () => window.clearTimeout(timer);
  }, [page, section, replayKey, effectSignature]);

  const source = page === 'home' ? null : pageConfigs[page];
  const theme = page === 'home' ? null : SERVICE_THEMES[page];
  const style = theme ? {
    '--primary': theme.primary,
    '--accent': theme.accent,
    '--secondary': theme.secondary,
    '--ring': theme.primary,
  } as CSSProperties : undefined;

  const hero = mergeContent<HeroContent>(source?.hero ?? defaultHeroContent, content.hero);
  const services = mergeContent<ServicesContent>(source?.services ?? defaultServicesContent, content.services);
  const cases = mergeContent<CasesContent>(source?.cases ?? defaultCasesContent, content.cases);
  const cta = mergeContent<CallToActionContent>(source?.cta ?? defaultCallToActionContent, content.cta);
  const testimonialSource = page === 'meta-apps' ? META_APPS_TESTIMONIAL_CONTENT : defaultTestimonialsContent;
  const testimonials = mergeContent<TestimonialsContent & { stats?: TestimonialStat[] }>(testimonialSource, content.testimonials);
  const contact = content.contact;

  return (
    <main
      key={`${page}-${section}-${replayKey}-${effectSignature}`}
      className="ww-content-preview-page marketing-typography min-h-screen overflow-x-hidden bg-background text-foreground"
      style={{ ...style, pointerEvents: 'none' }}
      data-preview-section={section}
      data-hero-effects={effectsSettled ? 'settled' : 'playing'}
    >
      {section === 'seo' ? <SeoPreview content={content.seo} /> : null}
      {section === 'hero' ? (
        page === 'meta-ads' ? <MetaAdsEditorialHero content={hero} />
          : page === 'consult' ? <ConsultStudioHero content={hero} />
            : <Hero content={hero} visual={page === 'meta-apps' ? 'meta-apps' : 'default'} staticMotion />
      ) : null}
      {section === 'services' ? <Services content={services} /> : null}
      {section === 'cases' ? <Cases content={cases} /> : null}
      {section === 'cta' ? <CallToAction content={cta} /> : null}
      {section === 'testimonials' ? (
        <Testimonials
          content={testimonials}
          stats={testimonials.stats ?? defaultTestimonialsStats}
        />
      ) : null}
      {section === 'contact' ? (
        page === 'home'
          ? <HomeContactCopy content={contact} />
          : <ServiceContactCopy page={page} content={content.contact} />
      ) : null}
    </main>
  );
}

/** Строки заголовка, которым не хватило ширины даже после уменьшения кегля. */
function findClippedTitleLines(root: ParentNode): string[] {
  const heading = root.querySelector('h1');
  if (!heading) return [];
  const box = heading.getBoundingClientRect();
  const computed = window.getComputedStyle(heading);
  const left = box.left + (Number.parseFloat(computed.paddingLeft) || 0);
  const right = box.right - (Number.parseFloat(computed.paddingRight) || 0);
  if (right - left <= 0) return [];

  return Array.from(heading.children).flatMap((child) => {
    const range = document.createRange();
    range.selectNodeContents(child);
    const rectangles = Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5);
    range.detach?.();
    const overflows = rectangles.some((rect) => rect.right > right + 1 || rect.left < left - 1);
    const text = child.textContent?.trim();
    return overflows && text ? [text] : [];
  });
}

/**
 * Сообщает редактору о заголовках, которые не помещаются. Замер откладывается
 * до загрузки шрифтов: до неё ширина строки считается по системной подмене и
 * ничего не значит.
 */
function useClippedTitleReport(payload: ContentPreviewPayload | null) {
  useEffect(() => {
    if (!payload || payload.section !== 'hero') return;
    let cancelled = false;

    const report = () => {
      if (cancelled) return;
      const message: ContentPreviewReport = {
        type: CONTENT_PREVIEW_REPORT_MESSAGE,
        clippedTitleLines: findClippedTitleLines(document),
      };
      window.parent.postMessage(message, window.location.origin);
    };

    const timer = window.setTimeout(report, 260);
    void document.fonts?.ready.then(report).catch(() => undefined);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [payload]);
}

export default function ContentPreview() {
  const [payload, setPayload] = useState<ContentPreviewPayload | null>(null);
  useClippedTitleReport(payload);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const next = event.data as Partial<ContentPreviewPayload> | null;
      if (!next || next.type !== CONTENT_PREVIEW_MESSAGE || !next.content || !next.page || !next.section) return;
      if (!PREVIEW_PAGES.has(next.page) || !PREVIEW_SECTIONS.has(next.section)) return;
      setPayload(next as ContentPreviewPayload);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: CONTENT_PREVIEW_READY_MESSAGE }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);

  const waiting = useMemo(() => (
    <main className="grid min-h-screen place-items-center bg-background p-8 text-center text-muted-foreground">
      <p>Подготавливаю точный предпросмотр…</p>
    </main>
  ), []);

  return (
    <>
      <SEO title="Предпросмотр редактора" description="Внутренний предпросмотр редактора сайта" url="/admin/content-preview" noIndex />
      {payload ? <ContentPreviewSurface payload={payload} /> : waiting}
    </>
  );
}
