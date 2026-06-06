import { motion } from 'motion/react';
import { ArrowDown, BarChart3, CheckCircle2, Megaphone, MousePointerClick, ShieldCheck, Sparkles, Target, TrendingUp, Zap } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

const heroStats = [
  { value: '65k+', label: 'лидов в Meta Ads' },
  { value: '$1M+', label: 'Meta spend в проектах' },
  { value: '4 года', label: 'ведение одного проекта' },
];

const offers = [
  {
    icon: Target,
    title: 'Meta Ads под заявки, а не охваты',
    text: 'Собираю кампании вокруг действия: лид, покупка, запись, сообщение в WhatsApp/Telegram или заявка на сайте.',
    bullets: ['Lead Ads и сайтовые конверсии', 'Instagram/Facebook placements', 'Ретаргетинг и lookalike'],
  },
  {
    icon: Megaphone,
    title: 'Креативы с понятной гипотезой',
    text: 'Не запускаю “красивые баннеры ради баннеров”. Каждый креатив привязан к боли, триггеру, сегменту аудитории и этапу воронки.',
    bullets: ['UGC / Reels / Stories', 'офферы под холодную аудиторию', 'быстрые A/B тесты'],
  },
  {
    icon: ShieldCheck,
    title: 'Pixel, CAPI и качество событий',
    text: 'Проверяю, какие события реально уходят в Meta, чтобы алгоритм обучался на качественных действиях, а не на мусорных кликах.',
    bullets: ['Meta Pixel', 'Conversions API', 'deduplication events'],
  },
  {
    icon: TrendingUp,
    title: 'Масштабирование рабочих связок',
    text: 'Когда связка дала результат — аккуратно масштабирую бюджет, аудитории и креативные углы без резкого скачка CPL.',
    bullets: ['контроль CPL/CPA', 'масштаб по GEO', 'обновление креативов'],
  },
];

const process = [
  'Разбираю продукт, маржу, целевой CPL и путь клиента до заявки.',
  'Проверяю кабинет, Pixel/CAPI, события, аудитории, креативы и посадочные страницы.',
  'Собираю тестовую матрицу: сегменты, офферы, форматы, плейсменты и бюджет на гипотезы.',
  'Запускаю кампании и каждый день отсекаю слабые связки по данным, а не по ощущениям.',
  'Масштабирую победителей: новые креативы, ретаргетинг, lookalike, расширение аудиторий.',
];

const cases = [
  {
    title: 'Premium Concierge Service',
    category: 'Meta Ads / лидогенерация',
    image: 'https://i.ibb.co/vCrb62rL/photo-2026-04-11-00-20-15.jpg',
    description: 'Премиальный сервис с длинным циклом сделки. Упор сделали на квалификацию лида, доверие в креативах и дожим через ретаргетинг.',
    stats: [
      { label: 'Период', value: '4 года' },
      { label: 'Лиды', value: '65k+' },
      { label: 'Ad Spend', value: '$1M+' },
    ],
  },
  {
    title: 'B2C услуги в США',
    category: 'Instagram/Facebook Ads',
    image: 'https://i.ibb.co/TqBqwSGB/photo-2026-04-11-00-21-23.jpg',
    description: 'Пересобрали оффер, добавили быстрые формы и отдельные кампании под тёплые аудитории. Основной KPI — стабильная цена заявки.',
    stats: [
      { label: 'CPL', value: '$18–27' },
      { label: 'Заявки', value: '3.8k+' },
      { label: 'ROMI', value: '230%' },
    ],
  },
  {
    title: 'Онлайн-курс',
    category: 'Meta Ads / воронка',
    image: 'https://i.ibb.co/F4q65TQk/photo-2026-04-11-00-20-39.jpg',
    description: 'Сегментировали аудитории по уровню прогрева, вынесли разные обещания в Reels/Stories и усилили ретаргетинг на просмотревших лендинг.',
    stats: [
      { label: 'CPL', value: 'до $5.40' },
      { label: 'Регистрации', value: '18k+' },
      { label: 'ROI', value: '180%' },
    ],
  },
];

const proofPoints = [
  'Не обещаю “золотую кнопку”. Сначала считаю экономику и допустимую цену клиента.',
  'Показываю, какие креативы, аудитории и события реально влияют на заявки.',
  'Смотрю не только кабинет Meta, но и оффер, лендинг, скорость ответа и качество лидов.',
];

const scrollToContact = () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const scrollToCases = () => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function MetaAdsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden [--primary:#4F7DFF] [--accent:#B04DFF] [--secondary:#FF7AB6]">
      <SEO
        title="Meta Ads для заявок из Instagram и Facebook"
        description="Настройка и ведение Meta Ads: креативы, Pixel, Conversions API, ретаргетинг и масштабирование заявок из Instagram/Facebook."
        url="/meta-ads"
      />
      <Navbar variant="service" />

      <section className="relative min-h-screen pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(79,125,255,.28),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(176,77,255,.22),transparent_28%),radial-gradient(circle_at_50%_90%,rgba(255,122,182,.18),transparent_32%)]" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-primary">Performance Meta Ads</span>
            </div>
            <div className="space-y-5">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-balance">
                Приведу клиентов из{' '}
                <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">Instagram и Facebook</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">
                Настраиваю Meta Ads как систему продаж: оффер, креативы, Pixel, CAPI, ретаргетинг и ежедневная оптимизация под заявки, покупки или сообщения.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90 group">
                Получить аудит Meta Ads <ArrowDown className="ml-2 w-5 h-5 group-hover:translate-y-1 transition-transform" />
              </Button>
              <Button size="lg" variant="outline" onClick={scrollToCases} className="border-primary/30 hover:bg-primary/10">
                Смотреть кейсы
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl">
              {heroStats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm">
                  <div className="text-2xl md:text-3xl font-bold text-primary">{item.value}</div>
                  <div className="text-xs md:text-sm text-muted-foreground">{item.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-primary/20 bg-card/80 backdrop-blur-xl p-6 shadow-2xl shadow-primary/20">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-sm text-muted-foreground">Campaign health</p>
                  <p className="text-2xl font-bold">Meta Growth System</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div className="space-y-4">
                {['Creative testing', 'Pixel + CAPI events', 'Retargeting layers', 'Scaling winners'].map((item, index) => (
                  <div key={item} className="rounded-2xl border border-border bg-background/55 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{item}</span>
                      <span className="text-primary text-sm">{82 + index * 4}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent" style={{ width: `${82 + index * 4}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mb-12">
            <span className="text-primary font-semibold">Оффер</span>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Meta Ads без хаоса: понятная система гипотез, событий и масштабирования</h2>
            <p className="text-lg text-muted-foreground">Я не продаю “настройку кабинета”. Я собираю связку, где реклама, креативы, аналитика и воронка работают на один KPI.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {offers.map(({ icon: Icon, title, text, bullets }) => (
              <motion.div key={title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-3xl border border-border bg-card/70 p-6 hover:border-primary/40 transition-colors">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center mb-5">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-3">{title}</h3>
                <p className="text-muted-foreground mb-5 leading-relaxed">{text}</p>
                <div className="space-y-2">
                  {bullets.map((bullet) => (
                    <div key={bullet} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />{bullet}</div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <span className="text-accent font-semibold">Процесс</span>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 mb-5">Как запускаю Meta Ads, чтобы не сливать тестовый бюджет</h2>
            <p className="text-lg text-muted-foreground">Каждый этап нужен, чтобы Meta получала правильные сигналы, а вы видели не “клики”, а стоимость заявки и окупаемость.</p>
          </div>
          <div className="space-y-4">
            {process.map((item, index) => (
              <div key={item} className="flex gap-4 rounded-2xl border border-border bg-card/70 p-5">
                <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">{index + 1}</div>
                <p className="text-muted-foreground leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="cases" className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-primary font-semibold">Кейсы Meta Ads</span>
            <h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Реалистичные результаты там, где есть оффер, воронка и скорость обработки</h2>
            <p className="text-muted-foreground text-lg">Цифры зависят от ниши и отдела продаж, поэтому в работе я всегда фиксирую KPI до запуска.</p>
          </div>
          <div className="grid lg:grid-cols-3 gap-6">
            {cases.map((item) => (
              <article key={item.title} className="rounded-3xl overflow-hidden border border-border bg-card group hover:border-primary/40 transition-colors">
                <div className="h-56 relative overflow-hidden">
                  <ImageWithFallback src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" />
                  <div className="absolute top-4 right-4 rounded-full bg-background/80 border border-border px-3 py-1 text-xs text-primary font-semibold">{item.category}</div>
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed mb-5">{item.description}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {item.stats.map((stat) => (
                      <div key={stat.label} className="rounded-xl bg-primary/5 p-3">
                        <div className="text-xs text-muted-foreground">{stat.label}</div>
                        <div className="font-bold text-primary">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 p-6 md:p-10 text-center">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-4" />
            <h2 className="text-2xl md:text-4xl font-bold mb-4">Хотите понять, почему Meta Ads сейчас не даёт стабильные заявки?</h2>
            <p className="text-muted-foreground text-lg mb-6 max-w-3xl mx-auto">Разберу кабинет, креативы, события и оффер. Покажу, где теряется бюджет и какие 3–5 гипотез стоит проверить первыми.</p>
            <Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Получить бесплатный аудит</Button>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-3 gap-5">
          {proofPoints.map((item, index) => (
            <div key={item} className="rounded-3xl border border-border bg-card/70 p-6">
              <div className="text-primary font-bold mb-3">0{index + 1}</div>
              <p className="text-muted-foreground leading-relaxed">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="relative py-16 md:py-24 overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-secondary/20 blur-[128px]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"><MousePointerClick className="w-4 h-4 text-primary" /><span className="text-primary text-sm font-semibold">Бесплатный разбор</span></div>
            <h2 className="text-3xl md:text-5xl font-bold mb-5">Получите аудит <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">Meta Ads</span></h2>
            <p className="text-lg text-muted-foreground mb-7">Покажу, какие кампании, креативы, события и элементы воронки мешают получать заявки дешевле и стабильнее.</p>
            <div className="space-y-3">
              {['Анализ структуры кампаний и бюджета', 'Проверка Pixel/CAPI и событий', 'Разбор креативов и офферов', 'План тестов на ближайшие 14 дней'].map((item) => (
                <div key={item} className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0" />{item}</div>
              ))}
            </div>
          </div>
          <LandingForm service="meta-ads" />
        </div>
      </section>

      <Footer />
    </main>
  );
}
