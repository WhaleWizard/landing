import { motion } from 'motion/react';
import { ArrowDown, BookOpenCheck, Briefcase, CheckCircle2, ClipboardList, MessageCircle, Route, Sparkles, Target, TrendingUp, Users } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';

const stats = [
  { value: '60–90', label: 'минут личного разбора' },
  { value: '30 дней', label: 'план действий после созвона' },
  { value: '$1k+', label: 'цель по первому стабильному доходу' },
];

const consultFor = [
  { icon: Users, title: 'Таргетологам без стабильных клиентов', text: 'Если умеете запускать рекламу, но заявки на ваши услуги идут случайно и нет понятной системы продаж.' },
  { icon: Briefcase, title: 'Специалистам, которые хотят поднять чек', text: 'Разберём упаковку, кейсы, оффер, коммуникацию и то, почему клиент выбирает “подешевле”.' },
  { icon: Target, title: 'Новичкам после обучения', text: 'Помогу понять, с какой ниши начать, как не распыляться и что показывать клиенту без большого портфолио.' },
  { icon: TrendingUp, title: 'Тем, кто застрял на одном уровне', text: 'Найдём узкое место: позиционирование, лидогенерация, продажи, страх цены или отсутствие понятного продукта.' },
];

const session = [
  { title: 'Диагностика текущей ситуации', text: 'Опыт, ниши, доход, текущие источники клиентов, портфолио, сильные и слабые стороны.' },
  { title: 'Упаковка и позиционирование', text: 'Кому вы продаёте, чем отличаетесь, какой результат обещаете и почему вам должны доверять.' },
  { title: 'Оффер и линейка услуг', text: 'Разберём, что продавать: аудит, запуск, ведение, консультации, performance-пакет или нишевое предложение.' },
  { title: 'Поиск клиентов и продажи', text: 'Соберём понятный план: где искать клиентов, что писать, как вести диалог и как закрывать на созвон.' },
  { title: 'План на 30 дней', text: 'После консультации у вас будет список конкретных действий, а не мотивационный разговор “просто делай”.' },
];

const packages = [
  { title: 'Разбор упаковки', result: 'понятный оффер и позиционирование', details: ['портфолио и кейсы', 'описание услуги', 'цена и пакеты'] },
  { title: 'Разбор поиска клиентов', result: 'система первых/следующих заявок', details: ['каналы лидогенерации', 'скрипты сообщений', 'логика follow-up'] },
  { title: 'Разбор роста дохода', result: 'план выхода на новый чек', details: ['поднятие цены', 'продуктовая линейка', 'работа с возражениями'] },
];

const cases = [
  { title: 'Junior target specialist', description: 'Упаковали нишу, переписали оффер и собрали простой outreach-план на 30 дней.', stats: [{ label: 'Созвоны', value: '11' }, { label: 'Клиенты', value: '2' }, { label: 'Доход', value: '$1.2k' }] },
  { title: 'Freelance media buyer', description: 'Сместили позиционирование с “настрою рекламу” на “снижу CPL и выстрою аналитику”.', stats: [{ label: 'Чек', value: '+65%' }, { label: 'Пакеты', value: '3' }, { label: 'Retainer', value: '$900' }] },
  { title: 'Специалист после паузы', description: 'Собрали портфолио из старых проектов, оффер на аудит и последовательность касаний.', stats: [{ label: 'Ответы', value: '18%' }, { label: 'Аудиты', value: '7' }, { label: 'Сделки', value: '3' }] },
];

const scrollToContact = () => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const scrollToCases = () => document.getElementById('cases')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export default function ConsultPage() {
  return (
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden [--primary:#8B5CF6] [--accent:#6366F1] [--secondary:#3B82F6]">
      <SEO title="Личная консультация для таргетологов" description="Консультация для таргетологов и media buyers: позиционирование, упаковка услуг, поиск клиентов, повышение чека и план действий на 30 дней." url="/consult" />
      <Navbar variant="service" />

      <section className="relative min-h-screen pt-28 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,.30),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,.22),transparent_30%),radial-gradient(circle_at_45%_90%,rgba(59,130,246,.18),transparent_34%)]" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[1fr_.9fr] gap-12 items-center">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm"><MessageCircle className="w-4 h-4 text-primary" /><span className="text-sm font-semibold text-primary">Личная консультация</span></div>
            <div className="space-y-5"><h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-balance">Помогу таргетологу найти клиентов и собрать <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">понятный план роста</span></h1><p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl">За 60–90 минут разберём вашу ситуацию: позиционирование, оффер, портфолио, цену, поиск клиентов и действия, которые нужно сделать в ближайшие 30 дней.</p></div>
            <div className="flex flex-col sm:flex-row gap-3"><Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Записаться на консультацию <ArrowDown className="ml-2 w-5 h-5" /></Button><Button size="lg" variant="outline" onClick={scrollToCases} className="border-primary/30 hover:bg-primary/10">Что можно разобрать</Button></div>
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl">{stats.map((item) => <div key={item.label} className="rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-sm"><div className="text-2xl md:text-3xl font-bold text-primary">{item.value}</div><div className="text-xs md:text-sm text-muted-foreground">{item.label}</div></div>)}</div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7 }} className="relative">
            <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/20 blur-3xl" />
            <div className="relative rounded-[2rem] border border-primary/20 bg-card/85 p-6 backdrop-blur-xl shadow-2xl shadow-primary/20">
              <div className="flex items-center justify-between mb-8"><div><p className="text-sm text-muted-foreground">Consultation map</p><p className="text-2xl font-bold">From chaos to plan</p></div><Route className="w-10 h-10 text-primary" /></div>
              {['Позиционирование', 'Оффер', 'Портфолио', 'Клиенты', 'План на 30 дней'].map((item, index) => <div key={item} className="flex items-center gap-4 mb-5"><div className="w-10 h-10 rounded-xl bg-primary/15 text-primary font-bold flex items-center justify-center">{index + 1}</div><div className="flex-1 rounded-2xl border border-border bg-background/60 p-4 font-medium">{item}</div></div>)}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="py-16 md:py-24"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="max-w-3xl mb-12"><span className="text-primary font-semibold">Для кого консультация</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Если вы умеете запускать рекламу, но не умеете стабильно продавать себя</h2><p className="text-lg text-muted-foreground">На консультации я не читаю лекцию. Мы разбираем вашу реальную ситуацию и собираем решения, которые можно внедрить сразу.</p></div><div className="grid md:grid-cols-2 gap-5">{consultFor.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-3xl border border-border bg-card/70 p-6 hover:border-primary/40 transition-colors"><div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center mb-5"><Icon className="w-6 h-6 text-primary" /></div><h3 className="text-xl font-bold mb-3">{title}</h3><p className="text-muted-foreground leading-relaxed">{text}</p></div>)}</div></div></section>

      <section className="py-16 md:py-24 bg-muted/20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-[.8fr_1.2fr] gap-12"><div><span className="text-accent font-semibold">Что будет на созвоне</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-5">Разбор без воды: от текущей точки до конкретных действий</h2><p className="text-lg text-muted-foreground">Цель консультации — чтобы после разговора вы понимали, что продавать, кому писать, как объяснять ценность и какой следующий шаг делать.</p></div><div className="space-y-4">{session.map((item, index) => <div key={item.title} className="rounded-3xl border border-border bg-card/70 p-5 flex gap-4"><div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary font-bold flex items-center justify-center shrink-0">0{index + 1}</div><div><h3 className="font-bold text-lg mb-1">{item.title}</h3><p className="text-muted-foreground text-sm leading-relaxed">{item.text}</p></div></div>)}</div></div></section>

      <section id="cases" className="py-16 md:py-24"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="text-center max-w-3xl mx-auto mb-12"><span className="text-primary font-semibold">Варианты разбора</span><h2 className="text-3xl md:text-5xl font-bold mt-3 mb-4">Можно прийти с одной проблемой или разобрать всю систему</h2><p className="text-muted-foreground text-lg">Фокус выбираем под вашу ситуацию: клиенты, упаковка, оффер, продажи, цена или план выхода на стабильный доход.</p></div><div className="grid lg:grid-cols-3 gap-6">{packages.map((item) => <div key={item.title} className="rounded-3xl border border-border bg-card/70 p-6 hover:border-primary/40 transition-colors"><BookOpenCheck className="w-9 h-9 text-primary mb-5" /><h3 className="text-xl font-bold mb-2">{item.title}</h3><p className="text-primary font-semibold mb-5">Результат: {item.result}</p><div className="space-y-2">{item.details.map((detail) => <div key={detail} className="flex gap-2 text-sm"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />{detail}</div>)}</div></div>)}</div></div></section>

      <section className="py-16 md:py-24 bg-muted/20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="max-w-3xl mb-10"><span className="text-accent font-semibold">Примеры результатов</span><h2 className="text-3xl md:text-5xl font-bold mt-3">Как может выглядеть прогресс после нормальной упаковки и плана</h2></div><div className="grid lg:grid-cols-3 gap-6">{cases.map((item) => <div key={item.title} className="rounded-3xl border border-border bg-card/70 p-6"><ClipboardList className="w-8 h-8 text-primary mb-5" /><h3 className="text-xl font-bold mb-3">{item.title}</h3><p className="text-muted-foreground text-sm leading-relaxed mb-5">{item.description}</p><div className="grid grid-cols-3 gap-2">{item.stats.map((stat) => <div key={stat.label} className="rounded-xl bg-primary/5 p-3"><div className="text-xs text-muted-foreground">{stat.label}</div><div className="font-bold text-primary">{stat.value}</div></div>)}</div></div>)}</div></div></section>

      <section className="py-14 md:py-20"><div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8"><div className="rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 p-6 md:p-10 text-center"><Sparkles className="w-8 h-8 text-primary mx-auto mb-4" /><h2 className="text-2xl md:text-4xl font-bold mb-4">Если вы давно откладываете системный рост — начните с разбора</h2><p className="text-muted-foreground text-lg mb-6 max-w-3xl mx-auto">Один созвон может сэкономить месяцы хаотичных действий: вы поймёте, где узкое место и что делать следующим шагом.</p><Button size="lg" onClick={scrollToContact} className="bg-gradient-to-r from-primary to-accent hover:opacity-90">Записаться на консультацию</Button></div></div></section>

      <section id="contact" className="relative py-16 md:py-24 overflow-hidden"><div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-[128px]" /><div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-secondary/20 blur-[128px]" /><div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center"><div><div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"><MessageCircle className="w-4 h-4 text-primary" /><span className="text-primary text-sm font-semibold">Личная консультация</span></div><h2 className="text-3xl md:text-5xl font-bold mb-5">Запишитесь на <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">разбор вашей ситуации</span></h2><p className="text-lg text-muted-foreground mb-7">Опишите опыт и главную проблему — я подготовлюсь и на созвоне дам максимально прикладной план.</p><div className="space-y-3">{['Разбор позиционирования и оффера', 'Анализ портфолио, цены и пакетов', 'Стратегия поиска клиентов', 'План действий на ближайшие 30 дней'].map((item) => <div key={item} className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-primary shrink-0" />{item}</div>)}</div></div><LandingForm service="consult" /></div></section>
      <Footer />
    </main>
  );
}
