import 'react';

declare module 'react' {
  interface ImgHTMLAttributes<T> {
    /** React 18 forwards the browser attribute only without a development warning in lowercase. */
    fetchpriority?: 'high' | 'low' | 'auto';
  }
}
