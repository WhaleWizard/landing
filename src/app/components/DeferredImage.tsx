import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

type DeferredImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  /** Начинать загрузку немного до появления изображения, чтобы оно успело декодироваться. */
  rootMargin?: string;
};

/**
 * Native loading="lazy" в Chromium намеренно имеет большой preload-порог и на
 * длинных лентах может сразу скачать десятки тяжёлых обложек. Здесь URL вообще
 * не попадает в DOM до приближения карточки к viewport; само изображение,
 * размеры и эффекты карточки при этом остаются прежними.
 */
export default function DeferredImage({
  src,
  rootMargin = '320px 0px',
  loading = 'lazy',
  fetchPriority,
  ...props
}: DeferredImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const eager = loading === 'eager' || fetchPriority === 'high';
  const [shouldLoad, setShouldLoad] = useState(eager);

  useEffect(() => {
    if (eager || typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const image = imageRef.current;
    if (!image) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin },
    );
    observer.observe(image);
    return () => observer.disconnect();
  }, [eager, rootMargin, src]);

  return (
    <img
      {...props}
      ref={imageRef}
      src={shouldLoad ? src : undefined}
      data-deferred-src={shouldLoad ? undefined : src}
      loading={loading}
      fetchpriority={fetchPriority}
    />
  );
}
