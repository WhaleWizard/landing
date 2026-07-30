import MarketingCalculator from './MarketingCalculator';

type BudgetCalculatorPopupProps = {
  onClose: () => void;
};

export default function BudgetCalculatorPopup({ onClose }: BudgetCalculatorPopupProps) {
  return <MarketingCalculator variant="dialog" initialMode="quote" onClose={onClose} />;
}
