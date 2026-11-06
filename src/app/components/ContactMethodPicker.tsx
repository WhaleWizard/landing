import { useId } from 'react';
import { PlatformMark } from './brand/PlatformMark';

export type ContactMethod = 'telegram' | 'whatsapp';

const methods = [['telegram', 'Telegram'], ['whatsapp', 'WhatsApp']] as const;

export default function ContactMethodPicker({ value, onChange }: {
  value: ContactMethod;
  onChange: (method: ContactMethod) => void;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className="mb-2 text-sm font-medium">Предпочитаемый способ связи</p>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {methods.map(([method, label]) => (
          <button
            key={method}
            type="button"
            aria-pressed={value === method}
            onClick={() => onChange(method)}
            className="flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-background/50 px-2 text-[13px] font-semibold text-foreground transition-colors hover:border-violet-500/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 aria-pressed:border-violet-500 aria-pressed:bg-violet-500/20 aria-pressed:shadow-lg aria-pressed:shadow-violet-500/20 motion-reduce:transition-none min-[360px]:gap-2 min-[360px]:text-sm sm:text-base"
          >
            <PlatformMark platform={method} tone="color" size={19} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
