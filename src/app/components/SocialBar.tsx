import { motion } from 'motion/react';
import {
  Instagram,
  Youtube,
  Send,
  Twitter,
  MessageCircle,
  Music,
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useRef, memo, useCallback } from 'react';
import { trackContact } from '../consent/consent';

const socials = [
  { icon: Send, href: 'https://t.me/whalewzrd', label: 'Telegram', color: '#26A5E4' },
  { icon: Instagram, href: 'https://instagram.com/whalewzrd', label: 'Instagram', color: '#E4405F' },
  { icon: Youtube, href: 'https://youtube.com/@whalewzrd', label: 'YouTube', color: '#FF0000' },
  { icon: Twitter, href: 'https://twitter.com/whalewzrd', label: 'X', color: '#1DA1F2' },
  { icon: MessageCircle, href: 'https://threads.net/@whalewzrd', label: 'Threads', color: '#8A2BE2' },
  { icon: Music, href: 'https://tiktok.com/@whalewzrd', label: 'TikTok', color: '#FE2C55' },
  { icon: Mail, href: 'mailto:whalewzrd@gmail.com', label: 'Email', color: '#8B5CF6' },
];

function getContactChannel(label: string): 'telegram' | 'whatsapp' | 'email' | 'phone' | 'social' {
  const normalized = label.toLowerCase();
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('email')) return 'email';
  return 'social';
}

function SocialDock() {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCard = useCallback((direction: 'prev' | 'next') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const card = scroller.querySelector<HTMLElement>('[data-social-card]');
    const gap = parseFloat(window.getComputedStyle(scroller).columnGap) || 16;
    const cardWidth = card?.offsetWidth ?? 96;
    scroller.scrollBy({
      left: direction === 'next' ? (cardWidth + gap) * 2 : -(cardWidth + gap) * 2,
      behavior: 'smooth',
    });
  }, []);

  return (
    <motion.section
      id="social"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6 }}
      className="w-full py-12 md:py-16"
      style={{ contain: 'layout style paint' }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8 flex items-center justify-between gap-4 lg:justify-center">
          <div className="min-w-0 lg:text-center">
            <h2 className="text-balance text-xl md:text-2xl font-bold mb-1.5">
              Разборы, заметки и связь{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                в соцсетях
              </span>
            </h2>
            <p className="text-pretty text-muted-foreground text-xs md:text-sm">
              <span className="lg:hidden">Листайте, чтобы выбрать удобный канал.</span>
              <span className="hidden lg:inline">Делюсь наблюдениями по рекламе, аналитике и работе с проектами.</span>
            </p>
          </div>

          <div className="hidden sm:flex lg:hidden gap-2 flex-shrink-0">
            <button
              onClick={() => scrollByCard('prev')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-card/50 border border-border hover:border-primary/40 hover:bg-primary/10 active:scale-95 transition-all"
              aria-label="Прокрутить назад"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scrollByCard('next')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-card/50 border border-border hover:border-primary/40 hover:bg-primary/10 active:scale-95 transition-all"
              aria-label="Прокрутить вперёд"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className="scrollbar-brand flex gap-4 overflow-x-auto scroll-smooth pb-5 pt-1 lg:justify-center"
          style={{ WebkitOverflowScrolling: 'touch', cursor: 'grab' }}
        >
          {socials.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.a
                key={s.label}
                data-social-card
                href={s.href}
                onClick={() => trackContact(getContactChannel(s.label), 'social_bar', { social_label: s.label })}
                target="_blank"
                rel="noopener noreferrer"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
                whileTap={{ scale: 0.95 }}
                className={`social-card social-card-${i} group flex-shrink-0 flex flex-col items-center gap-2.5 w-[84px] md:w-[96px] rounded-2xl border border-border/70 bg-card/40 backdrop-blur-sm p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
              >
                <Icon
                  className="social-icon w-6 h-6 md:w-7 md:h-7 transition-colors duration-300"
                  style={{ color: s.color }}
                  aria-hidden="true"
                />
                <span className="text-[11px] md:text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors whitespace-nowrap">
                  {s.label}
                </span>
              </motion.a>
            );
          })}
        </div>

        <div className="text-center text-xs text-muted-foreground/60 mt-2">
          Выберите площадку, которой пользуетесь чаще всего.
        </div>
      </div>

      <style>{`
        ${socials.map((s, i) => `
        .social-card-${i}:hover {
          border-color: ${s.color}80;
          background-color: ${s.color}1f;
          box-shadow: 0 12px 28px -14px ${s.color}99;
        }
        `).join('')}
      `}</style>
    </motion.section>
  );
}

export default memo(SocialDock);
