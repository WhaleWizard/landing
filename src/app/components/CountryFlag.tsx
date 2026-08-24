import { useEffect, useState } from 'react';

type CountryFlagProps = {
  countryCode?: string | null;
  className?: string;
  alt?: string;
};

let russianRegionNames: Intl.DisplayNames | null | undefined;

export function normalizeCountryCode(countryCode?: string | null): string {
  const normalized = String(countryCode || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) && normalized !== 'XX' ? normalized : '';
}

export function getCountryDisplayName(countryCode?: string | null): string {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return '';

  if (russianRegionNames === undefined) {
    try {
      russianRegionNames = new Intl.DisplayNames(['ru'], { type: 'region' });
    } catch {
      russianRegionNames = null;
    }
  }

  try {
    return russianRegionNames?.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

export default function CountryFlag({ countryCode, className = '', alt = '' }: CountryFlagProps) {
  const normalized = normalizeCountryCode(countryCode);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [normalized]);

  if (!normalized) return null;

  // SVG лежат в public и попадают в production как обычные статические файлы.
  // Так форма загружает только выбранный флаг, а не карту всех стран в JS.
  const source = `/images/country-flags/${normalized.toLowerCase()}.svg`;
  if (loadFailed) {
    return <span className={`country-flag country-flag--fallback ${className}`.trim()} aria-label={alt || normalized}>{normalized}</span>;
  }

  return (
    <img
      src={source}
      width="24"
      height="18"
      className={`country-flag ${className}`.trim()}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      decoding="async"
      loading="lazy"
      onError={() => setLoadFailed(true)}
    />
  );
}
