/**
 * Один запрос `/api/geo` на страницу.
 *
 * Регион нужен двоим: согласию на cookie (показывать ли баннер) и форме
 * (подставить код страны в телефон). Каждый ходил на сервер сам, и на боевом
 * сайте `/api/geo` уезжал дважды на каждом заходе. Ответ здесь один и общий;
 * неудача не запоминается, чтобы следующий вызов мог попробовать снова.
 */

export type GeoPayload = {
  countryCode?: string;
  requiresConsent?: boolean;
};

let pending: Promise<GeoPayload | null> | null = null;

export function fetchGeoPayload(): Promise<GeoPayload | null> {
  if (pending) return pending;
  const request = fetch('/api/geo', { method: 'GET', credentials: 'omit' })
    .then((response) => (response.ok ? (response.json() as Promise<GeoPayload>) : null))
    .catch(() => null)
    .then((data) => {
      if (!data) pending = null;
      return data;
    });
  pending = request;
  return request;
}
