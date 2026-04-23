import { useState, useEffect, useCallback, memo } from 'react';
import { Menu, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Button } from './ui/button';

function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    const yOffset = -80;
    const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    setIsMobileMenuOpen(false);
  }, []);

  const navItems = [
    { label: 'Услуги', action: () => scrollToSection('services') },
    { label: 'Кейсы', action: () => scrollToSection('cases') },
    { label: 'Блог', action: () => navigate('/blog') },
    { label: 'FAQ', action: () => navigate('/faq') },
    { label: 'Словарь', action: () => navigate('/marketing-glossary') },
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
                Whale Wzrd
              </button>
            </div>

            {/* Десктопное меню */}
            <div className="hidden md:flex items-center space-x-8">
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
              className="md:hidden p-2 rounded-lg bg-card/50 backdrop-blur-sm border border-border"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6 text-foreground" /> : <Menu className="w-6 h-6 text-foreground" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Мобильное меню */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />
          <div className="relative h-full flex flex-col items-center justify-center space-y-8" onClick={(e) => e.stopPropagation()}>
            {navItems.map((item, idx) => (
              <motion.button
                key={idx}
                onClick={item.action}
                className="text-2xl text-foreground/80 hover:text-primary transition-colors relative group"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              >
                {item.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover:w-full" />
              </motion.button>
            ))}
            <Button
              onClick={() => {
                scrollToSection('contact');
                setIsMobileMenuOpen(false);
              }}
              size="lg"
              className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all group relative overflow-hidden shadow-lg shadow-primary/30"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none" />
              <span className="relative">Получить консультацию</span>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default memo(Navbar);
