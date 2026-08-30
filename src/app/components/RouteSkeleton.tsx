type RouteSkeletonProps = {
  className?: string;
  variant?: 'page' | 'gate';
};

export default function RouteSkeleton({ className = '', variant = 'page' }: RouteSkeletonProps) {
  if (variant === 'gate') {
    return (
      <div
        className={`relative grid min-h-screen min-h-[100svh] min-h-[100dvh] place-items-center overflow-hidden bg-background px-4 py-10 ${className}`}
        role="status"
        aria-label="Загрузка админки"
      >
        <div className="pointer-events-none absolute -left-24 top-[-5rem] h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-[-6rem] h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative w-full max-w-sm rounded-3xl border border-primary/25 bg-card/60 p-7 shadow-2xl shadow-primary/10 backdrop-blur-xl">
          <div className="premium-skeleton h-12 w-12 rounded-xl" />
          <div className="premium-skeleton mt-7 h-8 w-44 rounded-xl" />
          <div className="premium-skeleton mt-3 h-4 w-56 max-w-full rounded-lg" />
          <div className="premium-skeleton mt-7 h-4 w-20 rounded-lg" />
          <div className="premium-skeleton mt-2 h-12 w-full rounded-xl" />
          <div className="premium-skeleton mt-3 h-11 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-background ${className}`}>
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 md:py-24">
        <div className="space-y-6">
          <div className="premium-skeleton h-8 w-40 rounded-xl" />
          <div className="premium-skeleton h-12 w-full max-w-3xl rounded-2xl" />
          <div className="premium-skeleton h-5 w-full max-w-2xl rounded-lg" />
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="space-y-4 rounded-2xl border border-border/70 bg-card/60 p-6">
              <div className="premium-skeleton h-5 w-24 rounded-full" />
              <div className="premium-skeleton h-7 w-full rounded-lg" />
              <div className="premium-skeleton h-4 w-full rounded-lg" />
              <div className="premium-skeleton h-4 w-5/6 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
