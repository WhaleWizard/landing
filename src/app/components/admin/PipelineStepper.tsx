export type PipelineStage = 'new' | 'contacted' | 'discovery' | 'proposal' | 'won' | 'lost' | 'archived';

interface PipelineStepperProps {
  stage: PipelineStage;
  className?: string;
}

export function stageStep(stage: PipelineStage): { step: number; isClosed: boolean; isWon: boolean } {
  switch (stage) {
    case 'new': return { step: 1, isClosed: false, isWon: false };
    case 'contacted': return { step: 2, isClosed: false, isWon: false };
    case 'discovery': return { step: 3, isClosed: false, isWon: false };
    case 'proposal': return { step: 4, isClosed: false, isWon: false };
    case 'won': return { step: 5, isClosed: true, isWon: true };
    case 'lost': return { step: 0, isClosed: true, isWon: false };
    case 'archived': return { step: 0, isClosed: true, isWon: false };
    default: return { step: 1, isClosed: false, isWon: false };
  }
}

export function isDealStale(
  stage: PipelineStage,
  lastActivity?: string | null,
  nextActionAt?: string | null
): { isStale: boolean; days: number } {
  const openStages: PipelineStage[] = ['new', 'contacted', 'discovery', 'proposal'];
  if (!openStages.includes(stage)) return { isStale: false, days: 0 };
  if (nextActionAt && new Date(nextActionAt).getTime() >= Date.now()) {
    return { isStale: false, days: 0 };
  }
  if (!lastActivity) return { isStale: false, days: 0 };
  const diff = Date.now() - new Date(lastActivity).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return { isStale: days >= 3, days };
}

export default function PipelineStepper({ stage, className = '' }: PipelineStepperProps) {
  const { step, isClosed, isWon } = stageStep(stage);
  const statusClass = isWon ? 'is-won' : isClosed ? 'is-closed' : `step-${step}`;

  return (
    <div
      className={`admin-pipeline-stepper ${statusClass} ${className}`.trim()}
      title={`Воронка: шаг ${step} из 5`}
      aria-hidden="true"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`admin-pipeline-stepper__bar${step >= i ? ' is-active' : ''}`}
        />
      ))}
    </div>
  );
}
