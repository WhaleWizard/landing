import { Mail, MessageSquare, ExternalLink } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { memo, useCallback, useRef, lazy, Suspense } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { openCookieSettings, trackContact } from '../consent/consent';
import { withReturnTo } from '../utils/siteNavigation';
import WhaleMark from './brand/WhaleMark';

const PlexusBackdrop = lazy(() => import('./PlexusBackdrop'));

const footerHeadingClass = 'font-semibold mb-4 flex items-center gap-2';
const footerListClass = 'space-y-2 text-sm font-semibold text-muted-foreground';
const footerLinkClass = 'font-semibold hover:text-primary transition-colors';
const footerContactLinkClass =
  'flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary transition-colors group';
const footerLegalLinkClass =
  'inline-flex h-5 items-center text-sm font-semibold leading-none hover:text-primary transition-colors relative group';

function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const footerRef = useRef<HTMLElement>(null);
  const inView = useInView(footerRef, { once: false, margin: '0px 0px -10% 0px' });
  const reduceMotion = useReducedMotion();
  // Внутренние переходы запоминают страницу-источник: кнопка «Назад»
  // на юридических страницах вернёт именно туда, откуда их открыли.
  const linkState = withReturnTo(location);

  const scrollToSection = useCallback((id: string) => {
    const scrollNow = () => {
      const element = document.getElementById(id);
      if (!element) return false;

      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;

      window.scrollTo({
        top: y,
        behavior: 'smooth',
      });
      return true;
    };

    if (scrollNow()) return;

    if (location.pathname !== '/') {
      navigate('/');
      window.setTimeout(() => {
        scrollNow();
      }, 120);
    }
  }, [location.pathname, navigate]);

  return (
    <footer ref={footerRef} className="relative border-t border-border bg-card/30 backdrop-blur-sm overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-[600px] h-48 bg-gradient-radial from-primary/10 via-transparent to-transparent blur-3xl" />

      {/* Top Glow Line */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Плексус-сеть, стягивающаяся к курсору (на тач — блуждает сама) */}
      <Suspense fallback={null}>
        <PlexusBackdrop inView={inView} className="absolute inset-0 h-full w-full" />
      </Suspense>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          
          {/* Brand */}
          <motion.div 
            className="space-y-4"
            initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: reduceMotion ? 0 : 0.5 }}
          >
            <div className="flex items-center gap-1">
              <WhaleMark size={52} animated />
              <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                Whale Wizard
              </h3>
            </div>
            <p className="text-pretty text-sm text-muted-foreground">
              Performance-маркетинг в Google Ads и Meta Ads: от настройки аналитики до оптимизации по продажам.
            </p>
          </motion.div>

          {/* Services */}
          <motion.div
            id="services"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <h4 className={footerHeadingClass}>
              Услуги
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className={footerListClass}>
              <li>
                <Link to="/meta-ads" state={linkState} className={footerLinkClass}>
                  Meta Ads — Facebook и Instagram
                </Link>
              </li>

              <li>
                <Link to="/meta-apps" state={linkState} className={footerLinkClass}>
                  Продвижение приложений
                </Link>
              </li>

              <li>
                <Link to="/google-ads" state={linkState} className={footerLinkClass}>
                  Google Ads
                </Link>
              </li>

              <li>
                <Link to="/consult" state={linkState} className={footerLinkClass}>
                  Консультация
                </Link>
              </li>
            </ul>
          </motion.div>

          {/* Company */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <h4 className={footerHeadingClass}>
              Разделы
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className={footerListClass}>
              <li>
                <button
                  onClick={() => scrollToSection('about')}
                  className={footerLinkClass}
                >
                  Отзывы
                </button>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('cases')}
                  className={footerLinkClass}
                >
                  Избранные кейсы
                </button>
              </li>

              <li>
                <Link to="/blog" state={linkState} className={footerLinkClass}>
                  Блог
                </Link>
              </li>
              <li>
                <Link to="/cases" state={linkState} className={footerLinkClass}>
                  Все кейсы
                </Link>
              </li>

              <li>
                <Link to="/faq" state={linkState} className={footerLinkClass}>
                  FAQ
                </Link>
              </li>

              <li>
                <Link to="/marketing-glossary" state={linkState} className={footerLinkClass}>
                  Словарь метрик
                </Link>
              </li>

              <li>
                <Link to="/calculator" state={linkState} className={footerLinkClass}>
                  Калькулятор бюджета
                </Link>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('contact')}
                  className={footerLinkClass}
                >
                  Контакты
                </button>
              </li>
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <h4 className={footerHeadingClass}>
              Контакты
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[40px]" />
            </h4>

            <ul className="space-y-3">
              <li>
                <a
                  href="mailto:whalewzrd@gmail.com"
                  onClick={() => trackContact('email', 'footer')}
                  className={footerContactLinkClass}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  whalewzrd@gmail.com
                </a>
              </li>

              <li>
                <a
                  href="https://t.me/white_rsh"
                  onClick={() => trackContact('telegram', 'footer')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footerContactLinkClass}
                >
                  <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  Telegram
                </a>
              </li>

              <li>
                <button
                  onClick={() => scrollToSection('cases')}
                  className={footerContactLinkClass}
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary/10 border border-secondary/20 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  Смотреть кейсы
                </button>
              </li>
            </ul>
          </motion.div>
        </div>

        {/* Bottom */}
        <motion.div 
          className="pt-8 border-t border-border/50"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              © 2026 WhaleWzrd. Все права защищены.
              <span className="hidden md:inline">|</span>
              <span className="text-xs">Google Ads · Meta Ads</span>
            </p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 justify-center md:justify-end leading-none">
              <Link to="/privacy-policy" state={linkState} className={footerLegalLinkClass}>
                <span>Политика конфиденциальности и ПД</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </Link>
              <Link to="/offer" state={linkState} className={footerLegalLinkClass}>
                <span>Публичная оферта</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </Link>
              <Link to="/cookie-policy" state={linkState} className={footerLegalLinkClass}>
                <span>Политика Cookie</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </Link>
              <Link to="/faq" state={linkState} className={footerLegalLinkClass}>
                <span>FAQ</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </Link>
              <button
                type="button"
                onClick={openCookieSettings}
                className={`${footerLegalLinkClass} text-muted-foreground text-left bg-transparent border-0 p-0 m-0 appearance-none cursor-pointer`}
              >
                <span>Настройки Cookie</span>
                <div className="absolute bottom-0 left-0 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
}

export default memo(Footer);
