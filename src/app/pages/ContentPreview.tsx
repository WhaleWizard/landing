import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import Hero, { defaultHeroContent, type HeroContent } from '../components/Hero';
import { heroTitleTotalDurationMs } from '../components/HeroTitleEffect';
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
  getContentFontDefinition,
  managedBodyClasses,
  managedBodyStyle,
  managedTitleClasses,
  managedTitleStyle,
  useManagedTitleFit,
} from '../utils/contentTypography';
import type { EditableContent, EditorSection } from '../components/admin/AdminContentControl';
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

type PreviewFontRequest = {
  descriptor: string;
  sample: string;
};

function contentTextSample(value: unknown): string {
  const parts: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      parts.push(item);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  const uniqueCharacters = Array.from(new Set(parts.join(''))).join('');
  return uniqueCharacters.slice(0, 512) || 'Whale Wizard АБВГД абвгд 0123456789';
}

function previewFontRequests(payload: ContentPreviewPayload): PreviewFontRequest[] {
  const block = payload.content[payload.section];
  if (!block || payload.section === 'seo' || !('typography' in block)) return [];

  const typography = block.typography;
  const sample = contentTextSample(block);
  const requests = new Map<string, PreviewFontRequest>();
  const add = (fontId: unknown, weight: unknown, fallbackWeight: number) => {
    const definition = getContentFontDefinition(fontId);
    if (definition.id === 'auto' || !definition.cssFamily) return;
    const resolvedWeight = typeof weight === 'number' ? weight : fallbackWeight;
    const descriptor = `normal ${resolvedWeight} 32px ${definition.cssFamily}`;
    requests.set(descriptor, { descriptor, sample });
  };

  add(typography.titleFont, typography.titleWeight, 700);
  add(typography.bodyFont, 400, 400);
  if (payload.section === 'hero') {
    payload.content.hero.titleLines.forEach((line) => add(line.font, typography.titleWeight, 700));
  }
  return Array.from(requests.values());
}

/**
 * The iframe stays hidden until the exact selected faces have loaded. A
 * revision-based state makes it hidden in the same render that swaps fonts,
 * so an old or fallback face never gets a visible frame.
 */
function usePreviewFontsReady(payload: ContentPreviewPayload | null): boolean {
  const [readyRevision, setReadyRevision] = useState<number | null>(null);
  const requests = useMemo(() => payload ? previewFontRequests(payload) : [], [payload]);

  useEffect(() => {
    if (!payload) return undefined;
    let cancelled = false;
    const revision = payload.revision;

    const load = async () => {
      const fontSet = document.fonts;
      if (fontSet) {
        await Promise.all(requests.map(({ descriptor, sample }) => (
          fontSet.load(descriptor, sample).catch(() => [])
        )));
        await fontSet.ready.catch(() => undefined);
      }
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      });
      if (!cancelled) setReadyRevision(revision);
    };

    void load();
    return () => { cancelled = true; };
  }, [payload, requests]);

  return Boolean(payload && readyRevision === payload.revision);
}

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

/** Пауза между повторами, чтобы зацикленный эффект не мельтешил. */
const EFFECT_LOOP_PAUSE_MS = 900;

/**
 * Показ эффекта появления заголовка.
 *
 * Эффект длится меньше секунды, а кадр предпросмотра маленький: разово
 * проиграв его один раз, владелец просто не успевал ничего увидеть. Поэтому
 * пока он находится в блоке «Хиро» и подбирает анимацию, она повторяется по
 * кругу. Как только начинается правка текста — замирает в готовом виде, иначе
 * заголовок дёргается под руками и выглядит обрезанным.
 *
 * Перезапуск сделан переключением атрибута, а не пересозданием разметки:
 * `settled` гасит анимацию через `animation: none`, и снятие этого состояния
 * запускает её заново само. Пересоздавать ради этого целую страницу дорого.
 */
function useHeroEffectPlayback({
  section,
  totalMs,
  effectSignature,
  textSignature,
  replayKey,
}: {
  section: EditorSection;
  totalMs: number;
  effectSignature: string;
  textSignature: string;
  replayKey: number;
}): 'playing' | 'settled' {
  const [frozenByTyping, setFrozenByTyping] = useState(false);
  const previous = useRef({ effectSignature, textSignature, replayKey, section });

  useEffect(() => {
    const last = previous.current;
    previous.current = { effectSignature, textSignature, replayKey, section };
    if (last.effectSignature !== effectSignature || last.replayKey !== replayKey || last.section !== section) {
      setFrozenByTyping(false);
    } else if (last.textSignature !== textSignature) {
      setFrozenByTyping(true);
    }
  }, [effectSignature, textSignature, replayKey, section]);

  const looping = section === 'hero' && totalMs > 0 && !frozenByTyping;
  const [phase, setPhase] = useState<'playing' | 'settled'>('settled');

  useEffect(() => {
    if (!looping) {
      setPhase('settled');
      return undefined;
    }
    let cancelled = false;
    let timer = 0;
    const play = () => {
      setPhase('playing');
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setPhase('settled');
        timer = window.setTimeout(() => { if (!cancelled) play(); }, EFFECT_LOOP_PAUSE_MS);
      }, totalMs + 120);
    };
    play();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [looping, totalMs, effectSignature, replayKey]);

  return phase;
}

function ContentPreviewSurface({
  payload,
  fontsReady,
}: {
  payload: ContentPreviewPayload;
  fontsReady: boolean;
}) {
  const { page, section, content, replayKey = 0 } = payload;
  const source = page === 'home' ? null : pageConfigs[page];
  const theme = page === 'home' ? null : SERVICE_THEMES[page];
  const style = theme ? {
    '--primary': theme.primary,
    '--accent': theme.accent,
    '--secondary': theme.secondary,
    '--ring': theme.primary,
  } as CSSProperties : undefined;

  // A preview renders one block at a time. Merging every large block on every
  // keystroke used to do work whose result could not possibly be displayed.
  const hero = section === 'hero'
    ? mergeContent<HeroContent>(source?.hero ?? defaultHeroContent, content.hero)
    : null;
  const services = section === 'services'
    ? mergeContent<ServicesContent>(source?.services ?? defaultServicesContent, content.services)
    : null;
  const cases = section === 'cases'
    ? mergeContent<CasesContent>(source?.cases ?? defaultCasesContent, content.cases)
    : null;
  const cta = section === 'cta'
    ? mergeContent<CallToActionContent>(source?.cta ?? defaultCallToActionContent, content.cta)
    : null;
  const testimonials = section === 'testimonials'
    ? mergeContent<TestimonialsContent & { stats?: TestimonialStat[] }>(
      page === 'meta-apps' ? META_APPS_TESTIMONIAL_CONTENT : defaultTestimonialsContent,
      content.testimonials,
    )
    : null;

  // Длительность считается из настроек самой анимации: раньше здесь стояло
  // фиксированное окно, и медленная «печатная машинка» не успевала доиграть.
  const heroLines = hero?.titleLines?.length
    ? hero.titleLines
    : hero ? [
      { text: String(hero.titlePrefix || ''), effect: undefined, speed: undefined },
      { text: String(hero.titleAccent || ''), effect: undefined, speed: undefined },
    ] : [];
  const totalMs = hero ? heroTitleTotalDurationMs(heroLines, hero.titleAnimation) : 0;
  const effectSignature = JSON.stringify([
    hero?.titleAnimation,
    hero?.titleLines?.map((line) => [line.effect, line.speed]),
  ]);
  const textSignature = heroLines.map((line) => line.text).join(' ');
  const heroPhase = useHeroEffectPlayback({ section, totalMs, effectSignature, textSignature, replayKey });

  return (
    <main
      // Перерисовка только при смене страницы или блока. Перезапуск эффекта
      // идёт через data-hero-effects и разметку не пересоздаёт.
      key={`${page}-${section}`}
      className="ww-content-preview-page marketing-typography min-h-screen overflow-x-hidden bg-background text-foreground"
      style={{ ...style, pointerEvents: 'none', visibility: fontsReady ? 'visible' : 'hidden' }}
      aria-busy={!fontsReady}
      data-preview-section={section}
      data-hero-effects={heroPhase}
    >
      {section === 'seo' ? <SeoPreview content={content.seo} /> : null}
      {section === 'hero' ? (
        hero && (page === 'meta-ads' ? <MetaAdsEditorialHero content={hero} />
          : page === 'consult' ? <ConsultStudioHero content={hero} />
            : <Hero content={hero} visual={page === 'meta-apps' ? 'meta-apps' : 'default'} staticMotion />)
      ) : null}
      {section === 'services' && services ? <Services content={services} /> : null}
      {section === 'cases' && cases ? <Cases content={cases} staticMotion /> : null}
      {section === 'cta' && cta ? <CallToAction content={cta} /> : null}
      {section === 'testimonials' ? (
        testimonials ? <Testimonials
          content={testimonials}
          stats={testimonials.stats ?? defaultTestimonialsStats}
        /> : null
      ) : null}
      {section === 'contact' ? (
        page === 'home'
          ? <HomeContactCopy content={content.contact} />
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

/** Сообщает редактору финальную высоту блока и результат подгонки заголовка. */
function usePreviewReport(payload: ContentPreviewPayload | null, fontsReady: boolean) {
  useEffect(() => {
    if (!payload || !fontsReady) return undefined;
    let cancelled = false;
    let animationFrame = 0;
    let timer = 0;
    let lastSignature = '';

    const root = document.querySelector<HTMLElement>('.ww-content-preview-page');
    if (!root) return undefined;

    const report = () => {
      if (cancelled) return;
      animationFrame = 0;
      const clippedTitleLines = payload.section === 'hero'
        ? findClippedTitleLines(root)
        : [];
      const contentHeight = Math.ceil(Math.max(
        root.scrollHeight,
        root.getBoundingClientRect().height,
      ));
      const signature = JSON.stringify([clippedTitleLines, contentHeight]);
      if (signature === lastSignature) return;
      lastSignature = signature;
      const message: ContentPreviewReport = {
        type: CONTENT_PREVIEW_REPORT_MESSAGE,
        revision: payload.revision,
        clippedTitleLines,
        contentHeight,
      };
      window.parent.postMessage(message, window.location.origin);
    };

    const scheduleReport = () => {
      if (cancelled || animationFrame) return;
      animationFrame = window.requestAnimationFrame(report);
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleReport)
      : null;
    resizeObserver?.observe(root);
    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(scheduleReport)
      : null;
    mutationObserver?.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style'],
      characterData: true,
      childList: true,
      subtree: true,
    });
    window.addEventListener('resize', scheduleReport, { passive: true });
    scheduleReport();
    // Title fitting itself is requestAnimationFrame-based. This final pass
    // catches a fit whose outer box happened to keep the same dimensions.
    timer = window.setTimeout(report, 260);

    return () => {
      cancelled = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', scheduleReport);
    };
  }, [fontsReady, payload]);
}

export default function ContentPreview() {
  const [payload, setPayload] = useState<ContentPreviewPayload | null>(null);
  const fontsReady = usePreviewFontsReady(payload);
  usePreviewReport(payload, fontsReady);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const next = event.data as Partial<ContentPreviewPayload> | null;
      if (!next || next.type !== CONTENT_PREVIEW_MESSAGE || !next.content || !next.page || !next.section) return;
      if (!PREVIEW_PAGES.has(next.page) || !PREVIEW_SECTIONS.has(next.section)) return;
      if (!Number.isInteger(next.revision) || Number(next.revision) < 1) return;
      setPayload((current) => current?.revision === next.revision
        ? current
        : next as ContentPreviewPayload);
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
      {payload ? <ContentPreviewSurface payload={payload} fontsReady={fontsReady} /> : waiting}
    </>
  );
}
