import { motion } from 'motion/react';
import { ArrowDown, BarChart3, CheckCircle2, LineChart, MapPin, Search, ShieldAlert, ShoppingCart, Sparkles } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import { ImageWithFallback } from '../components/figma/ImageWithFallback';

const stats = [
  { value: '30k+', label: 'покупок в e-commerce' },
  { value: '210%', label: 'ROI в shopping-связках' },
  { value: '120k+', label: 'add to cart событий' },
];

const channels = [
  { icon: Search, title: 'Search Ads', text: 'Забираем горячий спрос у людей, которые уже ищут продукт, услугу или решение проблемы.', points: ['семантика и минус-слова', 'структура по интенту', 'контроль CPL/CPA'] },
  { icon: ShoppingCart, title: 'Shopping / Merchant Center', text: 'Для e-commerce выстраиваю товарный трафик: фид, категории, маржинальность, PMax и ремаркетинг.', points: ['оптимизация фида', 'Performance Max', 'ROAS по категориям'] },
  { icon: MapPin, title: 'Local & Maps traffic', text: 'Для локальных бизнесов усиливаю присутствие в поиске и на картах, где клиент выбирает быстро.', points: ['локальные кампании', 'расширения', 'звонки и маршруты'] },
  { icon: ShieldAlert, title: 'Защита бюджета', text: 'Отсекаю мусорные запросы, фейковые лиды, широкие соответствия и кампании, которые тратят без продаж.', points: ['минус-слова', 'поисковые запросы', 'чистая аналитика'] },
];

const process = [
  { title: 'Спрос и экономика', text: 'Считаю, есть ли поисковый спрос, какой бюджет нужен для теста и какую цену заявки бизнес выдержит.' },
  { title: 'Структура аккаунта', text: 'Разделяю бренд, горячий поиск, конкурентов, PMax/Shopping, ремаркетинг и тестовые гипотезы.' },
  { title: 'Конверсии и аналитика', text: 'Проверяю GA4/GTM, звонки, формы, покупки, импорт конверсий и качество данных для оптимизации.' },
  { title: 'Оптимизация', text: 'Еженедельно чищу запросы, ставки, объявления, фид, аудитории и бюджет по реальной эффективности.' },
];

const cases = [
  {
    title: 'E-commerce catalog',
    category: 'Google Shopping + PMax',
    image: 'https://i.ibb.co/YBwdT5rQ/photo-2026-04-11-00-20-59.jpg',
    description: 'Разделили товары по маржинальности, почистили фид, вынесли бренд и горячий поиск отдельно от Performance Max.',
    stats: [{ label: 'Add to cart', value: '120k+' }, { label: 'Покупки', value: '30k+' }, { label: 'ROI', value: '210%' }],
  },
  {
    title: 'Локальные услуги',
    category: 'Search + Maps',
    image: 'https://i.ibb.co/TqBqwSGB/photo-2026-04-11-00-21-23.jpg',
    description: 'Собрали кампании по районам и интентам, добавили звонки, маршруты, расширения и чистку поисковых запросов.',
    stats: [{ label: 'CPL', value: '$22–36' }, { label: 'Звонки', value: '1.9k+' }, { label: 'Conv. rate', value: '12.4%' }],
  },
  {
    title: 'B2B сервис',
    category: 'High-intent Search',
    image: 'https://i.ibb.co/F4q65TQk/photo-2026-04-11-00-20-39.jpg',
    description: 'Убрали информационный трафик, переписали объявления под коммерческий интент и настроили импорт квалифицированных лидов.',
    stats: [{ label: 'SQL', value: '340+' }, { label: 'CPL', value: '-38%' }, { label: 'Pipeline', value: '$420k' }],
  },
];

const scrollToContact = () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const scrollToCases = () => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function GoogleAdsPage() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden [--primary:#4285F4] [--accent:#34A853] [--secondary:#FBBC04]">
      <SEO title="Google Ads под горячий спрос и продажи" description="Настройка Google Ads: Search, Shopping, Performance Max, YouTube, ремаркетинг, аналитика GA4/GTM и оптимизация CPL/ROAS." url="/google-ads" />
      <Navbar variant="service" />

      <section className="relative pt-28 pb-20 min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(66,133,244,.26),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(52,168,83,.2),transparent_28%),radial-gradient(circle_at_55%_85%,rgba(251,188,4,.16),transparent_34%)]" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_.9fr] gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm"><Search className="w-4 h-4 text-primary" /><span className="text-sm font-semibold text-primary">Google Ads для горячего спроса</span></div>
            <div className="space-y-5">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-balance">Получайте клиентов из Google, когда они уже <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">ищут ваш продукт</span></h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">Настраиваю Search, Shopping, Performance Max и ремаркетинг так, чтобы бюджет работал на заявки, покупки и понятный ROAS — без хаотичных ключей и мусорных кликов.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Получить аудит Google Ads <ArrowDown className="ml-2 w-5 h-5" /></Button>
              <Button size="lg" variant="outline" onClick={scrollToCases} className="border-primary/30 hover:bg-primary/10">Смотреть кейсы</Button>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl">{stats.map((item) => <div key={item.label} className="rounded-2xl border border-border bg-card/70 p-4"><div className="text-2xl md:text-3xl font-bold text-primary">{item.value}</div><div className="text-xs md:text-sm text-muted-foreground">{item.label}</div></div>)}</div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7 }} className="relative">
            <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-primary/25 via-accent/20 to-secondary/20 blur-3xl" />
            <div className="relative rounded-[2rem] bg-card/85 border border-primary/20 p-6 backdrop-blur-xl shadow-2xl shadow-primary/15">
              <div className="flex items-center justify-between mb-8"><div><p className="text-sm text-muted-foreground">Search demand</p><p className="text-2xl font-bold">Intent Engine</p></div><LineChart className="w-10 h-10 text-primary" /></div>
              {['Commercial keywords', 'Clean conversions', 'PMax feed quality', 'ROAS control'].map((item, index) => <div key={item} className="mb-4 rounded-2xl border border-border bg-background/60 p-4"><div className="flex justify-between mb-2"><span>{item}</span><span className="text-primary font-semibold">{index === 0 ? 'hot' : `${74 + index * 7}%`}</span></div><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-primary via-accent to-secondary" style={{ width: `${78 + index * 6}%` }} /></div></div>)}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="max-w-3xl mb-12"><span className="text-primary font-semibold">Оффер</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Google Ads, где каждая кампания отвечает за свой тип спроса</h2><p className="text-lg text-muted-foreground">Цель — не просто запустить рекламу, а отделить горячие запросы от мусора, увидеть реальную стоимость заявки и масштабировать прибыльные сегменты.</p></div><div className="grid md:grid-cols-2 gap-5">{channels.map(({ icon: Icon, title, text, points }) => <div key={title} className="rounded-3xl border border-border bg-card/70 p-6 hover:border-primary/40 transition-colors"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center mb-5"><Icon className="w-6 h-6 text-primary" /></div><h3 className="text-xl font-bold mb-3">{title}</h3><p className="text-muted-foreground mb-5 leading-relaxed">{text}</p><div className="space-y-2">{points.map((point) => <div key={point} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />{point}</div>)}</div></div>)}</div></div></section>

      <section className="py-16 md:py-24 bg-muted/20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[.85fr_1.15fr] gap-12"><div><span className="text-accent font-semibold">Процесс</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-5">Сначала чистая структура — потом масштаб</h2><p className="text-lg text-muted-foreground">В Google Ads нельзя лечить хаос увеличением бюджета. Сначала отделяем спрос, конверсии и маржинальность.</p></div><div className="grid sm:grid-cols-2 gap-4">{process.map((step, index) => <div key={step.title} className="rounded-3xl border border-border bg-card/70 p-6"><div className="text-primary font-bold mb-3">0{index + 1}</div><h3 className="font-bold text-lg mb-2">{step.title}</h3><p className="text-muted-foreground text-sm leading-relaxed">{step.text}</p></div>)}</div></div></section>

      <section id="cases" className="py-16 md:py-24"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="text-center max-w-3xl mx-auto mb-12"><span className="text-primary font-semibold">Кейсы Google Ads</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Результаты в поиске появляются, когда реклама совпадает с намерением клиента</h2><p className="text-muted-foreground text-lg">Для Google Ads важны структура, качество запросов, конверсии и скорость оптимизации.</p></div><div className="grid lg:grid-cols-3 gap-6">{cases.map((item) => <article key={item.title} className="rounded-3xl overflow-hidden border border-border bg-card group hover:border-primary/40 transition-colors"><div className="h-56 relative overflow-hidden"><ImageWithFallback src={item.image} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /><div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent" /><div className="absolute top-4 right-4 rounded-full bg-background/80 border border-border px-3 py-1 text-xs text-primary font-semibold">{item.category}</div></div><div className="p-6"><h3 className="text-xl font-bold mb-3">{item.title}</h3><p className="text-muted-foreground text-sm leading-relaxed mb-5">{item.description}</p><div className="grid grid-cols-3 gap-2">{item.stats.map((stat) => <div key={stat.label} className="rounded-xl bg-primary/5 p-3"><div className="text-xs text-muted-foreground">{stat.label}</div><div className="font-bold text-primary">{stat.value}</div></div>)}</div></div></article>)}</div></div></section>

      <section className="py-14 md:py-20"><div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"><div className="rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 p-6 md:p-10 text-center"><Sparkles className="w-8 h-8 text-primary mx-auto mb-4" /><h2 className="text-2xl md:text-4xl font-bold mb-4">Не уверены, что Google Ads сейчас настроен правильно?</h2><p className="text-muted-foreground text-lg mb-6 max-w-3xl mx-auto">Проверю структуру, ключевые слова, минус-слова, PMax, конверсии и покажу, где бюджет теряется до заявки.</p><Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Получить аудит кампаний</Button></div></div></section>

      <section id="contact" className="relative py-16 md:py-24 overflow-hidden"><div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-[128px]" /><div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-accent/20 blur-[128px]" /><div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center"><div><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"><BarChart3 className="w-4 h-4 text-primary" /><span className="text-primary text-sm font-semibold">Бесплатный аудит</span></div><h2 className="text-3xl md:text-5xl font-bold mb-5">Покажу, где Google Ads <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">сливает бюджет</span></h2><p className="text-lg text-muted-foreground mb-7">Разберу аккаунт и дам конкретный список правок: структура, ключи, минус-слова, конверсии, PMax и посадочные страницы.</p><div className="space-y-3">{['Аудит структуры и поисковых запросов', 'Проверка GA4/GTM и целей', 'Разбор PMax, Shopping и фида', 'План оптимизации на 14–30 дней'].map((item) => <div key={item} className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0" />{item}</div>)}</div></div><LandingForm service="google-ads" /></div></section>
      <Footer />
    </main>
  );
}
