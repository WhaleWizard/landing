import type { ReactNode } from 'react';
import type { HeroTitleAnimation, HeroTitleLine } from '../components/HeroTitleEffect';
import type { ContentTypography } from '../utils/contentTypography';

export type HeroStat = { value: string; label: string };

export type HeroContent = {
  badge: string;
  titlePrefix: ReactNode;
  titleAccent: ReactNode;
  titleLines?: HeroTitleLine[];
  paragraphs: ReactNode[];
  primaryButton: string;
  secondaryButton: string;
  stats: HeroStat[];
  typography?: ContentTypography;
  titleAnimation?: HeroTitleAnimation;
};

export type HeroVisual = 'default' | 'meta-apps' | 'portrait' | 'cosmic';
