interface OrganicLeadSignal {
  marketing_consent?: boolean;
  referrer?: string;
  entry_path?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_id?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  fbclid?: string;
  yclid?: string;
}

const googleHost = /^(?:www\.)?google\.(?:com|[a-z]{2}|(?:com|co)\.[a-z]{2})$/;
const staticEntry = /^\/(?:meta-ads|meta-apps|google-ads|consult|blog|cases|about|faq|calculator|roi-calculator|marketing-glossary)\/?$/;
const articleEntry = /^\/(?:blog|cases)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

export function googleOrganicLandingPath(signal: OrganicLeadSignal): string {
  const path = signal.entry_path || '';
  if (!signal.marketing_consent || path.length > 240
    || signal.gclid || signal.wbraid || signal.gbraid || signal.fbclid || signal.yclid) return '';
  const staticPath = staticEntry.test(path);
  if (path !== '/' && !staticPath && !articleEntry.test(path)) return '';

  const source = signal.utm_source?.trim().toLowerCase();
  const medium = signal.utm_medium?.trim().toLowerCase();
  if (source !== 'google' || medium !== 'organic') {
    if (source || medium || signal.utm_campaign || signal.utm_id) return '';
    try {
      const referrer = new URL(signal.referrer || '');
      if (referrer.protocol !== 'https:' || !googleHost.test(referrer.hostname)
        || !['/', '/search', '/url'].includes(referrer.pathname)) return '';
    } catch {
      return '';
    }
  }
  if (path === '/') return path;
  return path.replace(/\/$/, '') + (staticPath ? '/' : '');
}
