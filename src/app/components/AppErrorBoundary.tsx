import React, { type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] render crash', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0f', color: '#f5f5f7', padding: 24, textAlign: 'center' }}>
        <div>
          <h1 style={{ marginBottom: 12 }}>Страница не загрузилась</h1>
          <p style={{ opacity: 0.85, marginBottom: 16 }}>Похоже, произошёл технический сбой. Попробуйте обновить страницу.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #3b82f6', background: '#111116', color: '#f5f5f7', cursor: 'pointer' }}>
            Обновить страницу
          </button>
        </div>
      </div>
    );
  }
}
