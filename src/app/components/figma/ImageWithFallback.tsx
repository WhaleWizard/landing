import { useEffect, useState } from 'react';

interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallback?: string;
}

export function ImageWithFallback({ src, alt, fallback = '/og-image-v2.jpg', srcSet, sizes, ...props }: ImageWithFallbackProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  useEffect(() => {
    setImgSrc(src);
    setFallbackFailed(false);
  }, [fallback, src]);

  const handleError = () => {
    if (imgSrc !== fallback) {
      setImgSrc(fallback);
      return;
    }
    setFallbackFailed(true);
  };

  // If even the bundled fallback cannot load, leave the surrounding gradient
  // intact instead of displaying the browser's broken-image icon.
  if (fallbackFailed) return null;

  // Набор вариантов описывает исходную картинку. После подмены на запасной
  // файл он должен исчезнуть: иначе браузер продолжил бы выбирать из
  // битого набора и никогда не показал бы запасной `src`.
  const usingFallback = imgSrc === fallback && src !== fallback;

  return (
    <img
      src={imgSrc}
      srcSet={usingFallback ? undefined : srcSet}
      sizes={usingFallback ? undefined : sizes}
      alt={alt}
      onError={handleError}
      loading="lazy"
      decoding="async"
      {...props}
    />
  );
}
