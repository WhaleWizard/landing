import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';

const REGULATED_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH',
]);

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const countryCode = (request.headers.get('CF-IPCountry') || 'XX').toUpperCase();

  return json(
    {
      countryCode,
      requiresConsent: REGULATED_COUNTRIES.has(countryCode),
    },
    {
      headers: {
        'Cache-Control': CACHE_CONTROL.noStore,
      },
    },
  );
};
