import { memoizedImport } from './memoizedImport';
import { loadCosmicHeroScene, loadMetaAppsHeroVisual } from './heroVisualPreload';

export { loadCosmicHeroScene, loadMetaAppsHeroVisual };
export const loadHero = memoizedImport(() => import('../components/Hero'));
export const loadConsultStudioHero = memoizedImport(() => import('../components/service-heroes/ConsultStudioHero'));
export const loadMetaAdsEditorialHero = memoizedImport(() => import('../components/service-heroes/MetaAdsEditorialHero'));
