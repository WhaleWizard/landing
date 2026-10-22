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

  // WebP-копии лежат в public (72x54 для 3x экранов) и весят по ~1 КБ вместо тяжёлых SVG (F-117).
  const source = `/images/country-flags/${normalized.toLowerCase()}.webp`;
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
