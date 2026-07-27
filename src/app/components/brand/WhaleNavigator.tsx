import { motion, useReducedMotion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import WhaleMark from './WhaleMark';

interface GuideStep {
  label: string;
  id?: string;
  path?: string;
}

interface ViewportState {
  width: number;
  height: number;
  keyboardOpen: boolean;
}

interface Point {
  x: number;
  y: number;
  size: number;
}

const PUBLIC_SERVICE_PATHS = new Set(['/google-ads', '/meta-ads', '/consult', '/meta-apps']);

function normalizePathname(pathname: string) {
  if (pathname === '/') return pathname;
  return pathname.replace(/\/+$/, '') || '/';
}

function guideStepsFor(pathname: string): GuideStep[] {
  if (pathname === '/') {
    return [
      { label: 'Дальше: услуги', id: 'services' },
      { label: 'Посмотреть кейсы', id: 'cases' },
      { label: 'Обсудить проект', id: 'contact' },
    ];
  }

  if (PUBLIC_SERVICE_PATHS.has(pathname)) {
    return [
      { label: 'Изучить услуги', id: 'services' },
      { label: 'Посмотреть примеры', id: 'cases' },
      { label: 'Обсудить задачу', id: 'contact' },
    ];
  }

  if (pathname.startsWith('/cases/')) return [{ label: 'Все кейсы', path: '/cases' }];
  if (pathname === '/cases') return [{ label: 'Перейти в блог', path: '/blog' }];
  if (pathname.startsWith('/blog/')) return [{ label: 'Все статьи', path: '/blog' }];
  if (pathname === '/blog') return [{ label: 'Посмотреть кейсы', path: '/cases' }];
  if (pathname === '/thank-you') return [{ label: 'Вернуться на главную', path: '/' }];

  return [{ label: 'Перейти на главную', path: '/' }];
}

function readViewport(): ViewportState {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  return {
    width: window.innerWidth,
    height: viewportHeight,
    keyboardOpen: viewportHeight < window.innerHeight * 0.76,
  };
}

function dockPoint(viewport: ViewportState, stepIndex: number): Point {
  if (viewport.width < 768) {
    const size = viewport.width <= 360 ? 52 : 58;
    return { x: 8, y: viewport.width <= 360 ? 14 : 11, size };
  }

  if (viewport.width < 1440) {
    return { x: 8, y: 8, size: 64 };
  }

  const size = viewport.width >= 1600 ? 98 : 82;
  const lane = stepIndex % 2 === 0 ? 0.3 : 0.58;
  return { x: 6, y: Math.max(124, viewport.height * lane - size / 2), size };
}

export default function WhaleNavigator() {
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const guideRef = useRef<HTMLDivElement | null>(null);
  const petRef = useRef<HTMLButtonElement | null>(null);
  const lookFrameRef = useRef<number | null>(null);
  const attentionTimerRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState<ViewportState>(() => readViewport());
  const [detached, setDetached] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [cookieBlocked, setCookieBlocked] = useState(
    () => document.documentElement.dataset.wwCookieUi !== 'ready',
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [formFocused, setFormFocused] = useState(false);
  const [contactVisible, setContactVisible] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [traveling, setTraveling] = useState(false);
  const [attention, setAttention] = useState(false);
  const [phase, setPhase] = useState<'out' | 'in' | null>(null);
  const [mounted, setMounted] = useState(false);
  const teleportFromRef = useRef<Point | null>(null);
  const teleportToRef = useRef<Point | null>(null);
  const lastAnchorRef = useRef<Point | null>(null);
  const prevVisibleRef = useRef(false);
  const lastTeleportAtRef = useRef(0);
  const stepTimerRef = useRef<number | null>(null);
  const pendingStepRef = useRef<number | null>(null);

  const pathname = useMemo(
    () => normalizePathname(location.pathname).toLowerCase(),
    [location.pathname],
  );
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const steps = useMemo(() => guideStepsFor(pathname), [pathname]);
  const step = steps[Math.min(activeStep, steps.length - 1)] ?? steps[0];
  const point = useMemo(() => {
    const fallback = dockPoint(viewport, activeStep);
    if (viewport.width >= 1440 || !anchorRect) return fallback;

    const size = viewport.width < 768
      ? fallback.size
      : Math.min(72, Math.max(58, Math.max(anchorRect.width, anchorRect.height) + 12));
    return {
      x: Math.max(8, anchorRect.left - (size - anchorRect.width) / 2),
      y: Math.max(8, anchorRect.top - (size - anchorRect.height) / 2),
      size,
    };
  }, [activeStep, anchorRect, viewport]);
  const blocked = cookieBlocked || modalOpen || formFocused || contactVisible || viewport.keyboardOpen || isAdmin;
  const visible = detached && !blocked;

  // Магический телепорт в обе стороны: кит не летит через страницу, а исчезает
  // с искрами в одной точке и появляется в другой. «out» — из навбара в док,
  // «in» — из дока обратно в навбар (кит растворяется, искры вспыхивают у логотипа).
  useEffect(() => {
    if (visible === prevVisibleRef.current) return;
    prevVisibleRef.current = visible;

    const anchor = anchorRect
      ? { x: anchorRect.left, y: anchorRect.top, size: Math.max(anchorRect.width, anchorRect.height) }
      : lastAnchorRef.current;
    const now = performance.now();
    // Пауза между телепортами: при быстром скролле туда-сюда эффект не
    // повторяется десяток раз подряд, а спокойно доигрывает начатое.
    const canTeleport = !reduceMotion
      && viewport.width >= 1440
      && Boolean(anchor)
      && now - lastTeleportAtRef.current > 1400;

    if (visible) {
      setMounted(true);
      if (!canTeleport || !anchor) {
        setPhase(null);
        return;
      }
      lastTeleportAtRef.current = now;
      setPromptOpen(false);
      teleportFromRef.current = anchor;
      teleportToRef.current = point;
      setPhase('out');
      return;
    }

    // Обратно в навбар кит уходит телепортом только если действительно вернулись
    // наверх. Когда его прячет модалка, форма или блок контактов — просто убираем.
    if (!canTeleport || !anchor || blocked) {
      setPhase(null);
      setMounted(false);
      return;
    }
    lastTeleportAtRef.current = now;
    setPromptOpen(false);
    teleportFromRef.current = point;
    teleportToRef.current = anchor;
    setPhase('in');
  }, [visible, blocked, reduceMotion, viewport.width, anchorRect, point]);

  useEffect(() => {
    const onViewportChange = () => setViewport(readViewport());
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true });
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  }, []);

  useEffect(() => {
    const syncCookieState = (event?: Event) => {
      const detail = (event as CustomEvent<{ blocked?: boolean }> | undefined)?.detail;
      setCookieBlocked(detail?.blocked ?? document.documentElement.dataset.wwCookieUi !== 'ready');
    };
    syncCookieState();
    window.addEventListener('ww:cookie-ui-change', syncCookieState);
    return () => window.removeEventListener('ww:cookie-ui-change', syncCookieState);
  }, []);

  useEffect(() => {
    const syncModalState = () => setModalOpen(Boolean(document.querySelector('[aria-modal="true"]')));
    syncModalState();
    const observer = new MutationObserver(syncModalState);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      setFormFocused(target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]'));
    };
    const onFocusOut = () => window.setTimeout(() => {
      const active = document.activeElement;
      setFormFocused(active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]'));
    }, 0);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  useEffect(() => {
    let observed: HTMLElement | null = null;
    const intersection = new IntersectionObserver(
      ([entry]) => setContactVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.12 },
    );
    const attach = () => {
      const next = document.getElementById('contact');
      if (next === observed) return;
      if (observed) intersection.unobserve(observed);
      observed = next;
      if (observed) intersection.observe(observed);
      else setContactVisible(false);
    };
    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      intersection.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const anchor = document.querySelector<HTMLElement>('[data-whale-logo-anchor="true"]');
      const rect = anchor?.getBoundingClientRect() ?? null;
      setAnchorRect((previous) => {
        if (!rect || rect.width <= 0 || rect.height <= 0) return previous === null ? previous : null;
        if (
          previous
          && Math.abs(previous.left - rect.left) < 0.5
          && Math.abs(previous.top - rect.top) < 0.5
          && Math.abs(previous.width - rect.width) < 0.5
          && Math.abs(previous.height - rect.height) < 0.5
        ) return previous;
        return rect;
      });
      // Гистерезис: отрываемся от навбара позже, чем возвращаемся обратно.
      // Без него скролл около самой границы переключал состояние на каждом
      // пикселе, и кит бесконечно телепортировался туда-сюда.
      const metaAppsHero = pathname === '/meta-apps'
        ? document.querySelector<HTMLElement>('.meta-apps-page-hero')
        : null;
      const defaultDetachAt = viewport.width < 768 ? 64 : 92;
      const detachAt = metaAppsHero
        ? Math.max(
            viewport.width < 768 ? 720 : 360,
            metaAppsHero.offsetTop + metaAppsHero.offsetHeight - viewport.height * 0.32,
          )
        : defaultDetachAt;
      const attachAt = Math.max(0, detachAt - (metaAppsHero ? 140 : 56));
      setDetached((previous) => {
        if (!rect) return pathname === '/meta-apps' ? false : true;
        return window.scrollY > (previous ? attachAt : detachAt);
      });

      const sectionSteps = steps.filter((item) => item.id);
      let nextIndex = 0;
      if (sectionSteps.length > 0) {
        sectionSteps.forEach((item, index) => {
          const target = item.id ? document.getElementById(item.id) : null;
          if (target && target.getBoundingClientRect().top <= viewport.height * 0.56) {
            nextIndex = Math.min(index + 1, sectionSteps.length - 1);
          }
        });
      }
      // Смену полосы применяем с паузой: быстрый скролл через границу секции
      // больше не заставляет кита метаться между позициями.
      if (nextIndex !== pendingStepRef.current) {
        pendingStepRef.current = nextIndex;
        if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
        stepTimerRef.current = window.setTimeout(() => {
          stepTimerRef.current = null;
          setActiveStep(nextIndex);
        }, 340);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [pathname, steps, viewport.height, viewport.width]);

  useEffect(() => {
    setPromptOpen(false);
    setAttention(true);
    if (attentionTimerRef.current) window.clearTimeout(attentionTimerRef.current);
    attentionTimerRef.current = window.setTimeout(() => setAttention(false), 1700);
    return () => {
      if (attentionTimerRef.current) window.clearTimeout(attentionTimerRef.current);
    };
  }, [activeStep, pathname]);

  useEffect(() => {
    if (visible) document.documentElement.dataset.wwWhaleDetached = 'true';
    else delete document.documentElement.dataset.wwWhaleDetached;

    return () => {
      delete document.documentElement.dataset.wwWhaleDetached;
    };
  }, [visible]);

  useEffect(() => () => {
    delete document.documentElement.dataset.wwWhaleDetached;
    if (lookFrameRef.current) window.cancelAnimationFrame(lookFrameRef.current);
    if (stepTimerRef.current) window.clearTimeout(stepTimerRef.current);
  }, []);

  // Запоминаем последнюю известную позицию логотипа: когда кит возвращается
  // в навбар, сам логотип может быть ещё не отрисован.
  useEffect(() => {
    if (!anchorRect) return;
    lastAnchorRef.current = {
      x: anchorRect.left,
      y: anchorRect.top,
      size: Math.max(anchorRect.width, anchorRect.height),
    };
  }, [anchorRect]);

  useEffect(() => {
    if (!promptOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && guideRef.current?.contains(target)) return;
      setPromptOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPromptOpen(false);
      petRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [promptOpen]);

  useEffect(() => {
    if (reduceMotion || viewport.width < 768 || !visible) return;
    const onPointerMove = (event: PointerEvent) => {
      if (lookFrameRef.current) return;
      lookFrameRef.current = window.requestAnimationFrame(() => {
        lookFrameRef.current = null;
        const element = guideRef.current;
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const rotation = Math.max(-1.7, Math.min(1.7, ((event.clientX - centerX) / window.innerWidth) * 3.4));
        element.style.setProperty('--ww-look-rotation', `${rotation.toFixed(2)}deg`);
      });
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, [reduceMotion, viewport.width, visible]);

  const openPrompt = useCallback(() => {
    setPromptOpen((current) => !current);
    setAttention(true);
  }, []);

  const activateStep = useCallback(() => {
    setPromptOpen(false);
    if (!step) return;
    const target = step.id ? document.getElementById(step.id) : null;
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }

    if (step.path) {
      navigate(step.path);
    }
  }, [navigate, reduceMotion, step]);

  const sourcePoint = anchorRect
    ? { x: anchorRect.left, y: anchorRect.top, size: Math.max(anchorRect.width, anchorRect.height) }
    : point;

  // Во время возврата в навбар кит ещё нужен в DOM: иначе он исчезал мгновенно,
  // без анимации. Размонтируется он после завершения телепорта.
  const teleport = phase && teleportFromRef.current && teleportToRef.current
    ? { from: teleportFromRef.current, to: teleportToRef.current }
    : null;

  return (
    <div className="ww-whale-guide-layer">
      {mounted && step && (
        <motion.div
          ref={guideRef}
          className="ww-whale-guide"
          data-whale-navigator="true"
          data-has-anchor={anchorRect ? 'true' : 'false'}
          data-traveling={traveling ? 'true' : 'false'}
          data-attention={attention ? 'true' : 'false'}
          data-phase={phase ?? 'none'}
          initial={reduceMotion ? { x: point.x, y: point.y, width: point.size, height: point.size, opacity: 0, scale: 1 } : {
            x: sourcePoint.x,
            y: sourcePoint.y,
            width: sourcePoint.size,
            height: sourcePoint.size,
            opacity: anchorRect ? 0.94 : 0,
            scale: 1,
          }}
          animate={teleport ? {
            x: [teleport.from.x, teleport.from.x, teleport.to.x, teleport.to.x],
            y: [teleport.from.y, teleport.from.y, teleport.to.y, teleport.to.y],
            width: [teleport.from.size, teleport.from.size, teleport.to.size, teleport.to.size],
            height: [teleport.from.size, teleport.from.size, teleport.to.size, teleport.to.size],
            // Обратно в навбар кит не проявляется: там уже есть живой логотип,
            // поэтому финальную вспышку дают только искры.
            opacity: phase === 'in' ? [1, 0, 0, 0] : [1, 0, 0, 1],
            scale: [1, 0.22, 0.22, 1],
          } : { x: point.x, y: point.y, width: point.size, height: point.size, opacity: 1, scale: 1 }}
          transition={
            reduceMotion
              ? { duration: 0.01 }
              : teleport
                ? { duration: phase === 'in' ? 0.88 : 1.05, times: [0, 0.32, 0.36, 1], ease: [0.45, 0, 0.25, 1] }
                : { duration: 1.25, ease: [0.33, 1, 0.68, 1] }
          }
          onAnimationStart={() => setTraveling(true)}
          onAnimationComplete={() => {
            setTraveling(false);
            if (phase === 'in' && !visible) setMounted(false);
            setPhase(null);
          }}
        >
          <span className="ww-whale-guide__trail" aria-hidden="true">
            {[0, 1, 2, 3].map((particle) => (
              <img key={particle} src="/images/brand/whale-wand-glow.png" alt="" width="96" height="96" />
            ))}
          </span>

          <button
            ref={petRef}
            type="button"
            className="ww-whale-guide__pet"
            onClick={openPrompt}
            aria-expanded={promptOpen}
            aria-controls="ww-whale-navigator-hint"
            aria-label={`Кит-навига́тор. Показать подсказку: ${step.label}`}
          >
            <span className="ww-whale-guide__look">
              <span className="ww-whale-guide__hover">
                <span className="ww-whale-guide__idle">
                  <WhaleMark size="100%" priority />
                </span>
              </span>
            </span>
          </button>

          {promptOpen && (
            <motion.button
              id="ww-whale-navigator-hint"
              type="button"
              className="ww-whale-guide__hint"
              data-whale-hint="true"
              onClick={activateStep}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.2 }}
            >
              <span>{step.label}</span>
              <ChevronRight aria-hidden="true" />
            </motion.button>
          )}
        </motion.div>
      )}
    </div>
  );
}
