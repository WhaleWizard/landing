import type { ServiceType } from '../pages/ServiceLandingPage';
import type { ContentFontId, NormalizedContentTypography } from '../utils/contentTypography';
import type { HeroTitleEffect, HeroTitleEffectSpeed, HeroTitleLineSize } from '../components/HeroTitleEffect';

export type TypographySettings = NormalizedContentTypography;

export type IntroContent = {
  badge: string;
  titlePrefix: string;
  titleAccent: string;
  description: string;
  typography: TypographySettings;
};

export type EditableContent = {
  seo: { title: string; description: string };
  hero: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    titleLines: Array<{
      text: string;
      tone?: 'accent' | 'supporting';
      font?: ContentFontId;
      effect?: HeroTitleEffect;
      speed?: HeroTitleEffectSpeed;
      size?: HeroTitleLineSize;
    }>;
    paragraphs: string[];
    primaryButton: string;
    secondaryButton: string;
    stats: Array<{ value: string; label: string }>;
    typography: TypographySettings;
    titleAnimation: {
      effect: HeroTitleEffect;
      speed: HeroTitleEffectSpeed;
      delayMs: number;
    };
  };
  services: IntroContent & {
    cards: Array<{ title: string; description: string; features: string[]; visualSlot: number }>;
    detailed: {
      title: string;
      button: string;
      sections: Array<{ title: string; text: string; visualSlot: number }>;
    };
  };
  cases: IntroContent & {
    items: Array<{ title: string; category: string; description: string; stats: Array<{ label: string; value: string }>; visualSlot: number }>;
  };
  cta: {
    badge: string;
    title: string;
    description: string;
    button: string;
    typography: TypographySettings;
  };
  testimonials: IntroContent & {
    stats: Array<{ value: string; label: string }>;
    items: Array<{ name: string; company: string; position: string; text: string }>;
  };
  contact: IntroContent & {
    bullets: string[];
    benefits: Array<{ title: string; description: string }>;
  };
};

export type EditorPage = ServiceType | 'home';
export type EditorSection = 'seo' | 'hero' | 'services' | 'cases' | 'cta' | 'testimonials' | 'contact';
