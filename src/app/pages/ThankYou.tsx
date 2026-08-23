import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Instagram,
  MessageCircle,
  Mail,
  Youtube,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  Search,
  Send,
  Video,
  Inbox,
} from 'lucide-react';
import { Link } from 'react-router';
import { trackContact, trackThankYouConversion } from '../consent/consent';
import Navbar from '../components/Navbar';
import SEO from '../components/SEO';
import ThanksCosmicScene from '../components/ThanksCosmicScene';
import { useScrollTo } from '../components/hooks/useScrollTo';
import { readLeadContext, type LeadContactChannel, type LeadServiceSlug } from '../utils/leadContext';
import { useIsPathHiddenInNav } from '../utils/pageLocks';

const Footer = lazy(() => import('../components/Footer'));

const TELEGRAM_LINK = 'https://t.me/white_rsh';

function getThankYouContactChannel(name: string): 'telegram' | 'email' | 'social' {
  const normalized = name.toLowerCase();
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('email')) return 'email';
  return 'social';
}

/** Как назвать канал в тексте: человек должен узнать тот способ, который выбрал сам. */
const CHANNEL_LABEL: Record<LeadContactChannel, string> = {
  telegram: 'в Telegram',
  whatsapp: 'в WhatsApp',
  email: 'на почту',
  phone: 'по телефону',
};

type WaitingCard = { to: string; title: string; note: string };

const WAITING_CARDS: Record<LeadServiceSlug, WaitingCard[]> = {
  consult: [
    { to: '/faq', title: 'Частые вопросы', note: 'Как проходит разбор и что нужно подготовить' },
    { to: '/calculator', title: 'Калькулятор бюджета', note: 'Прикинуть, сколько нужно на тест' },
    { to: '/marketing-glossary', title: 'Словарь метрик', note: 'CPL, ROAS, CAC — без воды' },
  ],
  'google-ads': [
    { to: '/cases', title: 'Кейсы', note: 'Что получалось у похожих проектов' },
    { to: '/roi-calculator', title: 'Калькулятор ROI', note: 'Посчитать окупаемость на своих цифрах' },
    { to: '/blog', title: 'Блог', note: 'Разборы и рабочие связки' },
  ],
  'meta-ads': [
    { to: '/cases', title: 'Кейсы', note: 'Что получалось у похожих проектов' },
    { to: '/roi-calculator', title: 'Калькулятор ROI', note: 'Посчитать окупаемость на своих цифрах' },
    { to: '/blog', title: 'Блог', note: 'Разборы и рабочие связки' },
  ],
  'meta-apps': [
    { to: '/cases', title: 'Кейсы', note: 'Что получалось у похожих приложений' },
    { to: '/blog', title: 'Блог', note: 'Разборы и рабочие связки' },
    { to: '/marketing-glossary', title: 'Словарь метрик', note: 'CPI, ROAS, retention — без воды' },
  ],
  home: [
    { to: '/cases', title: 'Кейсы', note: 'Что получалось у похожих проектов' },
    { to: '/blog', title: 'Блог', note: 'Разборы и рабочие связки' },
    { to: '/calculator', title: 'Калькулятор бюджета', note: 'Прикинуть, сколько нужно на тест' },
  ],
};

// Объекты в углах плиток — из общей космической серии: они уже в кеше и
// гарантированно совпадают по стилю со сценой первого экрана.
const TILE_ORBS = ['shard5', 'moon2', 'shard6'];

/**
 * Откуда человек пришёл — туда его и возвращает меню. Заявку с лендинга Meta
 * Ads выбрасывать на главную неправильно: этой страницы он мог вообще не
 * видеть, и разделы «Услуги» или «О нас» показали бы ему чужой контекст.
 */
const ORIGIN: Record<LeadServiceSlug, { path: string; label: string }> = {
  home: { path: '/', label: 'На главную' },
  'meta-ads': { path: '/meta-ads', label: 'Вернуться к Meta Ads' },
  'google-ads': { path: '/google-ads', label: 'Вернуться к Google Ads' },
  'meta-apps': { path: '/meta-apps', label: 'Вернуться к продвижению приложения' },
  consult: { path: '/consult', label: 'Вернуться к консультации' },
};

const socialLinks = [
  { name: 'Telegram', icon: MessageCircle, link: TELEGRAM_LINK },
  { name: 'Instagram', icon: Instagram, link: 'https://instagram.com/whalewzrd' },
  { name: 'YouTube', icon: Youtube, link: 'https://youtube.com/whalewzrd' },
  { name: 'Email', icon: Mail, link: 'mailto:whalewzrd@gmail.com' },
];

export default function ThankYou() {
  // Контекст читается один раз при монтировании: он уже лежит в хранилище к
  // моменту перехода, а перечитывать его на каждый рендер незачем.
  const [context] = useState(() => readLeadContext());
  const { scrollTo } = useScrollTo();

  useEffect(() => {
    trackThankYouConversion();
  }, []);

  const channelLabel = context?.channel ? CHANNEL_LABEL[context.channel] : null;
  const waitingCards = WAITING_CARDS[context?.serviceSlug ?? 'home'];

  // Закрытая через админку страница отдаёт заглушку — возвращать на неё нельзя,
  // поэтому такой источник откатывается на главную.
  const isHiddenInNav = useIsPathHiddenInNav();
  const rawOrigin = ORIGIN[context?.serviceSlug ?? 'home'];
  const origin = isHiddenInNav(rawOrigin.path) ? ORIGIN.home : rawOrigin;

  // Время показываем только тогда, когда заявка действительно была отправлена
  // из этой вкладки. При прямом заходе на адрес выдумывать «принято в 20:14»
  // нельзя — это было бы неправдой.
  const acceptedAt = context
    ? new Date(context.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null;

  const steps = [
    {
      icon: Search,
      when: 'Сегодня',
      title: 'Смотрю вводные',
      note: 'Открываю сайт или аккаунт, смотрю нишу, цифры и то, что вы описали в заявке.',
    },
    {
      icon: Send,
      when: 'До 24 часов',
      title: 'Пишу вам',
      note: channelLabel
        ? `Отвечаю ${channelLabel}. Если чего-то не хватает — задам два-три вопроса.`
        : 'Отвечаю тем способом, который вы указали. Если чего-то не хватает — задам два-три вопроса.',
    },
    {
      icon: Video,
      when: 'По договорённости',
      title: 'Созвон 30 минут',
      note: 'Разбираем, что делать с трафиком. Без презентаций и продающих скриптов.',
    },
  ];

  return (
    <>
      <SEO
        title="Спасибо за заявку"
        description="Страница подтверждения отправки заявки."
        url="/thank-you"
        noIndex
      />
      <Navbar variant="content" sectionsPath={origin.path} />

      <main className="marketing-typography bg-background">
        {/* ─── Первый экран: сцена и карточка подтверждения ───────────── */}
        <section className="relative flex min-h-[100svh] items-end overflow-hidden pb-14 pt-24 lg:items-center lg:pb-20 lg:pt-28">
          <ThanksCosmicScene />

          <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-6">
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="ths-card w-full max-w-xl rounded-3xl p-6 sm:p-8"
            >
              <div className="ths-chip">
                <span className="ths-chip-dot" />
                {acceptedAt ? `Принято сегодня в ${acceptedAt}` : 'Заявка принята'}
              </div>

              <h1 className="mt-4 text-[1.75rem] font-bold leading-[1.15] sm:text-4xl lg:text-[2.75rem]">
                {context?.name ? `${context.name}, ` : ''}
                <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                  заявка у меня
                </span>
              </h1>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {channelLabel
                  ? `Смотрю вводные и отвечу вам ${channelLabel}.`
                  : 'Смотрю вводные и свяжусь с вами тем способом, который вы указали.'}{' '}
                Обычно в тот же рабочий день, максимум — за 24 часа.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={TELEGRAM_LINK}
                  onClick={() => trackContact('telegram', 'thank_you', { social_label: 'Telegram primary' })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative inline-flex min-h-12 flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-primary to-accent px-6 font-semibold text-white shadow-lg shadow-primary/30 transition-transform hover:scale-[1.03]"
                >
                  <span className="absolute inset-0 translate-x-[-120%] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-1000 group-hover:translate-x-[120%]" />
                  <MessageCircle className="relative h-4 w-4" />
                  <span className="relative">Написать в Telegram</span>
                </a>

                {/* Кнопка, а не якорь: `href="#…"` меняет адрес, роутер на это
                    реагирует перерисовкой — отсюда моргание, — а сам переход
                    браузер делает мгновенным прыжком. */}
                <button
                  type="button"
                  onClick={() => scrollTo('thanks-next')}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card/40 px-5 font-medium text-foreground backdrop-blur-xl transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Что дальше
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                В Telegram отвечаю быстрее всего — можно сразу дописать детали.
              </p>
            </motion.div>
          </div>
        </section>

        {/* ─── Нижняя половина: тот же космос, только приглушённый ────── */}
        <div className="ths-below">
          <div className="ths-below-bg" aria-hidden="true">
            <span className="ths-below-sky" />
            <span className="ths-below-stars" />
            <span className="ths-below-glow ths-below-glow-a" />
            <span className="ths-below-glow ths-below-glow-b" />
          </div>

          {/* Что дальше */}
          <section id="thanks-next" className="ths-section scroll-mt-24">
            {/* На широком экране заголовок уходит в свою колонку слева: одна
                узкая панель посреди пустого поля читалась как случайный блок. */}
            <div className="ths-wrap ths-split">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="ths-kicker">
                  <span className="ths-kicker-dot" />
                  Что дальше
                </p>
                <h2 className="ths-h2">Три шага, дальше решаете вы</h2>
                <p className="ths-split-note">
                  Ничего делать не нужно — просто держите телефон под рукой.
                </p>
              </motion.div>

              <div className="ths-panel">
                <ol className="ths-line">
                  {steps.map((step, i) => (
                    <motion.li
                      key={step.title}
                      className="ths-line-item"
                      initial={{ opacity: 0, y: 18 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-70px' }}
                      transition={{ duration: 0.55, delay: i * 0.14, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <span className="ths-line-node">
                        <step.icon className="h-[1.05rem] w-[1.05rem]" />
                      </span>
                      <div className="ths-line-body">
                        <span className="ths-line-when">{step.when}</span>
                        <h3 className="ths-line-title">{step.title}</h3>
                        <p className="ths-line-note">{step.note}</p>
                      </div>
                    </motion.li>
                  ))}
                </ol>
              </div>

              {context?.hasEmail && (
                <p className="ths-hint">
                  <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-[#ffb04a]" />
                  Если ответа нет — загляните в «Спам» и «Промоакции»: письма туда попадают
                  чаще, чем хотелось бы.
                </p>
              )}
            </div>
          </section>

          {/* Пока ждёте */}
          <section className="ths-section">
            <div className="ths-wrap">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="ths-kicker">
                  <span className="ths-kicker-dot" />
                  Пока ждёте
                </p>
                <h2 className="ths-h2">Подобрал по теме, с которой вы пришли</h2>
              </motion.div>

              <div className="ths-tiles">
                {waitingCards.map((card, i) => (
                  <motion.div
                    key={card.to}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-70px' }}
                    transition={{ duration: 0.55, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    <Link to={card.to} className="ths-tile h-full">
                      {/* Космический объект в углу — из той же серии, что в
                          сцене наверху: плитка становится окном в сцену, а не
                          прямоугольником с текстом. */}
                      <span
                        className="ths-tile-orb"
                        style={{ backgroundImage: `url(/images/cosmic/${TILE_ORBS[i % TILE_ORBS.length]}.webp)` }}
                      />
                      <div>
                        <h3 className="ths-tile-title">{card.title}</h3>
                        <p className="ths-tile-note">{card.note}</p>
                      </div>
                      <span className="ths-tile-go">
                        Открыть
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>

              {/* Явный выход туда, откуда пришла заявка. Меню делает это же
                  молча, но человек не обязан догадываться, куда его уведёт
                  «Услуги» — путь возврата должен быть виден. */}
              <Link to={origin.path} className="ths-return">
                <ArrowLeft className="h-4 w-4" />
                {origin.label}
              </Link>

              {/* Соцсети — тихой строкой: главное действие уже наверху, и
                  конкурировать с ним этот блок не должен. */}
              <div className="ths-social">
                <p className="text-sm text-muted-foreground">Здесь я тоже есть:</p>
                <div className="ths-social-links">
                  {socialLinks.map((social) => (
                    <a
                      key={social.name}
                      href={social.link}
                      onClick={() => trackContact(
                        getThankYouContactChannel(social.name),
                        'thank_you',
                        { social_label: social.name },
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ths-social-link"
                    >
                      <social.icon className="h-4 w-4 text-primary" />
                      {social.name}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
