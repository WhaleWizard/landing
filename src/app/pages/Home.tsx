import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  startTransition,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import SEO from '../components/SEO';
import { useSiteContent } from '../hooks/useServiceContent';
import { applyLandingLayout, normalizeLandingSections, type LandingLayout } from '../data/landingLayout';
import { LandingVisibility } from '../hooks/useLandingVisibility';
import { useIsPathHiddenInNav } from '../utils/pageLocks';
import { alignDeferredAnchor, precedesDeferredHashTarget } from '../utils/deferredAnchor';
import { memoizedImport } from '../utils/memoizedImport';
import { useWarmSections } from '../utils/sectionWarmup';
import { hasGeneratedFirstScreen } from '../utils/firstScreen';
import { isBotUserAgent } from '../utils/isBotUserAgent';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
// The mobile cosmic stage participates in document flow. Load its geometry
// with the Home route (rather than the nested lazy scene) so Suspense reserves
// 320–430px immediately without making non-cosmic service heroes download it.
// import '../../styles/cosmic-hero.css' -> consolidated into src/styles/index.css for single-stylesheet SSR CRP

const defaultHomeSeo = {
  title: 'Таргетолог Instagram и Facebook, специалист по Google Ads',
  description: 'Настраиваю и веду рекламу в Instagram, Facebook и Google для бизнеса и мобильных приложений: заявки, продажи, установки. Pixel, Conversions API, GA4 и данные CRM. Удалённо, по всему миру.',
};
const defaultHomeSettings: LandingLayout & { seo: typeof defaultHomeSeo } = { seo: defaultHomeSeo };

const loadServices = memoizedImport(() => import('../components/Services'));
const Services = lazy(loadServices);
const loadCases = memoizedImport(() => import('../components/Cases'));
const Cases = lazy(loadCases);
const loadCallToAction = memoizedImport(() => import('../components/CallToAction'));
const CallToAction = lazy(loadCallToAction);
const loadTestimonials = memoizedImport(() => import('../components/Testimonials'));
const Testimonials = lazy(loadTestimonials);
const loadBlog = memoizedImport(() => import('../components/Blog'));
const Blog = lazy(loadBlog);
const loadSocialBar = memoizedImport(() => import('../components/SocialBar'));
const SocialBar = lazy(loadSocialBar);
const loadContactForm = memoizedImport(() => import('../components/ContactForm'));
const ContactForm = lazy(loadContactForm);
const loadFooter = memoizedImport(() => import('../components/Footer'));
const Footer = lazy(loadFooter);
const loadCalculatorButtons = memoizedImport(() => import('../components/CalculatorButtons'));
const CalculatorButtons = lazy(loadCalculatorButtons);

const HOME_SECTION_LOADERS = [
  loadServices,
  loadCases,
  loadCallToAction,
  loadTestimonials,
  loadBlog,
  loadSocialBar,
  loadCalculatorButtons,
  loadContactForm,
  loadFooter,
];

type DeferredSectionHeights = {
  mobile: number;
  tablet: number;
  desktop: number;
};

type DeferredSectionStyle = CSSProperties & {
  '--home-deferred-mobile': string;
  '--home-deferred-tablet': string;
  '--home-deferred-desktop': string;
};

function SectionSkeleton({ heights }: { heights: DeferredSectionHeights }) {
  const style: DeferredSectionStyle = {
    '--home-deferred-mobile': `${heights.mobile}px`,
    '--home-deferred-tablet': `${heights.tablet}px`,
    '--home-deferred-desktop': `${heights.desktop}px`,
  };

  return (
    <div
      className="min-h-[var(--home-deferred-mobile)] w-full md:min-h-[var(--home-deferred-tablet)] lg:min-h-[var(--home-deferred-desktop)]"
      style={style}
      data-home-placeholder=""
      aria-hidden="true"
    />
  );
}

function hashTargetsSection(anchorId?: string) {
  if (typeof window === 'undefined' || !anchorId) return false;
  const rawHash = window.location.hash.slice(1);
  if (!rawHash) return false;

  try {
    return decodeURIComponent(rawHash) === anchorId;
  } catch {
    return rawHash === anchorId;
  }
}

function DeferredSection({
  children,
  anchorId,
  heights,
}: {
  children: ReactNode;
  anchorId?: string;
  heights: DeferredSectionHeights;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigationType = useNavigationType();
  // На сборке и в первом кадре браузера секция — заглушка своей высоты:
  // генератор страниц рендерит это же дерево, и React потом гидратирует его,
  // а не перестраивает. Браузер без IntersectionObserver и прямой переход по
  // якорю поднимают секцию сразу после монтирования (эффект ниже).
  const [shouldRender, setShouldRender] = useState(() => {
    if (!hasGeneratedFirstScreen(location.pathname, location.key) && hashTargetsSection(anchorId)) return true;
    if (typeof navigator !== 'undefined' && isBotUserAgent(navigator.userAgent)) return true;
    return false;
  });

  useEffect(() => {
    if (shouldRender) return;

    if (typeof window !== 'undefined' && window.innerHeight >= 3000) {
      setShouldRender(true);
      return;
    }
    const section = sectionRef.current;
    if (!section || typeof window.IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const mount = () => startTransition(() => setShouldRender(true));
    const mountForHash = () => {
      // Deep links need the real heights above their target. Keep ordinary
      // (hashless) loads lazy and leave sections after the target deferred.
      if (precedesDeferredHashTarget(section)) mount();
    };
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const rootMargin = isMobile ? '120px 0px' : '800px 0px';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        mount();
      },
      // One screen of lead time lets the next chunk settle before a gesture
      // reaches it, without mounting all below-the-fold sections at LCP.
      { rootMargin, threshold: 0 },
    );

    observer.observe(section);
    window.addEventListener('hashchange', mountForHash);
    window.addEventListener('beforeprint', mount);
    mountForHash();

    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', mountForHash);
      window.removeEventListener('beforeprint', mount);
    };
  }, [anchorId, location.hash, location.key, shouldRender]);

  useEffect(() => {
    const shouldAlignHash = navigationType !== 'POP' || location.key === 'default';
    if (!shouldAlignHash || !shouldRender || !anchorId || !hashTargetsSection(anchorId)) return;

    const section = sectionRef.current;
    if (section) return alignDeferredAnchor(anchorId, section);
  }, [anchorId, location.hash, location.key, navigationType, shouldRender]);

  return (
    <section ref={sectionRef} data-home-section="" data-home-anchor={anchorId} id={shouldRender ? undefined : anchorId}>
      {shouldRender ? (
        <SectionErrorBoundary fallback={<SectionSkeleton heights={heights} />} anchorId={anchorId}>
          <Suspense fallback={<SectionSkeleton heights={heights} />}>{children}</Suspense>
        </SectionErrorBoundary>
      ) : (
        <SectionSkeleton heights={heights} />
      )}
    </section>
  );
}

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const layout = useSiteContent('site:home', defaultHomeSettings);
  const { seo } = layout;
  const contactHidden = layout.hiddenSections?.includes('contact');
  useEffect(() => {
    if (location.hash !== '#contact' || !contactHidden) return;
    // Calculator and other pages can still link to the original contact anchor.
    const { pathname, search, state } = location;
    void navigate({ pathname, search, hash: '#social' }, { replace: true, state });
  }, [contactHidden, location, navigate]);
  // Закрытый раздел не должен зазывать себя с главной: блок с карточками
  // вёл бы на заглушку.
  const isHiddenInNav = useIsPathHiddenInNav();
  // Порядок совпадает с порядком секций на странице: первой греется ближайшая.
  useWarmSections(HOME_SECTION_LOADERS);
  const page = (
    <main className="marketing-typography min-h-screen bg-background text-foreground overflow-x-hidden">
      <SEO
        title={seo.title}
        description={seo.description}
        url="/"
      />
      <Navbar />
      <Hero contentKey="site:home" visual="cosmic" settledEntrance={hasGeneratedFirstScreen(location.pathname, location.key)} />

      {applyLandingLayout<ReactNode>([
        ['services', <DeferredSection key="services" anchorId="services" heights={{ mobile: 1000, tablet: 1674, desktop: 1596 }}>
          <Services contentKey="site:home" />
        </DeferredSection>],
        ['cases', !isHiddenInNav('/cases') && (
          <DeferredSection key="cases" anchorId="cases" heights={{ mobile: 1062, tablet: 1720, desktop: 1569 }}>
            <Cases contentKey="site:home" moreHref="/cases/" />
          </DeferredSection>
        )],
        ['cta', <DeferredSection key="cta" heights={{ mobile: 352, tablet: 351, desktop: 332 }}>
          <CallToAction contentKey="site:home" />
        </DeferredSection>],
        ['testimonials', <DeferredSection key="about" anchorId="about" heights={{ mobile: 1085, tablet: 1105, desktop: 1137 }}>
          <Testimonials contentKey="site:home" />
        </DeferredSection>],
        [null, !isHiddenInNav('/blog') && (
          <DeferredSection key="blog" anchorId="blog" heights={{ mobile: 943, tablet: 1150, desktop: 1166 }}>
            <Blog />
          </DeferredSection>
        )],

        [null, <section key="social" className="w-full flex justify-center py-12 md:py-16">
          <div className="relative w-full min-w-0">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/10 to-secondary/10 blur-3xl opacity-40" />
            <DeferredSection anchorId="social" heights={{ mobile: 348, tablet: 363, desktop: 353 }}>
              <SocialBar />
            </DeferredSection>
          </div>
        </section>],

        [null, <DeferredSection key="calculator" anchorId="calculator-section" heights={{ mobile: 642, tablet: 679, desktop: 647 }}>
          <CalculatorButtons />
        </DeferredSection>],
        ['contact', <DeferredSection key="contact" anchorId="contact" heights={{ mobile: 1721, tablet: 1701, desktop: 1175 }}>
          <ContactForm contentKey="site:home" />
        </DeferredSection>],
      ], layout)}
      <DeferredSection heights={{ mobile: 1049, tablet: 457, desktop: 429 }}>
        <Footer />
      </DeferredSection>
    </main>
  );
  return <LandingVisibility.Provider value={normalizeLandingSections(layout.hiddenSections)}>{page}</LandingVisibility.Provider>;
}
