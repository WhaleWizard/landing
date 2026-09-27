// Capture before createRoot replaces the build-time DOM. Only the original
// history entry uses it; SPA visits and the CMS preview retain their entrance.
const generatedRoute = typeof document === 'undefined'
  ? null
  : document.querySelector('[data-ww-first-screen]')?.getAttribute('data-ww-first-screen');
const initialEntryKey = typeof window === 'undefined' ? 'default' : window.history.state?.key || 'default';

export function hasGeneratedFirstScreen(pathname: string, locationKey: string): boolean {
  return locationKey === initialEntryKey && generatedRoute === pathname;
}
