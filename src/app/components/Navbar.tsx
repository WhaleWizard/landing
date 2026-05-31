import { useState, useEffect, useCallback, memo, type MouseEvent } from 'react';
import { Menu, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';

type NavbarVariant = 'home' | 'service';

interface NavbarProps {
  variant?: NavbarVariant;
}

type RouteNavItem = {
  type: 'route';
  label: string;
  href: string;
};

type SectionNavItem = {
  type: 'section';
  label: string;
  sectionId: string;
  targetPath: string;
};

type NavItem = RouteNavItem | SectionNavItem;

const NAVBAR_OFFSET = 80;
const PENDING_SCROLL_KEY = 'ww_pending_scroll_section';

function isPlainLeftClick(event: MouseEvent<HTMLElement>) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey;
}

function Navbar({ variant = 'home' }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let rafId = 0;

    const updateScrollState = () => {
      rafId = 0;
      setIsScrolled(window.scrollY > 20);
    };

    const handleScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateScrollState);
    };

    updateScrollState();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const scrollToSection = useCallback((id: string) => {
    const scrollNow = () => {
      const element = document.getElementById(id);
      if (!element) return false;

      const y = element.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      return true;
    };

    const scrollWhenReady = (attempt = 0) => {
      if (scrollNow()) return;
      if (attempt >= 100) return;

      window.setTimeout(() => {
        scrollWhenReady(attempt + 1);
      }, 50);
    };

    window.requestAnimationFrame(() => scrollWhenReady());
  }, []);

  const getSectionPath = useCallback(() => (variant === 'service' ? location.pathname : '/'), [location.pathname, variant]);

  const currentPath = `${location.pathname}${location.search}`;

  const navigateToSection = useCallback((sectionId: string, targetPath: string) => {
    if (targetPath === currentPath) {
      scrollToSection(sectionId);
      return;
    }

    window.sessionStorage.setItem(PENDING_SCROLL_KEY, sectionId);
    navigate(targetPath);
  }, [currentPath, navigate, scrollToSection]);

  const navigateToRoute = useCallback((href: string) => {
    window.sessionStorage.removeItem(PENDING_SCROLL_KEY);
    navigate(href);
  }, [navigate]);

  const handleRouteClick = useCallback((href: string) => (event: MouseEvent<HTMLElement>) => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();

    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      window.setTimeout(() => navigateToRoute(href), 120);
      return;
    }

    navigateToRoute(href);
  }, [isMobileMenuOpen, navigateToRoute]);

  const handleSectionClick = useCallback((sectionId: string, targetPath: string) => (event: MouseEvent<HTMLElement>) => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();

    const runNavigation = () => navigateToSection(sectionId, targetPath);

    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      window.setTimeout(runNavigation, 120);
      return;
    }

    runNavigation();
  }, [isMobileMenuOpen, navigateToSection]);

  const makeSectionItem = useCallback((label: string, sectionId: string): SectionNavItem => ({
    type: 'section',
    label,
    sectionId,
    targetPath: getSectionPath(),
  }), [getSectionPath]);

  const navItems: NavItem[] = variant === 'service'
    ? [
      makeSectionItem('Услуги', 'services'),
      makeSectionItem('Кейсы', 'cases'),
      makeSectionItem('Отзывы', 'about'),
    ]
    : [
      makeSectionItem('Услуги', 'services'),
      makeSectionItem('Кейсы', 'cases'),
      { type: 'route', label: 'Блог', href: '/blog' },
      { type: 'route', label: 'FAQ', href: '/faq' },
      makeSectionItem('Контакты', 'social'),
      makeSectionItem('Калькулятор', 'calculator-section'),
    ];

  const logoItem = makeSectionItem('Whale Wzrd', 'hero');
  const contactItem = makeSectionItem('Получить консультацию', 'contact');

  const renderDesktopNavItem = (item: NavItem) => {
    const className = 'relative text-foreground/80 hover:text-primary transition-colors group bg-transparent border-0 p-0 cursor-pointer';

    if (item.type === 'route') {
      return (
        <motion.a
          key={item.href}
          href={item.href}
          onClick={handleRouteClick(item.href)}
          className={className}
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          {item.label}
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
        </motion.a>
      );
    }

    return (
      <motion.button
        key={`${item.targetPath}:${item.sectionId}`}
        type="button"
        onClick={handleSectionClick(item.sectionId, item.targetPath)}
        className={className}
        whileHover={{ y: -2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      >
        {item.label}
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
      </motion.button>
    );
  };

  const renderMobileNavItem = (item: NavItem, idx: number) => {
    const className = 'text-2xl text-foreground/80 hover:text-primary transition-colors relative group bg-transparent border-0 p-0 cursor-pointer';
    const motionProps = {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 6 },
      transition: { delay: idx * 0.03, duration: 0.18 },
      whileHover: { scale: 1.05 },
    };

    if (item.type === 'route') {
      return (
        <motion.a
          key={item.href}
          href={item.href}
          onClick={handleRouteClick(item.href)}
          className={className}
          {...motionProps}
        >
          {item.label}
          <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
        </motion.a>
      );
    }

    return (
      <motion.button
        key={`${item.targetPath}:${item.sectionId}`}
        type="button"
        onClick={handleSectionClick(item.sectionId, item.targetPath)}
        className={className}
        {...motionProps}
      >
        {item.label}
        <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
      </motion.button>
    );
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-background/80 backdrop-blur-xl border-b border-border shadow-lg shadow-primary/5'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Логотип */}
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={handleSectionClick(logoItem.sectionId, logoItem.targetPath)}
                className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent hover:opacity-80 transition-opacity border-0 p-0 cursor-pointer"
              >
                {logoItem.label}
              </button>
            </div>

            {/* Десктопное меню */}
            <div className="hidden md:flex items-center space-x-8">
              {navItems.map(renderDesktopNavItem)}
              <Button
                type="button"
                onClick={handleSectionClick(contactItem.sectionId, contactItem.targetPath)}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                <span className="relative">{contactItem.label}</span>
              </Button>
            </div>

            {/* Мобильное меню */}
            <button
              type="button"
              className="md:hidden p-2 rounded-lg bg-card/50 backdrop-blur-sm border border-border"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-navigation"
              aria-label={isMobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Мобильное меню */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />
            <motion.div
              id="mobile-navigation"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="relative h-full flex flex-col items-center justify-center space-y-8"
              onClick={(e) => e.stopPropagation()}
            >
              {navItems.map(renderMobileNavItem)}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ delay: 0.14, duration: 0.18 }}
              >
                <Button
                  type="button"
                  size="lg"
                  onClick={handleSectionClick(contactItem.sectionId, contactItem.targetPath)}
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  <span className="relative">{contactItem.label}</span>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default memo(Navbar);
