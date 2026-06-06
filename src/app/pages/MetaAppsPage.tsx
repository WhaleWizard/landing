import { motion } from 'motion/react';
import { Activity, ArrowDown, CheckCircle2, Gauge, Layers3, Rocket, Smartphone, Sparkles, Zap } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';
import ServiceHeroArt from '../components/ServiceHeroArt';

const appMetrics = [
  { value: '-31%', label: 'снижение CPI после креативных тестов' },
  { value: '42k+', label: 'установок в app-воронках' },
  { value: '2.7x', label: 'рост trial events при оптимизации' },
];

const growthBlocks = [
  {
    icon: Smartphone,
    title: 'App Install campaigns',
    text: 'Запускаю установки не ради красивого CPI, а как первый шаг к регистрации, trial, покупке или другому in-app событию.',
    bullets: ['install → registration', 'trial / purchase events', 'iOS и Android сегменты'],
  },
  {
    icon: Activity,
    title: 'MMP, SKAN и события',
    text: 'Проверяю, какие события видит Meta, как они мапятся в MMP и достаточно ли данных для оптимизации алгоритма.',
    bullets: ['AppsFlyer / Adjust / Firebase', 'SKAN логика', 'event mapping'],
  },
  {
    icon: Zap,
    title: 'Креативы под mobile placements',
    text: 'Для приложений креатив решает больше, чем “интересы”. Собираю матрицу хуков под Reels, Stories, Feed и короткие demo-видео.',
    bullets: ['UGC и demo flow', 'pain → solution', 'creative fatigue control'],
  },
  {
    icon: Gauge,
    title: 'Оптимизация по качеству, а не CPI',
    text: 'Дешёвая установка не нужна, если пользователь не активируется. Смотрю retention-сигналы, стоимость события и путь до оплаты.',
    bullets: ['CPI / CPA / ROAS', 'cohort signals', 'event quality'],
  },
];

const funnel = [
  { step: '01', title: 'App funnel audit', text: 'Разбираю onboarding, события, paywall/trial, GEO, платформы, текущие кампании и точки оттока.' },
  { step: '02', title: 'Tracking readiness', text: 'Проверяю MMP/Firebase, App Events, SKAN, deduplication и то, какие события доступны Meta для обучения.' },
  { step: '03', title: 'Creative matrix', text: 'Собираю набор гипотез: pain hooks, benefit hooks, demo hooks, testimonials, before/after, offer angles.' },
  { step: '04', title: 'Launch by event depth', text: 'Стартую с установки/регистрации, затем перевожу оптимизацию глубже: trial, subscribe, purchase или qualified action.' },
  { step: '05', title: 'Scale without breaking CPA', text: 'Масштабирую по связкам: GEO, platform, creative angle, event optimization и бюджетные правила.' },
];

const cases = [
  {
    title: 'Subscription wellness app',
    category: 'Trial optimization',
    image: 'https://i.ibb.co/F4q65TQk/photo-2026-04-11-00-20-39.jpg',
    description: 'Перешли от оптимизации на установку к trial start, переписали первые 3 секунды видео и разделили iOS/Android кампании.',
    stats: [{ label: 'Trial CPA', value: '-28%' }, { label: 'Trials', value: '6.4k+' }, { label: 'CPI', value: '$1.80–2.40' }],
  },
  {
    title: 'Mobile marketplace',
    category: 'Registration events',
    image: 'https://i.ibb.co/YBwdT5rQ/photo-2026-04-11-00-20-59.jpg',
    description: 'Сконцентрировались на регистрации и первом полезном действии. Креативы показывали сценарий использования, а не просто интерфейс.',
    stats: [{ label: 'Installs', value: '42k+' }, { label: 'Reg. CPA', value: '$3.70' }, { label: 'Activation', value: '+46%' }],
  },
  {
    title: 'Casual game launch',
    category: 'Creative testing',
    image: 'https://i.ibb.co/vCrb62rL/photo-2026-04-11-00-20-15.jpg',
    description: 'Сделали быстрый цикл тестов: gameplay hooks, fail moments, reward scenes. Победители масштабировались по широким аудиториям.',
    stats: [{ label: 'CPI', value: '-31%' }, { label: 'Creatives', value: '48' }, { label: 'D1 retention', value: '+19%' }],
  },
];

const appOffer = [
  'Проверю, готово ли приложение к закупке трафика: события, MMP, onboarding и paywall.',
  'Покажу, на какое событие лучше оптимизироваться сейчас: install, registration, trial, purchase или custom event.',
  'Соберу план креативных тестов под Meta placements, чтобы не зависеть от одного “выгоревшего” ролика.',
  'Дам понятную логику масштабирования: какие GEO, бюджеты и события трогать первыми.',
];

const scrollToContact = () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const scrollToCases = () => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function MetaAppsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden [--primary:#4F7DFF] [--accent:#B04DFF] [--secondary:#FF7AB6]">
      <SEO title="Meta Ads для мобильных приложений" description="Продвижение мобильных приложений через Meta Ads: App Install, App Event campaigns, MMP/SKAN, креативы, CPI/CPA/ROAS и масштабирование." url="/meta-apps" />
      <Navbar variant="service" />

      <section className="relative min-h-screen pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(79,125,255,.30),transparent_34%),radial-gradient(circle_at_84%_15%,rgba(176,77,255,.24),transparent_30%),radial-gradient(circle_at_50%_88%,rgba(255,122,182,.20),transparent_34%)]" />
        <div className="absolute left-1/2 top-24 h-[680px] w-[680px] -translate-x-1/2 rounded-full border border-primary/10" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_.9fr] gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm"><Rocket className="w-4 h-4 text-primary" /><span className="text-sm font-semibold text-primary">App Growth через Meta Ads</span></div>
            <div className="space-y-5">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black leading-[0.95] tracking-[-0.045em] text-balance"><span className="block">Масштабируйте</span><span className="mt-2 block text-foreground/90">установки и</span><span className="mt-2 block bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">целевые события</span></h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">Запускаю Meta Ads для приложений не “на дешёвые установки”, а на рост качественных пользователей: registration, trial, subscribe, purchase и другие in-app events.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3"><Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Получить стратегию app growth <ArrowDown className="ml-2 w-5 h-5" /></Button><Button size="lg" variant="outline" onClick={scrollToCases} className="border-primary/30 hover:bg-primary/10">Смотреть app-кейсы</Button></div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl">{appMetrics.map((item) => <div key={item.label} className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm"><div className="text-2xl md:text-3xl font-bold text-primary">{item.value}</div><div className="text-xs md:text-sm text-muted-foreground">{item.label}</div></div>)}</div>
          </motion.div>

          <ServiceHeroArt variant="meta-apps" />
        </div>
      </section>

      <section className="py-16 md:py-24"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="max-w-3xl mb-12"><span className="text-primary font-semibold">Оффер для приложений</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Не просто установки. Трафик, который двигает пользователя глубже по app funnel</h2><p className="text-lg text-muted-foreground">Для приложений дешёвый CPI часто обманывает. Поэтому я смотрю связку целиком: событие оптимизации, креатив, onboarding, MMP/SKAN и качество пользователей.</p></div><div className="grid md:grid-cols-2 gap-5">{growthBlocks.map(({ icon: Icon, title, text, bullets }) => <motion.div key={title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-3xl border border-border bg-card/70 p-6 hover:border-primary/40 transition-colors"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center mb-5"><Icon className="w-6 h-6 text-primary" /></div><h3 className="text-xl font-bold mb-3">{title}</h3><p className="text-muted-foreground mb-5 leading-relaxed">{text}</p><div className="space-y-2">{bullets.map((bullet) => <div key={bullet} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />{bullet}</div>)}</div></motion.div>)}</div></div></section>

      <section className="py-16 md:py-24 bg-muted/20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="grid lg:grid-cols-[.8fr_1.2fr] gap-12"><div><span className="text-accent font-semibold">App growth system</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-5">Как я строю закупку трафика для приложений</h2><p className="text-lg text-muted-foreground">Meta должна получать правильный сигнал. Если оптимизироваться слишком рано на покупку — данных может не хватить. Если слишком долго на install — придут дешёвые, но слабые пользователи.</p></div><div className="space-y-4">{funnel.map((item) => <div key={item.step} className="rounded-3xl border border-border bg-card/70 p-5 flex gap-4"><div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">{item.step}</div><div><h3 className="font-bold text-lg mb-1">{item.title}</h3><p className="text-muted-foreground text-sm leading-relaxed">{item.text}</p></div></div>)}</div></div></div></section>

      <section id="cases" className="py-16 md:py-24"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="text-center max-w-3xl mx-auto mb-12"><span className="text-primary font-semibold">App-кейсы</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Для приложений важна не цена установки, а стоимость качественного события</h2><p className="text-muted-foreground text-lg">Ниже — форматы результатов, к которым стремимся: меньше CPI/CPA, больше trial/registration/purchase events и понятнее масштабирование.</p></div><div className="grid lg:grid-cols-3 gap-6">{cases.map((item) => <article key={item.title} className="rounded-3xl overflow-hidden border border-border bg-card group hover:border-primary/40 transition-colors"><div className="h-56 relative overflow-hidden"><ImageWithFallback src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /><div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" /><div className="absolute top-4 right-4 rounded-full bg-background/80 border border-border px-3 py-1 text-xs text-primary font-semibold">{item.category}</div></div><div className="p-6"><h3 className="text-xl font-bold mb-3">{item.title}</h3><p className="text-muted-foreground text-sm leading-relaxed mb-5">{item.description}</p><div className="grid grid-cols-3 gap-2">{item.stats.map((stat) => <div key={stat.label} className="rounded-xl bg-primary/5 p-3"><div className="text-xs text-muted-foreground">{stat.label}</div><div className="font-bold text-primary">{stat.value}</div></div>)}</div></div></article>)}</div></div></section>

      <section className="py-16 md:py-24 bg-muted/20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-4 gap-4">{appOffer.map((item, index) => <div key={item} className="rounded-3xl border border-border bg-card/70 p-6"><div className="text-primary font-bold mb-3">0{index + 1}</div><p className="text-muted-foreground leading-relaxed">{item}</p></div>)}</div></section>

      <section className="py-14 md:py-20"><div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"><div className="rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 p-6 md:p-10 text-center"><Sparkles className="w-8 h-8 text-primary mx-auto mb-4" /><h2 className="text-2xl md:text-4xl font-bold mb-4">Хотите понять, готово ли приложение к масштабированию в Meta?</h2><p className="text-muted-foreground text-lg mb-6 max-w-3xl mx-auto">Разберу app funnel, события, MMP/SKAN, креативы и покажу, на какое событие лучше закупать трафик прямо сейчас.</p><Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Получить app growth разбор</Button></div></div></section>

      <section id="contact" className="relative py-16 md:py-24 overflow-hidden"><div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-[128px]" /><div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-secondary/20 blur-[128px]" /><div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center"><div><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"><Layers3 className="w-4 h-4 text-primary" /><span className="text-primary text-sm font-semibold">App Growth</span></div><h2 className="text-3xl md:text-5xl font-bold mb-5">Получите стратегию <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">роста приложения</span></h2><p className="text-lg text-muted-foreground mb-7">Покажу, как получать не просто установки, а пользователей, которые доходят до нужных событий в приложении.</p><div className="space-y-3">{['Аудит App Install и App Event кампаний', 'Проверка MMP/SKAN/Firebase и событий', 'Креативная матрица под Reels/Stories', 'План масштабирования по CPI/CPA/ROAS'].map((item) => <div key={item} className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0" />{item}</div>)}</div></div><LandingForm service="meta-apps" /></div></section>
      <Footer />
    </main>
  );
}
