import MarketingCalculator from './MarketingCalculator';

type RoiCalculatorPopupProps = {
  onClose?: () => void;
};

export default function RoiCalculatorPopup({ onClose }: RoiCalculatorPopupProps) {
  return <MarketingCalculator variant={onClose ? 'dialog' : 'page'} initialMode="actual" onClose={onClose} />;
}
