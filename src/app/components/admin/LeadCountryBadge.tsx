import CountryFlag, { getCountryDisplayName, normalizeCountryCode } from '../CountryFlag';

export default function LeadCountryBadge({ country, showCode = false }: { country?: string | null; showCode?: boolean }) {
  const code = normalizeCountryCode(country);
  if (!code) return null;

  const name = getCountryDisplayName(code);
  return (
    <span
      className="admin-country-badge"
      title={`Страна заявки: ${name} (${code}). Определена Cloudflare по сети в момент отправки; IP не хранится.`}
    >
      <CountryFlag countryCode={code} />
      <span className="admin-country-badge__name">{name}</span>
      {showCode && name !== code ? <small>{code}</small> : null}
    </span>
  );
}
