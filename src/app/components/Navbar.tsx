import { useState, useEffect, useCallback, memo, type MouseEvent } from 'react';
import { Menu, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';

type NavbarVariant = 'home' | 'service';

interface NavbarProps {
  variant?: NavbarVariant;
}

type NavItem = {
  label: string;
  href: string;
  sectionId?: string;
};

const NAVBAR_OFFSET = 80;

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
      window.scrollTo({ top: y, behavior: 'smooth' });
      return true;
    };

    const scrollWhenReady = (attempt = 0) => {
      if (scrollNow()) return;
      if (attempt >= 60) return;
      window.setTimeout(() => {
        scrollWhenReady(attempt + 1);
      }, 100);
    };

    scrollWhenReady();
  }, []);

  const buildSectionHref = useCallback((id: string) => {
    const basePath = variant === 'service' ? location.pathname : '/';
    return `${basePath}#${id}`;
  }, [location.pathname, variant]);

  const navigateToHref = useCallback((href: string, sectionId?: string) => {
    const targetUrl = new URL(href, window.location.origin);
    const targetPath = `${targetUrl.pathname}${targetUrl.search}`;
    const currentPath = `${location.pathname}${location.search}`;

    if (sectionId) {
      if (targetPath !== currentPath) {
        navigate(`${targetPath}${targetUrl.hash}`);
        window.setTimeout(() => scrollToSection(sectionId), 120);
        return;
      }

      if (window.location.hash !== targetUrl.hash) {
        navigate(`${targetPath}${targetUrl.hash}`, { replace: false });
      }
      scrollToSection(sectionId);
      return;
    }

    navigate(`${targetPath}${targetUrl.hash}`);
  }, [location.pathname, location.search, navigate, scrollToSection]);

  const handleNavClick = useCallback((href: string, sectionId?: string) => (event: MouseEvent<HTMLElement>) => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();

    if (isMobileMenuOpen) {
      setIsMobileMenuOpen(false);
      window.setTimeout(() => navigateToHref(href, sectionId), 80);
      return;
    }

    navigateToHref(href, sectionId);
  }, [isMobileMenuOpen, navigateToHref]);

  const navItems: NavItem[] = variant === 'service'
    ? [
      { label: 'Услуги', href: buildSectionHref('services'), sectionId: 'services' },
      { label: 'Кейсы', href: buildSectionHref('cases'), sectionId: 'cases' },
      { label: 'Отзывы', href: buildSectionHref('about'), sectionId: 'about' },
    ]
    : [
      { label: 'Услуги', href: buildSectionHref('services'), sectionId: 'services' },
      { label: 'Кейсы', href: buildSectionHref('cases'), sectionId: 'cases' },
      { label: 'Блог', href: '/blog' },
      { label: 'FAQ', href: '/faq' },
      { label: 'Контакты', href: buildSectionHref('contact'), sectionId: 'contact' },
      { label: 'Калькулятор', href: buildSectionHref('calculator-section'), sectionId: 'calculator-section' },
    ];

  const logoHref = buildSectionHref('hero');
  const contactHref = buildSectionHref('contact');

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
              <a
                href={logoHref}
                onClick={handleNavClick(logoHref, 'hero')}
                className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                Whale Wzrd
              </a>
            </div>

            {/* Десктопное меню */}
            <div className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick(item.href, item.sectionId)}
                  className="relative text-foreground/80 hover:text-primary transition-colors group"
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  {item.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
                </motion.a>
              ))}
              <Button
                asChild
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
              >
                <a href={contactHref} onClick={handleNavClick(contactHref, 'contact')}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  <span className="relative">Получить консультацию</span>
                </a>
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
              {navItems.map((item, idx) => (
                <motion.a
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick(item.href, item.sectionId)}
                  className="text-2xl text-foreground/80 hover:text-primary transition-colors relative group"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ delay: idx * 0.03, duration: 0.18 }}
                  whileHover={{ scale: 1.05 }}
                >
                  {item.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
                </motion.a>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ delay: 0.14, duration: 0.18 }}
              >
                <Button
                  asChild
                  size="lg"
                  className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
                >
                  <a href={contactHref} onClick={handleNavClick(contactHref, 'contact')}>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                    <span className="relative">Получить консультацию</span>
                  </a>
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
