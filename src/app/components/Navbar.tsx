import { useState, useEffect, useCallback, memo } from 'react';
import { Menu, X, Briefcase, Trophy, Newspaper, Star, HelpCircle, Phone, Calculator, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';

type NavbarVariant = 'home' | 'service';

const NAV_ICONS: Record<string, typeof Briefcase> = {
  'Услуги': Briefcase,
  'Кейсы': Trophy,
  'Блог': Newspaper,
  'Отзывы': Star,
  'FAQ': HelpCircle,
  'Контакты': Phone,
  'Калькулятор': Calculator,
};

interface NavbarProps {
  variant?: NavbarVariant;
}

function Navbar({ variant = 'home' }: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
                onClick={() => scrollToSection('hero')}
                className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                Whale Wizard
              </button>
            </div>

            {/* Десктопное меню */}
            <div className="hidden lg:flex items-center space-x-6 xl:space-x-8">
              {navItems.map((item, idx) => (
                <motion.button
                  key={idx}
                  onClick={item.action}
                  className="relative text-foreground/80 hover:text-primary transition-colors group"
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  {item.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
                </motion.button>
              ))}
              <Button
                onClick={() => scrollToSection('contact')}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                <span className="relative">Получить консультацию</span>
              </Button>
            </div>

            {/* Мобильное меню */}
            <button
              className="lg:hidden p-2 rounded-lg bg-card/50 backdrop-blur-sm border border-border"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Мобильное меню — выезжающая панель */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="absolute right-0 top-0 flex h-full w-[85%] max-w-sm flex-col border-l border-border bg-card/95 shadow-2xl backdrop-blur-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

              <div className="flex items-center justify-between px-5 py-5 border-b border-border/60">
                <span className="text-lg font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  Whale Wizard
                </span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-lg bg-background/60 border border-border hover:border-primary/40 transition-colors"
                  aria-label="Закрыть меню"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-3">
                {navItems.map((item, idx) => {
                  const Icon = NAV_ICONS[item.label] ?? Briefcase;
                  return (
                    <motion.button
                      key={idx}
                      onClick={item.action}
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ delay: idx * 0.035, duration: 0.2 }}
                      whileTap={{ scale: 0.98 }}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-primary/10 active:bg-primary/15"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="flex-1 text-[15px] font-medium text-foreground/90 transition-colors group-hover:text-foreground">
                        {item.label}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </motion.button>
                  );
                })}
              </nav>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ delay: 0.14, duration: 0.18 }}
                className="border-t border-border/60 p-4"
              >
                <Button
                  onClick={() => {
                    scrollToSection('contact');
                    setIsMobileMenuOpen(false);
                  }}
                  size="lg"
                  className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
                  <span className="relative">Получить консультацию</span>
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
