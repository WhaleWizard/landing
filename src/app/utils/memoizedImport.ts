export type MemoizedLoader<T> = (() => Promise<T>) & {
  /** Fulfilled value for a synchronous first render after preloading. */
  resolved?: T;
};

/** Share both the pending promise and fulfilled value; failures stay retryable. */
export function memoizedImport<T>(loader: () => Promise<T>): MemoizedLoader<T> {
  let pending: Promise<T> | undefined;
  const load = (() => {
    if (pending) return pending;
    pending = loader().then(
      (value) => {
        load.resolved = value;
        return value;
      },
      (error) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  }) as MemoizedLoader<T>;
  return load;
}
