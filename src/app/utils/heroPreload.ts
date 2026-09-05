import { memoizedImport } from './memoizedImport';

// Shared by bootstrap and the actual first-screen consumers. Keep this small
// registry separate from routePreload: importing heroes must not pull the whole
// route graph (including admin) into the build-time content extractor.
export const loadHero = memoizedImport(() => import('../components/Hero'));
export const loadCosmicHeroScene = memoizedImport(() => import('../components/CosmicHeroScene'));
export const loadMetaAppsHeroVisual = memoizedImport(() => import('../components/MetaAppsHeroVisual'));
export const loadConsultStudioHero = memoizedImport(() => import('../components/service-heroes/ConsultStudioHero'));
export const loadMetaAdsEditorialHero = memoizedImport(() => import('../components/service-heroes/MetaAdsEditorialHero'));
