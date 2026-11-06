import type { CSSProperties } from 'react';
import './platform-marks.css';

const colors = {
  telegram: '#3ebbf5', instagram: '#fb648a', youtube: '#ff4649', x: '#c1d4fa',
  threads: '#bf9eff', tiktok: '#52e8e7', gmail: '#ea5d60', whatsapp: '#46d98a',
  meta: '#5ba1ff', facebook: '#5b98ff', ads: '#80aaff', search: '#6b9dff',
  analytics: '#ffae42', tag: '#7ba8ff', play: '#56d5a5', apple: '#c4cef0',
} as const;

export type Platform = keyof typeof colors;
export type PlatformTone = 'white' | 'color';

const multicolor = new Set<Platform>(['ads', 'search', 'analytics']);
const directory = '/images/brand/platforms/';

export function PlatformMark({ platform, tone = 'white', size = 20 }: {
  platform: Platform;
  tone?: PlatformTone;
  size?: number;
}) {
  const style = {
    '--platform-color': colors[platform],
    '--platform-mask': `url("${directory}${platform}.svg")`,
    '--platform-size': `${size}px`,
  } as CSSProperties;

  return (
    <span className="platform-mark" data-platform={platform} data-tone={tone} aria-hidden="true" style={style}>
      {tone === 'color' && multicolor.has(platform) ? (
        <img src={`${directory}${platform}-color.png`} alt="" width={size} height={size} decoding="async" />
      ) : <span className="platform-mark__ink" />}
    </span>
  );
}

const googleTools = [
  ['ads', 'Google Ads'], ['search', 'Поиск'], ['youtube', 'YouTube'], ['analytics', 'GA4'], ['tag', 'GTM'],
] as const;
const metaPlacements = [['instagram', 'Instagram'], ['facebook', 'Facebook']] as const;
const appStores = [['play', 'Google Play'], ['apple', 'App Store']] as const;

export function PlatformStrip({ group }: { group: 'google' | 'meta' | 'apps' }) {
  const platforms = group === 'google' ? googleTools : group === 'meta' ? metaPlacements : appStores;
  return (
    <ul className="platform-strip" data-group={group} aria-label="Площадки и инструменты">
      {platforms.map(([platform, label]) => (
        <li key={platform}>
          <PlatformMark platform={platform} tone={group === 'google' ? 'color' : 'white'} size={group === 'google' ? 22 : 16} />
          {label}
        </li>
      ))}
    </ul>
  );
}
