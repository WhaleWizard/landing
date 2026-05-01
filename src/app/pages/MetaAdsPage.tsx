import { useState } from 'react';
import { motion } from 'motion/react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEO from '../components/SEO';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { API_ROUTES } from '../config';
import { trackLead } from '../consent/consent';

const stats = [
  { value: '$2M+', label: 'рекламного бюджета в управлении' },
  { value: '500K+', label: 'лидов в performance-воронках' },
  { value: '240%', label: 'средняя окупаемость в рабочих проектах' },
];

const testimonials = [
  { name: 'Алина, owner eCom', text: 'После пересборки оффера и креативов получили стабильный поток заказов. Стоимость заявки упала уже в первый месяц.' },
  { name: 'Дмитрий, локальный сервис', text: 'До этого был хаос в аналитике. После внедрения CAPI и нормальной структуры стало понятно, что реально приносит деньги.' },
];

const cases = [
  { niche: 'E-commerce', result: 'CPA -32% за 5 недель', details: 'Сегментация по маржинальности + новые видео-креативы под этапы воронки.' },
  { niche: 'B2C услуги', result: 'Валидные лиды +47%', details: 'Перепаковали оффер и убрали “мусорный” трафик через сигналы и exclusions.' },
  { niche: 'Online education', result: 'CPL -28%', details: 'Reels-first гипотезы + ретаргетинг по вовлечению + лид-форма с фильтрацией.' },
];

export default function MetaAdsPage() {
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', niche: '', budget: '', goal: '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    const eventId = crypto.randomUUID();
    try {
      const res = await fetch(API_ROUTES.lead, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, phone: form.phone, budget: form.budget, event_id: eventId, page_url: window.location.href, referrer: document.referrer || undefined, message: `Meta Ads | Ниша: ${form.niche}; Цель: ${form.goal}` }),
      });
      if (!res.ok) throw new Error('failed');
      trackLead(eventId);
      alert('Заявка отправлена');
      setForm({ name: '', phone: '', niche: '', budget: '', goal: '' });
    } finally { setSending(false); }
  };

  return <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
    <SEO title="Meta Ads: заявки и продажи" description="Таргет в Instagram/Facebook под ключ: оффер, креативы, CAPI, масштабирование" url="/meta-ads" />
    <Navbar />

    <section className="relative pt-28 pb-14 md:pb-20">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/15 to-secondary/20" />
      <div className="relative max-w-6xl mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-5">
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold leading-tight">Meta Ads, который превращает трафик в системные продажи</h1>
            <p className="text-base md:text-lg text-muted-foreground">Работаю как performance-партнер: собираю оффер, креативную систему, аналитику и масштабирование. Вы видите не просто клики — а путь до прибыли.</p>
            <a href="#lead"><Button size="lg" className="w-full sm:w-auto">Получить аудит Meta Ads</Button></a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
            {stats.map((s) => <motion.div key={s.label} whileHover={{ y: -4 }} className="rounded-2xl border border-border bg-card/70 p-4"><p className="text-2xl font-bold text-primary">{s.value}</p><p className="text-xs text-muted-foreground mt-1">{s.label}</p></motion.div>)}
          </div>
        </div>
      </div>
    </section>

    <section className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h2 className="text-2xl md:text-3xl font-bold mb-4">Кейсы и результаты</h2>
      <div className="grid md:grid-cols-3 gap-4">{cases.map((c) => <article key={c.niche} className="rounded-2xl border bg-card/60 p-5"><p className="text-xs text-primary mb-2">{c.niche}</p><h3 className="font-semibold">{c.result}</h3><p className="text-sm text-muted-foreground mt-2">{c.details}</p></article>)}</div>
    </section>

    <section className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="rounded-3xl border bg-card/50 p-6 md:p-8">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Почему выбирают меня</h2>
        <ul className="grid md:grid-cols-2 gap-3 text-sm md:text-base text-muted-foreground">
          <li>• Глубокая диагностика воронки и оффера перед запуском.</li>
          <li>• Креативы под боли ЦА, а не “красивые, но пустые” макеты.</li>
          <li>• CAPI + GA4 + GTM + дедупликация событий.</li>
          <li>• Еженедельные выводы: что отключить, что масштабировать.</li>
        </ul>
      </div>
    </section>

    <section className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <h2 className="text-2xl md:text-3xl font-bold mb-4">Отзывы клиентов</h2>
      <div className="grid md:grid-cols-2 gap-4">{testimonials.map((t) => <blockquote key={t.name} className="rounded-2xl border bg-card/60 p-6"><p className="text-sm md:text-base">“{t.text}”</p><footer className="text-xs text-primary mt-3">— {t.name}</footer></blockquote>)}</div>
    </section>

    <section id="lead" className="max-w-3xl mx-auto px-4 py-12 md:py-14">
      <form onSubmit={submit} className="rounded-3xl border bg-card/60 p-6 md:p-8 space-y-4">
        <h2 className="text-2xl font-bold">Узнайте стоимость клиента в вашей нише</h2>
        <Input required placeholder="Имя" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} />
        <Input required placeholder="Телефон / WhatsApp" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} />
        <Input placeholder="Сайт / ниша" value={form.niche} onChange={(e)=>setForm({...form,niche:e.target.value})} />
        <Input placeholder="Месячный бюджет" value={form.budget} onChange={(e)=>setForm({...form,budget:e.target.value})} />
        <Textarea placeholder="Цель: заявки / продажи / окупаемость" value={form.goal} onChange={(e)=>setForm({...form,goal:e.target.value})} />
        <Button className="w-full" disabled={sending}>{sending ? 'Отправка...' : 'Получить расчет'}</Button>
      </form>
    </section>
    <Footer />
  </main>;
}
