import { AlertTriangle, Info } from 'lucide-react';

/**
 * Сообщение формы в стиле сайта — вместо системного окна браузера.
 *
 * До этого формы звали `alert()`: серое окно вверху экрана, чужой шрифт, адрес
 * сайта над текстом, страница заблокирована до нажатия «ОК». Оно не подчиняется
 * тёмной теме и, главное, закрывает собой ту самую форму, о которой говорит —
 * человек не видит, что именно исправить.
 *
 * Блок появляется прямо в форме, рядом с кнопкой отправки, и повторяет
 * оформление уже существующего сообщения о непройденной проверке «я не робот».
 */

export type FormNoticeTone = 'error' | 'info';

export interface FormNoticeData {
  tone: FormNoticeTone;
  title: string;
  text?: string;
}

export default function FormNotice({ notice }: { notice: FormNoticeData | null }) {
  if (!notice) return null;

  const isError = notice.tone === 'error';
  const Icon = isError ? AlertTriangle : Info;

  return (
    <div
      // role="alert" — экранный диктор прочитает сообщение сразу, как это делало
      // системное окно, но без блокировки страницы.
      role="alert"
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${
        isError
          ? 'border-destructive/40 bg-destructive/10'
          : 'border-primary/40 bg-primary/10'
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 h-5 w-5 shrink-0 ${isError ? 'text-destructive' : 'text-primary'}`}
      />
      <div className="min-w-0">
        <p className="font-medium">{notice.title}</p>
        {notice.text ? <p className="mt-1 text-muted-foreground">{notice.text}</p> : null}
      </div>
    </div>
  );
}
