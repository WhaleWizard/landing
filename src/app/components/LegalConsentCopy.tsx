import { memo } from 'react';

interface LegalConsentCopyProps {
  onPrivacyClick: () => void;
  onOfferClick: () => void;
  className?: string;
  id?: string;
}

function LegalConsentCopy({ onPrivacyClick, onOfferClick, className = '', id }: LegalConsentCopyProps) {
  const textClassName = [
    'legal-consent-copy text-[11px] sm:text-xs text-muted-foreground leading-[1.55] sm:leading-[1.6]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const linkClassName =
    'legal-consent-link text-primary font-medium underline-offset-2 decoration-primary/35 hover:underline bg-transparent border-0 p-0 cursor-pointer text-left align-baseline';

  return (
    <p id={id} className={textClassName}>
      Я даю согласие на обработку моих персональных данных для обработки заявки и обратной связи со мной в соответствии с{' '}
      <button type="button" onClick={onPrivacyClick} className={linkClassName}>
        Политикой конфиденциальности и обработки персональных данных
      </button>{' '}
      и подтверждаю ознакомление с{' '}
      <button type="button" onClick={onOfferClick} className={linkClassName}>
        Публичной офертой
      </button>
      .
    </p>
  );
}

export default memo(LegalConsentCopy);
