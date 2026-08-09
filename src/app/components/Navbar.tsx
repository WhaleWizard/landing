import { useState, useEffect, useCallback, memo } from 'react';
import { Menu, X, Briefcase, Trophy, Newspaper, Star, HelpCircle, Phone, Calculator, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { Button } from './ui/button';
import BrandLogo from './brand/BrandLogo';

type NavbarVariant = 'home' | 'service' | 'content';

const NAV_ICONS: Record<string, typeof Briefcase> = {
  'Услуги': Briefcase,
  'Кейсы': Trophy,
  'Все кейсы': Trophy,
  'Блог': Newspaper,
  'Отзывы': Star,
  'О нас': Star,
  'FAQ': HelpCircle,
  'Контакты': Phone,
  'Калькулятор': Calculator,
};

interface NavbarProps {
  variant?: NavbarVariant;
}

/** Ключ страницы услуги для ?from= — по нему кейсы знают, куда вернуть. */
function serviceFromKey(pathname: string): string {
  return pathname.replace(/^\/+|\/+$/g, '') || 'home';
}

function Navbar({ variant = 'home' }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isContentItemActive = useCallback((label: string) => variant === 'content' && (
    (label === 'Кейсы' && location.pathname.startsWith('/cases'))
    || (label === 'Блог' && location.pathname.startsWith('/blog'))
    || (label === 'FAQ' && location.pathname.startsWith('/faq'))
  ), [location.pathname, variant]);

  // Шапке нужен один бит: проскроллили мы больше 20px или нет. Раньше сюда
  // заходил React на КАЖДОЕ событие прокрутки; теперь событие лишь ставит
  // задачу на ближайший кадр, а состояние трогается только когда бит реально
  // сменился. Внешне ничего не меняется.
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      const next = window.scrollY > 20;
      setIsScrolled((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    const desktopBreakpoint = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileMenuOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    desktopBreakpoint.addEventListener('change', handleBreakpointChange);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      desktopBreakpoint.removeEventListener('change', handleBreakpointChange);
    };
  }, [isMobileMenuOpen]);

  const scrollToSection = useCallback((id: string) => {
    const scrollNow = () => {
      const element = document.getElementById(id);
      if (!element) return false;
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      return true;
    };

    const scrollWhenReady = (attempt = 0) => {
      if (scrollNow()) return;
      if (attempt >= 12) return;
      window.setTimeout(() => {
        scrollWhenReady(attempt + 1);
      }, 80);
    };

    if (scrollNow()) {
      setIsMobileMenuOpen(false);
      return;
    }

    if (variant === 'service') {
      scrollWhenReady();
      setIsMobileMenuOpen(false);
      return;
    }

    if (location.pathname !== '/') {
      navigate('/');
      window.setTimeout(() => {
        scrollWhenReady();
      }, 40);
    } else {
      scrollWhenReady();
    }

    setIsMobileMenuOpen(false);
  }, [location.pathname, navigate, variant]);

  const navItems = variant === 'service'
    ? [
      { label: 'Услуги', action: () => scrollToSection('services') },
      { label: 'Кейсы', action: () => scrollToSection('cases') },
      { label: 'Отзывы', action: () => scrollToSection('about') },
      // Со страниц услуг раньше не было выхода в контентные разделы:
      // все пункты вели на якоря внутри той же страницы.
      { label: 'Все кейсы', action: () => { navigate(`/cases?from=${serviceFromKey(location.pathname)}`); setIsMobileMenuOpen(false); } },
      { label: 'Блог', action: () => { navigate('/blog'); setIsMobileMenuOpen(false); } },
    ]
    : variant === 'content'
      ? [
        { label: 'Услуги', action: () => scrollToSection('services') },
        { label: 'Кейсы', action: () => { navigate(`/cases${location.pathname.startsWith('/cases/') ? location.search : ''}`); setIsMobileMenuOpen(false); } },
        { label: 'Блог', action: () => { navigate('/blog'); setIsMobileMenuOpen(false); } },
        { label: 'О нас', action: () => scrollToSection('about') },
        { label: 'FAQ', action: () => { navigate('/faq'); setIsMobileMenuOpen(false); } },
        { label: 'Контакты', action: () => scrollToSection('social') },
      ]
      : [
        { label: 'Услуги', action: () => scrollToSection('services') },
        { label: 'Кейсы', action: () => scrollToSection('cases') },
        { label: 'Блог', action: () => scrollToSection('blog') },
        { label: 'Отзывы', action: () => scrollToSection('about') },
        { label: 'FAQ', action: () => navigate('/faq') },
        { label: 'Контакты', action: () => scrollToSection('social') },
        { label: 'Калькулятор', action: () => scrollToSection('calculator-section') },
      ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled || variant === 'content'
            ? 'bg-background/80 backdrop-blur-xl border-b border-border shadow-lg shadow-primary/5'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Логотип */}
            <div className="flex-shrink-0">
              <BrandLogo
                onClick={() => variant === 'content' ? navigate('/') : scrollToSection('hero')}
                priority
                ariaLabel={variant === 'content' ? 'Whale Wizard — на главную' : 'Whale Wizard — к началу страницы'}
              />
            </div>

            {/* Десктопное меню */}
            <div className="hidden lg:flex items-center space-x-6 xl:space-x-8">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  aria-current={isContentItemActive(item.label) ? 'page' : undefined}
                  className={`relative transition-[color,transform] duration-200 hover:-translate-y-0.5 group ${
                    isContentItemActive(item.label)
                      ? 'text-primary'
                      : 'text-foreground/80 hover:text-primary'
                  }`}
                >
                  {item.label}
                  <span className={`absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full ${isContentItemActive(item.label) ? 'w-full' : 'w-0'}`} />
                </button>
              ))}
              <Button
                onClick={() => scrollToSection('contact')}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                <span className="relative">Обсудить проект</span>
              </Button>
            </div>

            {/* Мобильное меню */}
            <button
              type="button"
              className="lg:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg bg-card/50 backdrop-blur-sm border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              aria-label={isMobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation"
            >
              {isMobileMenuOpen ? <X aria-hidden="true" className="w-6 h-6 text-foreground" /> : <Menu aria-hidden="true" className="w-6 h-6 text-foreground" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Мобильное меню — выезжающая панель */}
      {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-[60] lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
            <div
              id="mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Основная навигация"
              className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col border-l border-border bg-card/95 shadow-2xl backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

              <div className="flex items-center justify-between px-5 py-5 border-b border-border/60">
                <BrandLogo
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    if (variant === 'content') navigate('/');
                    else scrollToSection('hero');
                  }}
                  markSize={40}
                  anchor={false}
                  ariaLabel={variant === 'content' ? 'Whale Wizard — на главную' : 'Whale Wizard — к началу страницы'}
                />
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-background/60 border border-border hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Закрыть меню"
                >
                  <X aria-hidden="true" className="w-5 h-5 text-foreground" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-3">
                {navItems.map((item) => {
                  const Icon = NAV_ICONS[item.label] ?? Briefcase;
                  return (
                    <button
                      key={item.label}
                      onClick={item.action}
                      aria-current={isContentItemActive(item.label) ? 'page' : undefined}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-[background-color,transform] hover:bg-primary/10 active:scale-[0.98] active:bg-primary/15 ${isContentItemActive(item.label) ? 'bg-primary/10' : ''}`}
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="flex-1 text-[15px] font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                        {item.label}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  );
                })}
              </nav>

              <div className="border-t border-border/60 p-4">
                <Button
                  onClick={() => {
                    scrollToSection('contact');
                    setIsMobileMenuOpen(false);
                  }}
                  size="lg"
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  <span className="relative">Обсудить проект</span>
                </Button>
              </div>
            </div>
          </div>
      )}
    </>
  );
}

export default memo(Navbar);
