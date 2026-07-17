import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';

type NavigationState = {
  from?: string;
};

function getSameOriginReferrer(currentPath: string): string | null {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.referrer) return null;

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return null;
    const target = `${referrer.pathname}${referrer.search}${referrer.hash}`;
    return referrer.pathname !== currentPath ? target : null;
  } catch {
    return null;
  }
}

export function useOriginAwareBack(fallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();
  const stateFrom = (location.state as NavigationState | null)?.from;
  const referrer = useMemo(() => getSameOriginReferrer(location.pathname), [location.pathname]);
  const explicitTarget = stateFrom?.startsWith('/') && stateFrom !== location.pathname ? stateFrom : null;
  const hasOrigin = Boolean(explicitTarget || referrer);

  const goBack = useCallback(() => {
    if (explicitTarget) {
      navigate(explicitTarget);
      return;
    }

    if (referrer && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallback);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [explicitTarget, fallback, navigate, referrer]);

  return {
    goBack,
    label: hasOrigin ? 'Назад' : 'На главную',
  };
}
