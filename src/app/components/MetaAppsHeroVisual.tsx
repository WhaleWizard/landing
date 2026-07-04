import { memo } from 'react';

type MetaAppsHeroVisualProps = {
  inView: boolean;
};

const MetaAppsHeroVisual = memo((_props: MetaAppsHeroVisualProps) => {
  return <div className="order-1 lg:order-2 h-[430px] sm:h-[500px] md:h-[620px] lg:h-[660px]" />;
});

MetaAppsHeroVisual.displayName = 'MetaAppsHeroVisual';

export default MetaAppsHeroVisual;
