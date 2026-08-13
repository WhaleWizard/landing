import { memo, useEffect, useRef } from 'react';
import {
  SCROLL_ACTIVITY_END_EVENT,
  SCROLL_ACTIVITY_START_EVENT,
} from '../utils/motionPerformance';

const SCROLL_IDLE_DELAY_MS = 160;

type ScrollExperienceProps = {
  showTrail?: boolean;
  routeKey: string;
};

function ScrollExperience({ showTrail = true, routeKey }: ScrollExperienceProps) {
  const progressRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let idleTimer = 0;
    let scrolling = false;

    const updateProgress = () => {
      frame = 0;
      const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
      const progress = maxScroll > 0
        ? Math.min(1, Math.max(0, window.scrollY / maxScroll))
        : 0;
      progressRef.current?.style.setProperty('--ww-scroll-progress', String(progress));
    };

    const scheduleProgressUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };

    const finishScroll = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = 0;
      if (!scrolling) return;
      scrolling = false;
      delete root.dataset.wwScrolling;
      document.dispatchEvent(new Event(SCROLL_ACTIVITY_END_EVENT));
      scheduleProgressUpdate();
    };

    const handleScroll = () => {
      if (!scrolling) {
        scrolling = true;
        root.dataset.wwScrolling = 'true';
        document.dispatchEvent(new Event(SCROLL_ACTIVITY_START_EVENT));
      }
      scheduleProgressUpdate();
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(finishScroll, SCROLL_IDLE_DELAY_MS);
    };

    updateProgress();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', scheduleProgressUpdate, { passive: true });

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleProgressUpdate);
    resizeObserver?.observe(root);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (idleTimer) window.clearTimeout(idleTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', scheduleProgressUpdate);
      if (scrolling) {
        delete root.dataset.wwScrolling;
        document.dispatchEvent(new Event(SCROLL_ACTIVITY_END_EVENT));
      }
    };
  }, []);

  if (!showTrail) return null;

  return (
    <div className="ww-scroll-trail" aria-hidden="true">
      <span ref={progressRef} className="ww-scroll-trail__progress" />
      <span key={routeKey} className="ww-scroll-trail__route-sheen" />
    </div>
  );
}

export default memo(ScrollExperience);
