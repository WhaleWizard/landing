import { memoizedImport } from './memoizedImport';

export const loadCosmicHeroScene = memoizedImport(() => import('../components/CosmicHeroScene'));
export const loadMetaAppsHeroVisual = memoizedImport(() => import('../components/MetaAppsHeroVisual'));
