import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useIsMobile } from '../components/ui/use-mobile';

type PerformanceMode = 'full' | 'balanced' | 'reduced';

interface PerformanceCapabilities {
  mode: PerformanceMode;
  isMobile: boolean;
  prefersReducedMotion: boolean;
  lowPowerDevice: boolean;
  shouldReduceMotion: boolean;
  allowVideo: boolean;
  allowInteractiveBackground: boolean;
  allowAnimatedBackgrounds: boolean;
  allowTilt: boolean;
  allowStagger: boolean;
  allowBackdropBlur: boolean;
  revealDuration: number;
  revealDistance: number;
}

function getLowPowerHints() {
  if (typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };

  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  const saveData = Boolean(nav.connection?.saveData);
  const slowNetwork = nav.connection?.effectiveType === 'slow-2g' || nav.connection?.effectiveType === '2g';

  return lowMemory || lowCpu || saveData || slowNetwork;
}

export function usePerformanceMode(): PerformanceCapabilities {
  const isMobileValue = useIsMobile();
  const isMobile = Boolean(isMobileValue);
  const prefersReducedMotion = Boolean(useReducedMotion());
  const [lowPowerDevice, setLowPowerDevice] = useState(false);
  const [afterIdle, setAfterIdle] = useState(false);

  useEffect(() => {
    setLowPowerDevice(getLowPowerHints());

    const win = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (win.requestIdleCallback) {
      const idleId = win.requestIdleCallback(() => setAfterIdle(true), { timeout: 1400 });
      return () => win.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(() => setAfterIdle(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return useMemo(() => {
    const shouldReduceMotion = prefersReducedMotion || isMobile || lowPowerDevice;
    const mode: PerformanceMode = prefersReducedMotion || (isMobile && lowPowerDevice)
      ? 'reduced'
      : isMobile || lowPowerDevice
        ? 'balanced'
        : 'full';

    return {
      mode,
      isMobile,
      prefersReducedMotion,
      lowPowerDevice,
      shouldReduceMotion,
      allowVideo: mode === 'full' && afterIdle,
      allowInteractiveBackground: mode === 'full' && afterIdle,
      allowAnimatedBackgrounds: mode !== 'reduced' && afterIdle,
      allowTilt: mode === 'full',
      allowStagger: mode === 'full',
      allowBackdropBlur: mode === 'full',
      revealDuration: shouldReduceMotion ? 0.18 : 0.42,
      revealDistance: shouldReduceMotion ? 8 : 18,
    };
  }, [afterIdle, isMobile, lowPowerDevice, prefersReducedMotion]);
}
