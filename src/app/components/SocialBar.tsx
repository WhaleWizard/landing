import { m } from 'motion/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, memo, useCallback } from 'react';
import { trackContact } from '../consent/consent';
import { useDragScroll } from '../hooks/useDragScroll';
import { preferredScrollBehavior } from '../utils/motionPreference';
import { PlatformMark } from './brand/PlatformMark';

const socials = [
  // Один адрес Telegram на весь сайт — тот же, что в подвале, на «спасибо» и в
  // юридических текстах (@white_rsh). Второй адрес вёл на тот же аккаунт,
  // но два разных ника на одном сайте читались как ошибка.
  { platform: 'telegram', href: 'https://t.me/white_rsh', label: 'Telegram' },
  { platform: 'instagram', href: 'https://instagram.com/whalewzrd', label: 'Instagram' },
  { platform: 'youtube', href: 'https://youtube.com/@whalewzrd', label: 'YouTube' },
  { platform: 'x', href: 'https://x.com/whalewzrd', label: 'X' },
  { platform: 'threads', href: 'https://threads.net/@whalewzrd', label: 'Threads' },
  { platform: 'tiktok', href: 'https://tiktok.com/@whalewzrd', label: 'TikTok' },
  { platform: 'gmail', href: 'mailto:whalewzrd@gmail.com', label: 'Email' },
] as const;

function getContactChannel(label: string): 'telegram' | 'whatsapp' | 'email' | 'phone' | 'social' {
  const normalized = label.toLowerCase();
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('email')) return 'email';
  return 'social';
}

function SocialDock() {
  const scrollerRef = useRef<HTMLDivElement>(null);
  useDragScroll(scrollerRef);

  const scrollByCard = useCallback((direction: 'prev' | 'next') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const card = scroller.querySelector<HTMLElement>('[data-social-card]');
    const gap = parseFloat(window.getComputedStyle(scroller).columnGap) || 16;
    const cardWidth = card?.offsetWidth ?? 96;
    scroller.scrollBy({
      left: direction === 'next' ? (cardWidth + gap) * 2 : -(cardWidth + gap) * 2,
      behavior: preferredScrollBehavior(),
    });
  }, []);

  return (
    <m.section
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

          <div className="hidden shrink-0 gap-2 min-[480px]:flex min-[606px]:hidden">
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

        <div ref={scrollerRef} className="scrollbar-brand cursor-grab overflow-x-auto pb-4" role="group" aria-label="Социальные сети">
          <div className="mx-auto flex w-max border-y border-foreground/15">
            {socials.map((s) => (
              <a
                key={s.label}
                data-social-card
                href={s.href}
                onClick={() => trackContact(getContactChannel(s.label), 'social_bar', { social_label: s.label })}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-16 w-[82px] shrink-0 flex-col items-center justify-center gap-2 border-r border-foreground/15 px-1 text-foreground transition-colors last:border-r-0 hover:bg-foreground/7 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none md:w-24"
              >
                <PlatformMark platform={s.platform} />
                <span className="whitespace-nowrap text-[11px] font-semibold md:text-xs">{s.label}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="text-center text-xs text-muted-foreground/60 mt-2">
          Выберите площадку, которой пользуетесь чаще всего.
        </div>
      </div>

    </m.section>
  );
}

export default memo(SocialDock);
