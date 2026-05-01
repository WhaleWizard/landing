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

const proof = [
  { k: 'Search CVR', v: '7.52%', d: 'средний ориентир по рынку 2025' },
  { k: 'Контроль ROMI', v: 'еженедельно', d: 'оценка по продажам, не только по лидам' },
  { k: 'Каналы', v: 'Search + PMax + YouTube', d: 'единая воронка от спроса до дожима' },
];

export default function GoogleAdsPage() {
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', niche: '', budget: '', goal: '' });
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setSending(true); const eventId = crypto.randomUUID(); try { const res = await fetch(API_ROUTES.lead,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name,phone:form.phone,budget:form.budget,event_id:eventId,page_url:window.location.href,referrer:document.referrer||undefined,message:`Google Ads | Ниша: ${form.niche}; Цель: ${form.goal}`})}); if(!res.ok) throw new Error('failed'); trackLead(eventId); alert('Заявка отправлена'); setForm({ name: '', phone: '', niche: '', budget: '', goal: '' }); } finally { setSending(false);} };

  return <main className="min-h-screen bg-background text-foreground overflow-x-hidden">
    <SEO title="Google Ads: горячий спрос" description="Поиск, PMax, YouTube и ретаргетинг с оптимизацией по прибыли" url="/google-ads" />
    <Navbar />
    <section className="relative pt-28 pb-14 md:pb-20"><div className="absolute inset-0 bg-gradient-to-br from-secondary/20 via-primary/10 to-accent/20" />
      <div className="relative max-w-6xl mx-auto px-4 space-y-6"><h1 className="text-3xl sm:text-4xl md:text-6xl font-bold">Google Ads для бизнеса, которому нужны клиенты “на сейчас”</h1><p className="text-base md:text-lg text-muted-foreground max-w-4xl">Собираю кампании вокруг горячих намерений пользователя и оптимизирую по фактическим продажам из CRM, чтобы реклама была управляемой и прибыльной.</p><a href="#lead"><Button size="lg" className="w-full sm:w-auto">Получить прогноз CPL/ROAS</Button></a></div>
    </section>
    <section className="max-w-6xl mx-auto px-4 py-8 md:py-12 grid md:grid-cols-3 gap-4">{proof.map((p)=><motion.div key={p.k} whileHover={{ y:-4 }} className="rounded-2xl border bg-card/60 p-5"><p className="text-xs text-primary">{p.k}</p><p className="text-2xl font-bold mt-1">{p.v}</p><p className="text-xs text-muted-foreground mt-1">{p.d}</p></motion.div>)}</section>
    <section className="max-w-6xl mx-auto px-4 py-8 md:py-12"><div className="rounded-3xl border bg-card/50 p-6 md:p-8"><h2 className="text-2xl md:text-3xl font-bold mb-4">Что входит в работу под ключ</h2><ul className="grid md:grid-cols-2 gap-3 text-sm md:text-base text-muted-foreground"><li>• Сбор семантики + карта приоритетов по марже.</li><li>• Структура Search/PMax без внутренней конкуренции кампаний.</li><li>• Ретаргетинг YouTube/КМС с дожимающими офферами.</li><li>• Импорт офлайн-конверсий в Google Ads.</li><li>• Сквозная аналитика CPL/CAC/ROAS/ROMI.</li><li>• План масштабирования после 1-й фазы теста.</li></ul></div></section>
    <section className="max-w-6xl mx-auto px-4 py-8 md:py-12"><h2 className="text-2xl md:text-3xl font-bold mb-4">Социальное доказательство</h2><div className="grid md:grid-cols-2 gap-4"><div className="rounded-2xl border bg-card/60 p-6"><h3 className="font-semibold">B2B услуги</h3><p className="text-sm text-muted-foreground mt-2">После очистки семантики и минус-слов CPL снизился на 30%, а доля целевых обращений выросла.</p></div><div className="rounded-2xl border bg-card/60 p-6"><h3 className="font-semibold">E-commerce</h3><p className="text-sm text-muted-foreground mt-2">Перестроили PMax по категориям маржинальности, получили рост окупаемости и стабильное масштабирование.</p></div></div></section>
    <section id="lead" className="max-w-3xl mx-auto px-4 py-12 md:py-14"><form onSubmit={submit} className="rounded-3xl border bg-card/60 p-6 md:p-8 space-y-4"><h2 className="text-2xl font-bold">Рассчитайте прогноз под вашу нишу</h2><Input required placeholder="Имя" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /><Input required placeholder="Телефон / WhatsApp" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} /><Input placeholder="Сайт / ниша" value={form.niche} onChange={(e)=>setForm({...form,niche:e.target.value})} /><Input placeholder="Месячный бюджет" value={form.budget} onChange={(e)=>setForm({...form,budget:e.target.value})} /><Textarea placeholder="Цель: лиды / продажи / ROAS" value={form.goal} onChange={(e)=>setForm({...form,goal:e.target.value})} /><Button className="w-full" disabled={sending}>{sending?'Отправка...':'Получить расчет'}</Button></form></section>
    <Footer />
  </main>;
}
