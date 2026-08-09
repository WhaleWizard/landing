type ArticlesLoadErrorProps = {
  onRetry: () => Promise<void>;
  className?: string;
};

export default function ArticlesLoadError({ onRetry, className = '' }: ArticlesLoadErrorProps) {
  return (
    <div role="alert" className={`rounded-2xl border border-amber-400/30 bg-amber-400/[0.07] p-6 text-center ${className}`}>
      <h2 className="text-lg font-semibold text-foreground">Материалы временно не загрузились</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Сайт не подменяет актуальные публикации старой копией. Проверьте соединение и попробуйте ещё раз.
      </p>
      <button
        type="button"
        onClick={() => { void onRetry().catch(() => undefined); }}
        className="mt-4 rounded-xl border border-primary/40 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
      >
        Повторить загрузку
      </button>
    </div>
  );
}
