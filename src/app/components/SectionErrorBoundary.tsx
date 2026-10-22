import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

export type SectionErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  anchorId?: string;
  onRetry?: () => void;
};

export type SectionErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  retryKey: number;
};

/**
 * Catches dynamic chunk fetch failures and runtime errors within below-the-fold
 * deferred sections. Prevents network hiccup rejections from bubbling to
 * RouteErrorBoundary (which would destroy the entire page and unmount the Hero).
 * Automatically retries loading when the browser comes back online.
 */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    retryKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<SectionErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn(
      `[section-error-boundary] caught section error (anchor: ${this.props.anchorId || 'unknown'}):`,
      error.message,
      info,
    );
  }

  componentDidMount(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
  }

  componentWillUnmount(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
  }

  private handleOnline = (): void => {
    if (this.state.hasError) {
      this.retry();
    }
  };

  retry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: undefined,
      retryKey: prev.retryKey + 1,
    }));
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="relative w-full">
          {this.props.fallback}
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-background/85 backdrop-blur-[2px] z-10 text-center"
          >
            <p className="text-sm md:text-base text-muted-foreground mb-3 font-medium max-w-md">
              Не удалось загрузить раздел из-за нестабильного соединения.
            </p>
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-sm font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Попробовать снова
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={`section-try-${this.state.retryKey}`} className="contents">
        {this.props.children}
      </div>
    );
  }
}

export default SectionErrorBoundary;
