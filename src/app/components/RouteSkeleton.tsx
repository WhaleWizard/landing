type RouteSkeletonProps = {
  className?: string;
};

export default function RouteSkeleton({ className = '' }: RouteSkeletonProps) {
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
